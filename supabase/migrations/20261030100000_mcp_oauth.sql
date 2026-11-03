-- OAuth clients are untrusted even when they use the Data API directly.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table private.mcp_clients (
  client_id text primary key,
  resource text not null check (resource ~ '^https://'),
  enabled boolean not null default false
);
revoke all on private.mcp_clients from public, anon, authenticated;

-- The session check makes grant revocation effective before JWT expiry too.
create function private.mcp_access_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.mcp_clients c join auth.sessions s
      on s.oauth_client_id::text = c.client_id
    where c.enabled and c.client_id = auth.jwt()->>'client_id'
      and s.id::text = auth.jwt()->>'session_id' and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
      and auth.jwt()->'aud' @> jsonb_build_array('authenticated', c.resource)
      and (auth.jwt()->>'exp')::numeric > extract(epoch from now())
  )
$$;
revoke all on function private.mcp_access_allowed() from public, anon;
grant execute on function private.mcp_access_allowed() to authenticated;

-- Register this hook in Supabase Auth. Each pre-registered client has exactly
-- one resource; tokens for other clients keep their ordinary audience.
create function public.mcp_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare resource text; claims jsonb := event->'claims';
begin
  select c.resource into resource from private.mcp_clients c
    where c.enabled and c.client_id = coalesce(event->>'client_id', claims->>'client_id');
  if resource is not null then
    -- Keep Supabase's PostgREST audience and add the MCP resource. Replacing
    -- `authenticated` would make ordinary Data API requests fail JWT checks.
    claims := jsonb_set(claims, '{aud}', jsonb_build_array('authenticated', resource));
  end if;
  return jsonb_build_object('claims', claims);
end $$;
revoke all on function public.mcp_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.mcp_access_token_hook(jsonb) to supabase_auth_admin;

-- Restrictive policies are ANDed with existing ownership/visibility policies.
-- No request-controlled bypass flag is used. Only the dedicated definer RPC
-- below may insert for an OAuth caller.
do $$
declare t text;
begin
  foreach t in array array['profiles','daily_goals','foods','food_versions','quantities','product_details','recipe_parts','intakes'] loop
    execute format('create policy oauth_no_insert on public.%I as restrictive for insert to authenticated with check ((select auth.jwt()->>''client_id'') is null)', t);
    execute format('create policy oauth_no_update on public.%I as restrictive for update to authenticated using ((select auth.jwt()->>''client_id'') is null) with check ((select auth.jwt()->>''client_id'') is null)', t);
    execute format('create policy oauth_no_delete on public.%I as restrictive for delete to authenticated using ((select auth.jwt()->>''client_id'') is null)', t);
    execute format('create policy oauth_read_gate on public.%I as restrictive for select to authenticated using ((select auth.jwt()->>''client_id'') is null or (select private.mcp_access_allowed()))', t);
  end loop;
end $$;
create policy oauth_no_profiles on public.profiles as restrictive for select to authenticated
  using ((select auth.jwt()->>'client_id') is null);

create function public.mcp_check_access() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.mcp_access_allowed()
$$;
revoke all on function public.mcp_check_access() from public, anon;
grant execute on function public.mcp_check_access() to authenticated;

create table private.mcp_food_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null,
  proposal jsonb not null,
  food_id uuid not null references public.foods(id),
  primary key(user_id, request_key)
);
revoke all on private.mcp_food_requests from public, anon, authenticated;

create function public.mcp_create_food(p_proposal jsonb, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); prior private.mcp_food_requests;
  food uuid; version uuid; normalized jsonb; assumptions jsonb;
  carbs numeric; fats numeric; proteins numeric; energy numeric; estimated boolean;
