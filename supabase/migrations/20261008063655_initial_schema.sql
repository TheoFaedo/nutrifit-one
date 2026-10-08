-- Nutrifit one initial schema. Apply with Supabase CLI to a fresh Supabase project.
create extension if not exists pgcrypto with schema extensions;
create type public.meal_type as enum ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS');
create type public.food_version_kind as enum ('FOOD', 'MEAL', 'RECIPE');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 pseudo text, onboarded boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.daily_goals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 valid_from date not null, valid_to date,
 energy_kcal numeric(12,3) not null check (energy_kcal >= 0),
 carbs_g numeric(12,3) not null check (carbs_g >= 0), fats_g numeric(12,3) not null check (fats_g >= 0),
 proteins_g numeric(12,3) not null check (proteins_g >= 0), created_at timestamptz not null default now(),
 check (valid_to is null or valid_to >= valid_from)
);
create index daily_goals_user_period_idx on public.daily_goals(user_id, valid_from, valid_to);

-- foods stores stable ownership/visibility; each edit creates a food_versions snapshot.
create table public.foods (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete restrict,
 is_public boolean not null default false, created_at timestamptz not null default now()
);
create table public.food_versions (
 id uuid primary key default gen_random_uuid(), food_id uuid not null references public.foods(id) on delete cascade,
 version_number integer not null check (version_number > 0), name text not null check (length(btrim(name)) > 0),
 kind public.food_version_kind not null default 'FOOD', is_current boolean not null default true,
 created_at timestamptz not null default now(), unique(food_id,id), unique(food_id,version_number)
);
create unique index food_versions_one_current_idx on public.food_versions(food_id) where is_current;
create index foods_author_idx on public.foods(author_id);
create table public.quantities (
 id uuid primary key default gen_random_uuid(), food_version_id uuid not null references public.food_versions(id) on delete restrict,
 quantity_number numeric(12,3) not null check (quantity_number > 0), quantity_unit text not null check(length(btrim(quantity_unit)) > 0),
 is_reference boolean not null default false,
 energy_kcal numeric(12,3), carbs_g numeric(12,3), fats_g numeric(12,3), proteins_g numeric(12,3),
 unique(food_version_id,id),
 check ((energy_kcal is null and carbs_g is null and fats_g is null and proteins_g is null) or
        (energy_kcal >= 0 and carbs_g >= 0 and fats_g >= 0 and proteins_g >= 0))
);
create unique index quantities_one_reference_idx on public.quantities(food_version_id) where is_reference;
create table public.product_details (
 food_version_id uuid primary key references public.food_versions(id) on delete restrict,
 barcode text, source text, source_payload jsonb, created_at timestamptz not null default now()
);
create index product_details_barcode_idx on public.product_details(barcode) where barcode is not null;
create table public.recipe_parts (
 id uuid primary key default gen_random_uuid(), recipe_version_id uuid not null references public.food_versions(id) on delete restrict,
 ingredient_version_id uuid not null references public.food_versions(id) on delete restrict, quantity_id uuid not null,
 ratio numeric(12,3) not null check (ratio > 0),
 foreign key(ingredient_version_id,quantity_id) references public.quantities(food_version_id,id) on delete restrict,
 check(recipe_version_id <> ingredient_version_id)
);
create index recipe_parts_recipe_idx on public.recipe_parts(recipe_version_id);
create table public.intakes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 food_version_id uuid not null references public.food_versions(id) on delete restrict, quantity_id uuid not null,
 ratio numeric(12,1) not null check(ratio > 0), consumed_at timestamptz not null default now(),
 consumed_on date generated always as ((consumed_at at time zone 'Europe/Paris')::date) stored,
 meal_type public.meal_type not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(food_version_id,quantity_id) references public.quantities(food_version_id,id) on delete restrict
);
create index intakes_user_day_idx on public.intakes(user_id,consumed_on);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger intakes_touch before update on public.intakes for each row execute function public.touch_updated_at();

create function public.prevent_barcode_change() returns trigger language plpgsql set search_path = '' as $$
begin if new.barcode is distinct from old.barcode then raise exception 'A product barcode is immutable'; end if; return new; end $$;
create trigger product_barcode_immutable before update of barcode on public.product_details for each row execute function public.prevent_barcode_change();
create function public.prevent_snapshot_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Food versions are immutable; create a new version'; end $$;
create trigger food_version_snapshot_immutable before update of food_id,version_number,name,kind,created_at on public.food_versions for each row execute function public.prevent_snapshot_mutation();
create function public.prevent_quantity_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Quantities are immutable'; end $$;
create trigger quantities_immutable before update or delete on public.quantities for each row execute function public.prevent_quantity_mutation();
create function public.prevent_recipe_part_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Recipe parts are immutable; create a new recipe version'; end $$;
create trigger recipe_parts_immutable before update or delete on public.recipe_parts for each row execute function public.prevent_recipe_part_mutation();

-- Detect direct and transitive recipe cycles on composition insertion.
create function public.reject_recipe_cycle() returns trigger language plpgsql set search_path = '' as $$
declare recipe_food uuid; ingredient_kind public.food_version_kind;
begin
 select food_id into recipe_food from public.food_versions where id=new.recipe_version_id and kind='RECIPE';
 if recipe_food is null then raise exception 'Recipe part owner must be a recipe version'; end if;
 select kind into ingredient_kind from public.food_versions where id=new.ingredient_version_id;
 if ingredient_kind is null then raise exception 'Unknown ingredient version'; end if;
 if ingredient_kind='RECIPE' and exists (
  with recursive descendants(version_id) as (
   select new.ingredient_version_id union
   select rp.ingredient_version_id from public.recipe_parts rp join descendants d on rp.recipe_version_id=d.version_id
  ) select 1 from descendants where version_id=new.recipe_version_id
 ) then raise exception 'Recipe composition cannot contain a cycle'; end if;
 return new;
