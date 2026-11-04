\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
insert into auth.users values ('00000000-0000-0000-0000-000000000011');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select '[{"quantity_number":100,"quantity_unit":"g","is_reference":true,"energy_kcal":100}]' as portions \gset
select public.save_food_snapshot('Brand only', false, :'portions', p_brand => '  Original Brand  ') as food \gset
select id as original_version from public.food_versions where food_id = :'food' and is_current \gset
select pg_temp.assert((select brand = 'Original Brand' and barcode is null and source is null from public.product_details where food_version_id = :'original_version'), 'normalized brand without other details');
insert into public.intakes(user_id, food_version_id, quantity_id, ratio, consumed_at, meal_type)
 select auth.uid(), food_version_id, id, 1, now(), 'LUNCH' from public.quantities where food_version_id = :'original_version' and is_reference;
select public.save_food_snapshot('Corrected', false, :'portions', :'food', p_brand => '  Corrected Brand  ');
select pg_temp.assert((select d.brand = 'Corrected Brand' from public.food_versions v join public.product_details d on d.food_version_id = v.id where v.food_id = :'food' and v.is_current), 'correction creates branded version');
select public.save_food_snapshot('Removed', false, :'portions', :'food', p_source => 'Author correction', p_brand => '   ');
select pg_temp.assert((select d.brand is null from public.food_versions v join public.product_details d on d.food_version_id = v.id where v.food_id = :'food' and v.is_current), 'empty brand becomes null');
select pg_temp.assert((select d.brand = 'Original Brand' from public.intakes i join public.product_details d on d.food_version_id = i.food_version_id), 'journal keeps original brand');
select public.save_food_snapshot('Legacy caller', false, :'portions') as legacy \gset
select pg_temp.assert((select count(*) = 0 from public.product_details d join public.food_versions v on v.id = d.food_version_id where v.food_id = :'legacy'), 'omitted brand needs no product details');
select pg_temp.assert((select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'save_food_snapshot'), 'only one RPC signature');
select pg_temp.assert(has_function_privilege('authenticated', 'public.save_food_snapshot(text,boolean,jsonb,uuid,text,text,jsonb,smallint,text)', 'EXECUTE'), 'authenticated execution granted');
select pg_temp.assert(not has_function_privilege('anon', 'public.save_food_snapshot(text,boolean,jsonb,uuid,text,text,jsonb,smallint,text)', 'EXECUTE'), 'anonymous execution denied');
rollback;