begin
  if uid is null or not private.mcp_access_allowed() then
    raise exception using errcode = '42501', message = 'OAuth access denied or revoked';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception using errcode = '22023', message = 'Invalid idempotency key';
  end if;
  if jsonb_typeof(p_proposal) is distinct from 'object' or
    (p_proposal - array['name','carbs_g','fats_g','proteins_g','estimated','assumptions']) <> '{}'::jsonb or
    jsonb_typeof(p_proposal->'name') is distinct from 'string' or
    length(btrim(p_proposal->>'name')) not between 1 and 200 or
    jsonb_typeof(p_proposal->'estimated') is distinct from 'boolean' or
    jsonb_typeof(p_proposal->'carbs_g') is distinct from 'number' or
    jsonb_typeof(p_proposal->'fats_g') is distinct from 'number' or
    jsonb_typeof(p_proposal->'proteins_g') is distinct from 'number' then
    raise exception using errcode = '22023', message = 'Invalid food proposal';
  end if;
  carbs := round((p_proposal->>'carbs_g')::numeric, 3);
  fats := round((p_proposal->>'fats_g')::numeric, 3);
  proteins := round((p_proposal->>'proteins_g')::numeric, 3);
  if least(carbs, fats, proteins) < 0 or greatest(carbs, fats, proteins) > 100 or carbs + fats + proteins > 100 then
    raise exception using errcode = '22023', message = 'Macros must fit in 100 g';
  end if;
  estimated := (p_proposal->>'estimated')::boolean;
  assumptions := p_proposal->'assumptions';
  if jsonb_typeof(assumptions) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Assumptions must be an array';
  end if;
  if jsonb_array_length(assumptions) > 20 or (estimated and jsonb_array_length(assumptions) = 0) or exists (
    select 1 from jsonb_array_elements(assumptions) a
    where jsonb_typeof(a) <> 'string' or length(btrim(a#>>'{}')) not between 1 and 1000
  ) then
    raise exception using errcode = '22023', message = 'Invalid assumptions';
  end if;
  energy := round(carbs * 4 + proteins * 4 + fats * 9, 1);
  normalized := jsonb_build_object('name', btrim(p_proposal->>'name'), 'carbs_g', carbs,
    'fats_g', fats, 'proteins_g', proteins, 'estimated', estimated, 'assumptions', assumptions);
  -- Serialize this user/key pair, including concurrent first requests.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select * into prior from private.mcp_food_requests where user_id = uid and request_key = p_idempotency_key;
  if found then
    if prior.proposal <> normalized then
      raise exception using errcode = '22023', message = 'Idempotency key reused with different content';
    end if;
    food := prior.food_id;
  else
    -- Reuse the normal snapshot creator and its automatic 1 g portion. As a
    -- definer this call bypasses RLS, with all unsafe arguments fixed here.
    food := public.save_food_snapshot(normalized->>'name', false,
      jsonb_build_array(jsonb_build_object('quantity_number', 100, 'quantity_unit', 'g',
        'is_reference', true, 'energy_kcal', energy, 'carbs_g', carbs,
        'fats_g', fats, 'proteins_g', proteins)), null, null,
      case when estimated then 'AI estimate' else 'AI provided' end,
      jsonb_build_object('estimated', estimated, 'assumptions', assumptions, 'origin', 'ChatGPT'), null);
    insert into private.mcp_food_requests values (uid, p_idempotency_key, normalized, food);
  end if;
  -- Return the immutable original version, even if edited later in Nutrifit.
  select v.id into version from public.food_versions v where v.food_id = food and v.version_number = 1;
  return jsonb_build_object('food_id', food, 'version_id', version, 'is_public', false,
    'proposal', normalized, 'energy_kcal', energy,
    'portions', (select jsonb_agg(to_jsonb(q) order by q.quantity_number desc)
      from public.quantities q where q.food_version_id = version));
end $$;
revoke all on function public.mcp_create_food(jsonb, text) from public, anon;
grant execute on function public.mcp_create_food(jsonb, text) to authenticated;

drop function public.journal_food_ids(text, text, integer, integer, text);
create function public.journal_food_ids(
  p_term text default '',
  p_sort text default 'recent',
  p_offset integer default 0,
  p_limit integer default 20,
  p_barcode text default null,
  p_visibility text default 'all'
) returns table(food_id uuid)
language sql stable security invoker set search_path = '' as $$
  select f.id
  from public.foods f
  join public.food_versions v on v.food_id = f.id and v.is_current
  left join lateral (
    select max(i.consumed_at) as last_used
    from public.intakes i
    join public.food_versions used_version on used_version.id = i.food_version_id
    where used_version.food_id = f.id and i.user_id = (select auth.uid())
  ) last_intake on true
  where (p_visibility = 'all' or (p_visibility = 'personal' and f.author_id = auth.uid()) or (p_visibility = 'public' and f.is_public))
    and ((p_barcode is null and v.name ilike '%' || replace(replace(replace(btrim(p_term), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%' escape chr(92))
     or (p_barcode is not null and f.is_public and exists (
       select 1 from public.product_details d where d.food_version_id = v.id and d.barcode = p_barcode
     ))
    )
  order by
    case when p_sort = 'recent' then last_intake.last_used end desc nulls last,
    case when p_sort = 'newest' then f.created_at end desc nulls last,
    case when p_sort = 'asc' then v.name end asc nulls last,
    case when p_sort = 'desc' then v.name end desc nulls last,
    f.created_at desc, f.id
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.journal_food_ids(text, text, integer, integer, text, text) from public;
grant execute on function public.journal_food_ids(text, text, integer, integer, text, text) to authenticated;

create function public.mcp_get_food(p_food_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(f) || jsonb_build_object('version', to_jsonb(v),
    'portions', coalesce((select jsonb_agg(to_jsonb(q) order by q.quantity_number desc)
      from public.quantities q where q.food_version_id = v.id), '[]'::jsonb),
    'provenance', (select to_jsonb(d) from public.product_details d where d.food_version_id = v.id),
    'parts', coalesce((select jsonb_agg(to_jsonb(rp) || jsonb_build_object(
      'ingredient', (select to_jsonb(iv) from public.food_versions iv where iv.id = rp.ingredient_version_id),
      'portion', (select to_jsonb(q) from public.quantities q where q.id = rp.quantity_id)))
      from public.recipe_parts rp where rp.recipe_version_id = v.id), '[]'::jsonb))
  from public.foods f join public.food_versions v on v.food_id = f.id and v.is_current
  where f.id = p_food_id
$$;

create function public.mcp_search_foods(
  p_term text default '', p_visibility text default 'all', p_sort text default 'asc',
  p_offset integer default 0, p_limit integer default 20
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare items jsonb; more boolean;
begin
  if p_term is null or length(p_term) > 200 or p_visibility is null or p_sort is null or
    p_visibility not in ('all','personal','public') or p_sort not in ('asc','desc','recent','newest') or
    p_offset is null or p_offset not between 0 and 100000 or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Invalid catalogue search';
  end if;
  select coalesce(jsonb_agg(public.mcp_get_food(ids.food_id) order by ids.ordinality), '[]'::jsonb)
    into items from public.journal_food_ids(p_term, p_sort, p_offset, p_limit, null, p_visibility) with ordinality ids;
  select exists(select 1 from public.journal_food_ids(p_term, p_sort, p_offset + p_limit, 1, null, p_visibility)) into more;
  return jsonb_build_object('items', items, 'has_more', more,
    'next_offset', case when more then p_offset + p_limit else null end);
end $$;

create function public.mcp_day_summary(p_date date default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with entries as (
    select i.*, v.name, v.kind, to_jsonb(q) portion,
      q.energy_kcal * i.ratio energy_kcal, q.carbs_g * i.ratio carbs_g,
      q.fats_g * i.ratio fats_g, q.proteins_g * i.ratio proteins_g
    from public.intakes i
    left join public.food_versions v on v.id = i.food_version_id
    left join public.quantities q on q.id = i.quantity_id and q.food_version_id = i.food_version_id
    where i.user_id = auth.uid() and i.consumed_on = coalesce(p_date, (now() at time zone 'Europe/Paris')::date)
  ), totals as (
    select count(*) count,
      case when count(*) = count(energy_kcal) then coalesce(sum(energy_kcal), 0) end energy_kcal,
      case when count(*) = count(carbs_g) then coalesce(sum(carbs_g), 0) end carbs_g,
      case when count(*) = count(fats_g) then coalesce(sum(fats_g), 0) end fats_g,
      case when count(*) = count(proteins_g) then coalesce(sum(proteins_g), 0) end proteins_g
    from entries
  ), goal as (
    select g.* from public.daily_goals g
    where g.user_id = auth.uid()
      and g.valid_from <= coalesce(p_date, (now() at time zone 'Europe/Paris')::date)
      and (g.valid_to is null or g.valid_to >= coalesce(p_date, (now() at time zone 'Europe/Paris')::date))
    order by g.valid_from desc, g.created_at desc, g.id limit 1
  )
  select jsonb_build_object('date', coalesce(p_date, (now() at time zone 'Europe/Paris')::date),
    'timezone', 'Europe/Paris', 'empty', totals.count = 0,
    'intakes', coalesce((select jsonb_agg(to_jsonb(e) order by e.consumed_at, e.id) from entries e), '[]'::jsonb),
    'totals', to_jsonb(totals) - 'count', 'goals', (select to_jsonb(g) from goal g),
    'remaining', (select jsonb_build_object('energy_kcal', g.energy_kcal - totals.energy_kcal,
      'carbs_g', g.carbs_g - totals.carbs_g, 'fats_g', g.fats_g - totals.fats_g,
      'proteins_g', g.proteins_g - totals.proteins_g) from goal g))
  from totals
$$;
revoke all on function public.mcp_get_food(uuid), public.mcp_search_foods(text,text,text,integer,integer), public.mcp_day_summary(date) from public, anon;
grant execute on function public.mcp_get_food(uuid), public.mcp_search_foods(text,text,text,integer,integer), public.mcp_day_summary(date) to authenticated;
