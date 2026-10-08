-- Save the initial target and mark the profile onboarded as one transaction.
create or replace function public.complete_onboarding(
  p_valid_from date,
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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = current_user_id and onboarded = false
  ) then
    raise exception 'Profile is missing or onboarding is already complete';
  end if;

  insert into public.daily_goals (
    user_id, valid_from, energy_kcal, carbs_g, fats_g, proteins_g
  ) values (
    current_user_id, p_valid_from, p_energy_kcal, p_carbs_g, p_fats_g, p_proteins_g
  );

  update public.profiles set onboarded = true
  where id = current_user_id and onboarded = false;
  if not found then
    raise exception 'Onboarding could not be completed';
  end if;
end;
$$;

revoke all on function public.complete_onboarding(date, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.complete_onboarding(date, numeric, numeric, numeric, numeric) to authenticated;
