alter table public.profiles
  add column language text not null default 'en'
  check (language in ('fr', 'en'));

comment on column public.profiles.language is 'Preferred application interface language (fr or en).';
