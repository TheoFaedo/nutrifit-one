\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then return;
  end;
  raise exception 'FAIL: write was not denied: %', statement;
end $$;

insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
update public.profiles set onboarded = true;
insert into private.mcp_clients values ('00000000-0000-0000-0000-000000000003', 'https://example.test/functions/v1/mcp', true);
insert into auth.sessions values
 ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', null),
 ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', null);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.save_food_snapshot('A private', false, '[{"quantity_number":100,"quantity_unit":"g","is_reference":true,"energy_kcal":100,"carbs_g":10,"fats_g":4,"proteins_g":6}]') as a_food \gset
select public.save_food_snapshot('Public', true, '[{"quantity_number":100,"quantity_unit":"g","is_reference":true}]') as public_food \gset
select public.update_daily_goal(2000,250,60,100);
select public.save_food_snapshot('A new version', false, '[{"quantity_number":100,"quantity_unit":"g","is_reference":true,"energy_kcal":200,"carbs_g":20,"fats_g":8,"proteins_g":12}]', :'a_food');
-- Insert journal against v2, then make v3 current: summary must retain v2.
insert into public.intakes(user_id, food_version_id, quantity_id, ratio, consumed_at, meal_type)
 select auth.uid(), v.id, q.id, 2, '2026-10-25T00:30:00Z', 'LUNCH'
 from public.food_versions v join public.quantities q on q.food_version_id = v.id and q.is_reference
 where v.food_id = :'a_food' and v.is_current;
select public.save_food_snapshot('A third version', false, '[{"quantity_number":100,"quantity_unit":"g","is_reference":true,"energy_kcal":300,"carbs_g":30,"fats_g":12,"proteins_g":18}]', :'a_food');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.save_food_snapshot('B private', false, '[{"quantity_number":100,"quantity_unit":"g","is_reference":true}]') as b_food \gset

select set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-0000-0000-000000000001','role','authenticated',
 'client_id','00000000-0000-0000-0000-000000000003','session_id','00000000-0000-0000-0000-000000000004',
 'aud',jsonb_build_array('authenticated','https://example.test/functions/v1/mcp'),'exp',extract(epoch from now())+3600)::text, true);
select pg_temp.assert(public.mcp_check_access(), 'valid OAuth session');
select pg_temp.assert((select count(*)=2 from public.foods), 'A sees only own private and public');
select pg_temp.assert(public.mcp_get_food(:'b_food') is null, 'direct ID isolation');
select pg_temp.assert((select count(*)=0 from public.profiles), 'OAuth cannot read profiles');
select pg_temp.assert(jsonb_array_length(public.mcp_search_foods('','personal')->'items')=2, 'personal includes authored public food');
select pg_temp.assert(jsonb_array_length(public.mcp_search_foods('','public')->'items')=1, 'public filter');
select pg_temp.assert((public.mcp_search_foods('', 'all', 'asc', 0, 1)->>'has_more')::boolean, 'pagination');
select pg_temp.assert(public.mcp_day_summary('2026-10-25')->'totals'->>'energy_kcal' = '400.0000', 'historical version and ratio preserved');
select pg_temp.assert(public.mcp_day_summary('2026-10-25')->'goals' = 'null'::jsonb, 'absent historic goal');
select pg_temp.assert((public.mcp_day_summary('2026-10-24')->>'empty')::boolean, 'empty day');

select pg_temp.denied($q$insert into public.foods(author_id,is_public) values(auth.uid(),true)$q$);
select pg_temp.denied($q$select public.save_food_snapshot('Attack',true,'[{"quantity_number":100,"quantity_unit":"g","is_reference":true}]')$q$);
select pg_temp.denied($q$select public.save_recipe_snapshot('Attack',true,100,'g','[{"ingredient_version_id":"00000000-0000-0000-0000-000000000001","quantity_id":"00000000-0000-0000-0000-000000000002","ratio":1}]')$q$);
select pg_temp.denied($q$insert into public.daily_goals(user_id,valid_from,energy_kcal,carbs_g,fats_g,proteins_g) values(auth.uid(),current_date,1,1,1,1)$q$);
select pg_temp.denied($q$insert into public.intakes(user_id,food_version_id,quantity_id,ratio,meal_type) select auth.uid(),v.id,q.id,1,'LUNCH' from public.food_versions v join public.quantities q on q.food_version_id=v.id and q.is_reference where v.is_current limit 1$q$);
-- RLS filters update/delete instead of raising; verify they affect no rows.
with changed as (update public.foods set is_public = true where not is_public returning *) select pg_temp.assert(count(*)=0,'no publishing') from changed;
with changed as (update public.profiles set onboarded=false returning *) select pg_temp.assert(count(*)=0,'no profile update') from changed;
with changed as (update public.daily_goals set energy_kcal=1 returning *) select pg_temp.assert(count(*)=0,'no goal update') from changed;
with changed as (delete from public.intakes returning *) select pg_temp.assert(count(*)=0,'no journal delete') from changed;
with changed as (update public.intakes set ratio=9 returning *) select pg_temp.assert(count(*)=0,'no journal update') from changed;

