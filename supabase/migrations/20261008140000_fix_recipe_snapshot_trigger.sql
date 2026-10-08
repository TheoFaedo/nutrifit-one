-- The deferred validation trigger runs for both food_versions and recipe_parts.
-- Access NEW as JSON so PostgreSQL does not resolve a field that is absent from
-- the row type of the triggering table.
create or replace function public.validate_recipe_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_version uuid;
  row_data jsonb := to_jsonb(new);
begin
  target_version := (row_data ->> case
    when tg_table_name = 'food_versions' then 'id'
    else 'recipe_version_id'
  end)::uuid;

  if exists(select 1 from public.food_versions where id = target_version and kind = 'RECIPE') and
    (not exists(select 1 from public.quantities where food_version_id = target_version and is_reference) or
     not exists(select 1 from public.recipe_parts where recipe_version_id = target_version)) then
    raise exception 'A recipe version requires a reference portion and at least one ingredient';
  end if;
  return new;
end
$$;
