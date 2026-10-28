alter table public.food_versions add column nova_group smallint check (nova_group is null or (nova_group between 1 and 4 and kind = 'FOOD'));
drop trigger food_version_snapshot_immutable on public.food_versions;
create trigger food_version_snapshot_immutable before update of food_id,version_number,name,kind,created_at,nova_group on public.food_versions for each row execute function public.prevent_snapshot_mutation();
drop function public.save_food_snapshot(text, boolean, jsonb, uuid, text, text, jsonb);
create or replace function public.save_food_snapshot(
  p_name text,
  p_is_public boolean,
  p_quantities jsonb,
  p_food_id uuid default null,
  p_barcode text default null,
  p_source text default null,
  p_source_payload jsonb default null,
  p_nova_group smallint default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_food_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_reference record;
  item jsonb;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if length(btrim(p_name)) = 0 then raise exception 'Food name is required'; end if;
  if jsonb_typeof(p_quantities) <> 'array' or jsonb_array_length(p_quantities) = 0 then
    raise exception 'At least one portion is required';
  end if;

  if p_food_id is null then
    insert into public.foods(author_id, is_public) values (v_user_id, p_is_public) returning id into v_food_id;
  else
    select id into v_food_id from public.foods where id = p_food_id and author_id = v_user_id for update;
    if v_food_id is null then raise exception 'Food not found or not editable'; end if;
    update public.foods set is_public = p_is_public where id = v_food_id;
    select coalesce(max(version_number), 0) + 1 into v_version_number
      from public.food_versions where food_id = v_food_id;
    update public.food_versions set is_current = false where food_id = v_food_id and is_current;
  end if;

  if p_food_id is null then v_version_number := 1; end if;
  insert into public.food_versions(food_id, version_number, name, kind, nova_group)
    values (v_food_id, v_version_number, btrim(p_name), 'FOOD', p_nova_group) returning id into v_version_id;

  for item in select value from jsonb_array_elements(p_quantities) loop
    insert into public.quantities(food_version_id, quantity_number, quantity_unit, is_reference,
      energy_kcal, carbs_g, fats_g, proteins_g)
    values (v_version_id, (item->>'quantity_number')::numeric, item->>'quantity_unit',
      coalesce((item->>'is_reference')::boolean, false),
      nullif(item->>'energy_kcal','')::numeric, nullif(item->>'carbs_g','')::numeric,
      nullif(item->>'fats_g','')::numeric, nullif(item->>'proteins_g','')::numeric);
  end loop;
  if not exists(select 1 from public.quantities where food_version_id = v_version_id and is_reference) then
    update public.quantities set is_reference = true
      where id = (select id from public.quantities where food_version_id = v_version_id order by id limit 1);
  end if;

  select quantity_number, quantity_unit, energy_kcal, carbs_g, fats_g, proteins_g
    into v_reference from public.quantities
    where food_version_id = v_version_id and is_reference;
  if v_reference.quantity_number > 1
    and lower(btrim(v_reference.quantity_unit)) in ('g', 'ml')
    and not exists (
      select 1 from public.quantities
      where food_version_id = v_version_id
        and quantity_number = 1
        and lower(btrim(quantity_unit)) = lower(btrim(v_reference.quantity_unit))
    ) then
    insert into public.quantities(food_version_id, quantity_number, quantity_unit, is_reference,
      energy_kcal, carbs_g, fats_g, proteins_g)
    values (v_version_id, 1, lower(btrim(v_reference.quantity_unit)), false,
      v_reference.energy_kcal / v_reference.quantity_number,
      v_reference.carbs_g / v_reference.quantity_number,
      v_reference.fats_g / v_reference.quantity_number,
      v_reference.proteins_g / v_reference.quantity_number);
  end if;

  if p_barcode is not null or p_source is not null or p_source_payload is not null then
    insert into public.product_details(food_version_id, barcode, source, source_payload)
    values (v_version_id, p_barcode, p_source, p_source_payload);
  end if;
  return v_food_id;
end $$;


revoke all on function public.save_food_snapshot(text, boolean, jsonb, uuid, text, text, jsonb, smallint) from public;
grant execute on function public.save_food_snapshot(text, boolean, jsonb, uuid, text, text, jsonb, smallint) to authenticated;
