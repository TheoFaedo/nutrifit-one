-- Page visible current foods before loading their snapshots. Security invoker keeps
-- the existing foods and intakes row policies in force for both sort modes.
create index intakes_user_version_recent_idx
  on public.intakes(user_id, food_version_id, consumed_at desc);

create function public.journal_food_ids(
  p_term text default '',
  p_sort text default 'recent',
  p_offset integer default 0,
  p_limit integer default 20,
  p_barcode text default null
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
  where (p_barcode is null and v.name ilike '%' || replace(replace(replace(btrim(p_term), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
     or (p_barcode is not null and f.is_public and exists (
       select 1 from public.product_details d where d.food_version_id = v.id and d.barcode = p_barcode
     ))
  order by
    case when p_sort = 'recent' then last_intake.last_used end desc nulls last,
    case when p_sort = 'newest' then f.created_at end desc nulls last,
    f.created_at desc, f.id
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.journal_food_ids(text,text,integer,integer,text) from public, anon;
grant execute on function public.journal_food_ids(text,text,integer,integer,text) to authenticated;
