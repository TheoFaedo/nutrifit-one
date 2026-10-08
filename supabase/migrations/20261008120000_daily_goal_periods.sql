-- Goal periods use inclusive dates and are changed atomically in Europe/Paris.
drop function if exists public.complete_onboarding(date, numeric, numeric, numeric, numeric);

create function public.complete_onboarding(
  p_energy_kcal numeric,
  p_carbs_g numeric,
  p_fats_g numeric,
  p_proteins_g numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  paris_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = current_user_id and onboarded = false) then
    raise exception 'Profile is missing or onboarding is already complete';
  end if;
  insert into public.daily_goals (user_id, valid_from, energy_kcal, carbs_g, fats_g, proteins_g)
  values (current_user_id, paris_today, p_energy_kcal, p_carbs_g, p_fats_g, p_proteins_g);
  update public.profiles set onboarded = true where id = current_user_id and onboarded = false;
  if not found then raise exception 'Onboarding could not be completed'; end if;
end;
$$;

create function public.update_daily_goal(
  p_energy_kcal numeric,
  p_carbs_g numeric,
  p_fats_g numeric,
  p_proteins_g numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  paris_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_energy_kcal < 0 or p_carbs_g < 0 or p_fats_g < 0 or p_proteins_g < 0 then
    raise exception 'Nutrition targets must be non-negative';
  end if;
  -- Serializes simultaneous saves for this account and verifies onboarding.
  perform 1 from public.profiles where id = current_user_id and onboarded for update;
  if not found then raise exception 'Profile is missing or onboarding is incomplete'; end if;

  if exists (select 1 from public.daily_goals where user_id = current_user_id and valid_from = paris_today) then
    update public.daily_goals set energy_kcal = p_energy_kcal, carbs_g = p_carbs_g,
      fats_g = p_fats_g, proteins_g = p_proteins_g
    where user_id = current_user_id and valid_from = paris_today;
  else
    update public.daily_goals set valid_to = paris_today - 1
    where user_id = current_user_id and valid_to is null and valid_from < paris_today;
    insert into public.daily_goals (user_id, valid_from, energy_kcal, carbs_g, fats_g, proteins_g)
    values (current_user_id, paris_today, p_energy_kcal, p_carbs_g, p_fats_g, p_proteins_g);
  end if;
end;
$$;

revoke all on function public.complete_onboarding(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.complete_onboarding(numeric, numeric, numeric, numeric) to authenticated;
revoke all on function public.update_daily_goal(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.update_daily_goal(numeric, numeric, numeric, numeric) to authenticated;