select public.mcp_create_food('{"name":"Salade","carbs_g":3.123,"fats_g":5,"proteins_g":7,"estimated":true,"assumptions":["Estimated portion"]}', 'salad-key-123') as created \gset
select pg_temp.assert((:'created'::jsonb->>'is_public')::boolean = false, 'private creation');
select pg_temp.assert(:'created'::jsonb->>'energy_kcal' = '85.5', 'macro energy rounded');
select pg_temp.assert(jsonb_array_length(:'created'::jsonb->'portions') = 2, 'automatic gram portion');
select pg_temp.assert(public.mcp_create_food('{"name":"Salade","carbs_g":3.123,"fats_g":5,"proteins_g":7,"estimated":true,"assumptions":["Estimated portion"]}', 'salad-key-123') = :'created'::jsonb,'idempotent creation');
do $$ begin
  perform public.mcp_create_food('{"name":"Changed","carbs_g":3,"fats_g":5,"proteins_g":7,"estimated":true,"assumptions":["Estimated portion"]}', 'salad-key-123');
  raise exception 'FAIL: changed idempotent content accepted';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.mcp_create_food('{"name":"Attack","is_public":true,"carbs_g":3,"fats_g":5,"proteins_g":7,"estimated":false,"assumptions":[]}', 'attack-key-123');
  raise exception 'FAIL: extra proposal fields accepted';
exception when invalid_parameter_value then null; end $$;
select pg_temp.assert((select author_id=auth.uid() and not is_public from public.foods where id=(:'created'::jsonb->>'food_id')::uuid), 'author derived from identity');
select pg_temp.assert((select source='AI estimate' and source_payload->'assumptions'='["Estimated portion"]'::jsonb and barcode is null from public.product_details where food_version_id=(:'created'::jsonb->>'version_id')::uuid), 'provenance and no barcode');
-- Add an unknown-nutrition intake as the normal app user, preserving null totals.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.intakes(user_id,food_version_id,quantity_id,ratio,consumed_at,meal_type)
 select auth.uid(), v.id, q.id, 1, '2026-03-29T01:30:00Z', 'LUNCH'
 from public.food_versions v join public.quantities q on q.food_version_id=v.id and q.is_reference where v.food_id=:'public_food';
select pg_temp.assert(public.mcp_day_summary('2026-03-29')->'totals'->'energy_kcal' = 'null'::jsonb, 'unknown remains null');
select pg_temp.assert(not (public.mcp_day_summary('2026-03-29')->>'empty')::boolean, 'unknown is not empty');
select pg_temp.assert(('2026-03-28T23:30:00Z'::timestamptz at time zone 'Europe/Paris')::date = '2026-03-29', 'spring boundary');
select pg_temp.assert(('2026-10-25T23:30:00Z'::timestamptz at time zone 'Europe/Paris')::date = '2026-10-26', 'autumn boundary');

-- Account B sees only public + B, and the same key creates a separate food.
select set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-0000-0000-000000000002','role','authenticated',
 'client_id','00000000-0000-0000-0000-000000000003','session_id','00000000-0000-0000-0000-000000000005',
 'aud',jsonb_build_array('authenticated','https://example.test/functions/v1/mcp'),'exp',extract(epoch from now())+3600)::text,true);
select pg_temp.assert((select count(*)=2 from public.foods), 'B catalogue isolation');
select pg_temp.assert(public.mcp_get_food(:'a_food') is null, 'B direct ID isolation');
select pg_temp.assert((public.mcp_day_summary('2026-10-25')->>'empty')::boolean, 'journal isolation');
select pg_temp.assert(public.mcp_create_food('{"name":"B salad","carbs_g":1,"fats_g":1,"proteins_g":1,"estimated":false,"assumptions":[]}', 'salad-key-123')->>'food_id' <> :'created'::jsonb->>'food_id', 'idempotency keys are per user');
reset role;
delete from auth.sessions where id='00000000-0000-0000-0000-000000000005';
set local role authenticated;
select pg_temp.assert(not public.mcp_check_access(), 'revoked session denied');
select pg_temp.assert((select count(*)=0 from public.foods), 'revoked direct API read denied');
select pg_temp.denied($q$select public.mcp_create_food('{"name":"Revoked","carbs_g":1,"fats_g":1,"proteins_g":1,"estimated":false,"assumptions":[]}', 'revoked-key-123')$q$);
select set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-0000-0000-000000000001','role','authenticated','client_id','unregistered','aud','authenticated','exp',extract(epoch from now())+3600)::text,true);
select pg_temp.assert((select count(*)=0 from public.foods), 'unregistered OAuth client denied');
reset role;
-- Hook leaves ordinary app tokens unchanged and binds registered OAuth tokens.
select pg_temp.assert(public.mcp_access_token_hook('{"claims":{"aud":"authenticated"}}')->'claims'->>'aud'='authenticated','ordinary audience unchanged');
select pg_temp.assert(public.mcp_access_token_hook('{"client_id":"00000000-0000-0000-0000-000000000003","claims":{"aud":"authenticated"}}')->'claims'->'aud'='["authenticated","https://example.test/functions/v1/mcp"]'::jsonb,'OAuth audience binding preserves Supabase');
rollback;
\echo MCP SQL permission and nutrition tests passed