end $$;
create trigger recipe_parts_no_cycle before insert on public.recipe_parts for each row execute function public.reject_recipe_cycle();

-- At commit, every recipe snapshot must have both a reference portion and ingredients.
create function public.validate_recipe_snapshot() returns trigger language plpgsql set search_path = '' as $$
declare target_version uuid;
begin
 target_version := case when tg_table_name = 'food_versions' then new.id else new.recipe_version_id end;
 if exists(select 1 from public.food_versions where id=target_version and kind='RECIPE') and
    (not exists(select 1 from public.quantities where food_version_id=target_version and is_reference) or
     not exists(select 1 from public.recipe_parts where recipe_version_id=target_version)) then
  raise exception 'A recipe version requires a reference portion and at least one ingredient';
 end if;
 return new;
end $$;
create constraint trigger recipe_version_complete_after_insert
 after insert on public.food_versions deferrable initially deferred for each row
 execute function public.validate_recipe_snapshot();
create constraint trigger recipe_parts_complete_at_commit
 after insert on public.recipe_parts deferrable initially deferred for each row
 execute function public.validate_recipe_snapshot();

create function public.require_current_intake_version() returns trigger language plpgsql set search_path = '' as $$
begin
 if not exists(select 1 from public.food_versions where id=new.food_version_id and is_current) then
  raise exception 'New intakes must reference the current food version';
 end if;
 return new;
end $$;
create trigger intakes_current_version before insert on public.intakes for each row execute function public.require_current_intake_version();

-- Recipe nutrition is the sum of exact ingredient-portion nutrition scaled by each part ratio.
create view public.recipe_nutrition with (security_invoker=true) as
select rp.recipe_version_id, sum(q.energy_kcal*rp.ratio) energy_kcal,
 sum(q.carbs_g*rp.ratio) carbs_g, sum(q.fats_g*rp.ratio) fats_g, sum(q.proteins_g*rp.ratio) proteins_g
from public.recipe_parts rp join public.quantities q on q.food_version_id=rp.ingredient_version_id and q.id=rp.quantity_id
group by rp.recipe_version_id;

create function public.create_profile_for_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id) on conflict(id) do nothing; return new; end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.create_profile_for_auth_user();

alter table public.profiles enable row level security;
alter table public.daily_goals enable row level security;
alter table public.foods enable row level security;
alter table public.food_versions enable row level security;
alter table public.quantities enable row level security;
alter table public.product_details enable row level security;
alter table public.recipe_parts enable row level security;
alter table public.intakes enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy goals_own on public.daily_goals for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy foods_read_visible on public.foods for select to anon,authenticated using(is_public or author_id=(select auth.uid()));
create policy foods_insert_author on public.foods for insert to authenticated with check(author_id=(select auth.uid()));
create policy foods_update_author on public.foods for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
create policy versions_read_visible on public.food_versions for select to anon,authenticated using(exists(select 1 from public.foods f where f.id=food_id and (f.is_public or f.author_id=(select auth.uid()))));
create policy versions_insert_author on public.food_versions for insert to authenticated with check(exists(select 1 from public.foods f where f.id=food_id and f.author_id=(select auth.uid())));
create policy versions_update_author on public.food_versions for update to authenticated using(exists(select 1 from public.foods f where f.id=food_id and f.author_id=(select auth.uid()))) with check(exists(select 1 from public.foods f where f.id=food_id and f.author_id=(select auth.uid())));
create policy quantities_read_visible on public.quantities for select to anon,authenticated using(exists(select 1 from public.food_versions v join public.foods f on f.id=v.food_id where v.id=food_version_id and (f.is_public or f.author_id=(select auth.uid()))));
create policy quantities_insert_author on public.quantities for insert to authenticated with check(exists(select 1 from public.food_versions v join public.foods f on f.id=v.food_id where v.id=food_version_id and f.author_id=(select auth.uid())));
create policy products_read_visible on public.product_details for select to anon,authenticated using(exists(select 1 from public.food_versions v join public.foods f on f.id=v.food_id where v.id=food_version_id and (f.is_public or f.author_id=(select auth.uid()))));
create policy products_insert_author on public.product_details for insert to authenticated with check(exists(select 1 from public.food_versions v join public.foods f on f.id=v.food_id where v.id=food_version_id and f.author_id=(select auth.uid())));
create policy recipe_parts_read_visible on public.recipe_parts for select to anon,authenticated using(exists(select 1 from public.food_versions v join public.foods f on f.id=v.food_id where v.id=recipe_version_id and (f.is_public or f.author_id=(select auth.uid()))));
create policy recipe_parts_insert_author on public.recipe_parts for insert to authenticated with check(exists(select 1 from public.food_versions v join public.foods f on f.id=v.food_id where v.id=recipe_version_id and f.author_id=(select auth.uid())));
create policy intakes_own on public.intakes for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

grant usage on schema public to anon,authenticated;
grant select on public.foods,public.food_versions,public.quantities,public.product_details,public.recipe_parts,public.recipe_nutrition to anon,authenticated;
grant select,insert,update,delete on public.profiles,public.daily_goals,public.foods,public.food_versions,public.quantities,public.product_details,public.recipe_parts,public.intakes to authenticated;
