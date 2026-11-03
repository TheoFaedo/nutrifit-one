-- Minimal Auth contract for standalone PostgreSQL tests, NEVER deploy this file.
create role anon nologin;
create role authenticated nologin;
create role supabase_auth_admin nologin;
create schema auth;
create schema extensions;
create table auth.users(id uuid primary key);
create table auth.sessions(
  id uuid primary key, user_id uuid references auth.users,
  oauth_client_id uuid, not_after timestamptz
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt()->>'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
