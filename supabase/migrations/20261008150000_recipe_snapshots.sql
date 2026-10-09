-- Save a complete recipe snapshot atomically. Ingredient versions and portions
-- are immutable references captured at publication time.
create or replace function public.save_recipe_snapshot(
  p_name text, p_is_public boolean, p_reference_quantity numeric,
  p_reference_unit text, p_parts jsonb, p_food_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_food_id uuid; v_version_id uuid; v_version_number integer; v_quantity_id uuid;
  v_energy numeric; v_carbs numeric; v_fats numeric; v_proteins numeric;
  item jsonb; v_count integer := 0; v_nutrients_complete boolean := true;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'Recipe name is required'; end if;
  if p_reference_quantity is null or p_reference_quantity <= 0 or p_reference_unit is null or length(btrim(p_reference_unit)) = 0 then
    raise exception 'A valid reference portion is required';
  end if;
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then raise exception 'At least one ingredient is required'; end if;

  if p_food_id is null then
    insert into public.foods(author_id,is_public) values(auth.uid(),p_is_public) returning id into v_food_id;
    v_version_number := 1;
  else
    select id into v_food_id from public.foods where id=p_food_id and author_id=auth.uid() for update;
    if v_food_id is null then raise exception 'Recipe not found or not editable'; end if;
    if not exists(select 1 from public.food_versions where food_id=v_food_id and kind='RECIPE' and is_current) then raise exception 'Food is not a current recipe'; end if;
    update public.foods set is_public=p_is_public where id=v_food_id;
    select coalesce(max(version_number),0)+1 into v_version_number from public.food_versions where food_id=v_food_id;
    update public.food_versions set is_current=false where food_id=v_food_id and is_current;
  end if;
  insert into public.food_versions(food_id,version_number,name,kind) values(v_food_id,v_version_number,btrim(p_name),'RECIPE') returning id into v_version_id;
  insert into public.quantities(food_version_id,quantity_number,quantity_unit,is_reference) values(v_version_id,p_reference_quantity,btrim(p_reference_unit),true) returning id into v_quantity_id;

  for item in select value from jsonb_array_elements(p_parts) loop
    if nullif(item->>'ingredient_version_id','') is null or nullif(item->>'quantity_id','') is null or coalesce((item->>'ratio')::numeric,0) <= 0 then
      raise exception 'Each ingredient requires a version, portion, and positive amount';
    end if;
    select q.energy_kcal,q.carbs_g,q.fats_g,q.proteins_g into v_energy,v_carbs,v_fats,v_proteins
      from public.quantities q join public.food_versions fv on fv.id=q.food_version_id
      where q.id=(item->>'quantity_id')::uuid and q.food_version_id=(item->>'ingredient_version_id')::uuid;
    if not found then raise exception 'Ingredient portion must belong to its selected version'; end if;
    if v_energy is null or v_carbs is null or v_fats is null or v_proteins is null then v_nutrients_complete := false; end if;
    insert into public.recipe_parts(recipe_version_id,ingredient_version_id,quantity_id,ratio)
      values(v_version_id,(item->>'ingredient_version_id')::uuid,(item->>'quantity_id')::uuid,(item->>'ratio')::numeric);
    v_count := v_count + 1;
  end loop;
  if v_count=0 then raise exception 'At least one ingredient is required'; end if;
  -- Nutrients are written only by this transaction and derived from the view.
  perform set_config('app.recipe_nutrition_write','on',true);
  if v_nutrients_complete then
    update public.quantities q set energy_kcal=n.energy_kcal, carbs_g=n.carbs_g, fats_g=n.fats_g, proteins_g=n.proteins_g
      from public.recipe_nutrition n where q.id=v_quantity_id and n.recipe_version_id=v_version_id;
  end if;
  return v_food_id;
end $$;
revoke all on function public.save_recipe_snapshot(text,boolean,numeric,text,jsonb,uuid) from public;
grant execute on function public.save_recipe_snapshot(text,boolean,numeric,text,jsonb,uuid) to authenticated;

create or replace function public.guard_recipe_nutrition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.food_versions where id=new.food_version_id and kind='RECIPE') and
     current_setting('app.recipe_nutrition_write',true) is distinct from 'on' and
     ((tg_op='INSERT' and (new.energy_kcal is not null or new.carbs_g is not null or new.fats_g is not null or new.proteins_g is not null)) or
      (tg_op='UPDATE' and (new.energy_kcal is distinct from old.energy_kcal or new.carbs_g is distinct from old.carbs_g or new.fats_g is distinct from old.fats_g or new.proteins_g is distinct from old.proteins_g))) then
    raise exception 'Recipe nutrition is calculated from its ingredients';
  end if;
  return new;
end $$;
create trigger recipe_nutrition_guard before insert or update of energy_kcal,carbs_g,fats_g,proteins_g on public.quantities for each row execute function public.guard_recipe_nutrition();

create or replace function public.prevent_quantity_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and current_setting('app.recipe_nutrition_write',true)='on' and
     to_jsonb(new) - array['energy_kcal','carbs_g','fats_g','proteins_g'] = to_jsonb(old) - array['energy_kcal','carbs_g','fats_g','proteins_g'] and
     exists(select 1 from public.food_versions where id=new.food_version_id and kind='RECIPE') then return new; end if;
  raise exception 'Quantities are immutable';
end $$;
