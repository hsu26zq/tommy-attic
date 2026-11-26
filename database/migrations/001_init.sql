-- Tommy's Attic database (Supabase / Postgres). Applied to the live project already.
-- To set up a fresh project: run this, then
--   update public.settings set owner_email = 'you@example.com';
-- The first account that signs in with that email becomes the owner.

create table public.settings (
  id int primary key default 1 check (id = 1),
  owner_email text,
  owner_id uuid references auth.users(id) on delete set null
);
insert into public.settings (id) values (1);
alter table public.settings enable row level security;

create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.settings where owner_id = auth.uid() and auth.uid() is not null);
$$;
revoke execute on function private.is_owner() from public;
grant execute on function private.is_owner() to anon, authenticated;

create or replace function public.claim_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.settings set owner_id = new.id
  where id = 1 and owner_id is null and owner_email is not null and lower(owner_email) = lower(new.email);
  return new;
end; $$;
revoke execute on function public.claim_owner() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.claim_owner();

create policy "owner reads settings" on public.settings for select using (private.is_owner());

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled',
  type text not null default 'note' check (type in ('note','post')),
  is_public boolean not null default false,
  slug text unique,
  content jsonb not null default '[]'::jsonb,
  markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index notes_public_idx on public.notes (is_public, type, published_at desc);
alter table public.notes enable row level security;
create policy "anyone reads public notes" on public.notes for select using (is_public);
create policy "owner reads all notes" on public.notes for select using (private.is_owner());
create policy "owner inserts notes" on public.notes for insert with check (private.is_owner());
create policy "owner updates notes" on public.notes for update using (private.is_owner()) with check (private.is_owner());
create policy "owner deletes notes" on public.notes for delete using (private.is_owner());

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Unnamed device',
  token_hash text not null unique,
  pair_code text,
  approved boolean not null default false,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.devices enable row level security;
create policy "owner manages devices" on public.devices for all using (private.is_owner()) with check (private.is_owner());

insert into storage.buckets (id, name, public, file_size_limit) values ('files', 'files', false, 52428800);
create policy "owner uploads files" on storage.objects for insert with check (bucket_id = 'files' and private.is_owner());
create policy "owner updates files" on storage.objects for update using (bucket_id = 'files' and private.is_owner());
create policy "owner deletes files" on storage.objects for delete using (bucket_id = 'files' and private.is_owner());
create policy "owner reads files" on storage.objects for select using (bucket_id = 'files' and private.is_owner());
create policy "anyone reads files in public notes" on storage.objects for select
  using (bucket_id = 'files' and exists (
    select 1 from public.notes n where n.is_public and position(storage.objects.name in n.content::text) > 0
  ));

-- Only the owner's email may ever have an account. Any other sign-up is rejected.
create or replace function public.block_signups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.settings where lower(owner_email) = lower(new.email)) then
    raise exception 'Sign-ups are closed';
  end if;
  return new;
end; $$;
revoke execute on function public.block_signups() from public, anon, authenticated;
create trigger block_signups before insert on auth.users
for each row execute function public.block_signups();

-- Backups: returns every note to whoever knows the secret backup token.
-- Set it with: update public.settings set backup_token_hash = encode(extensions.digest('<token>','sha256'),'hex');
create extension if not exists pgcrypto with schema extensions;
alter table public.settings add column if not exists backup_token_hash text;
create or replace function public.export_notes(token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select backup_token_hash into h from public.settings where id = 1;
  if h is null or encode(extensions.digest(token, 'sha256'), 'hex') <> h then
    raise exception 'invalid token';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(n) order by n.created_at)
    from (select id, title, type, is_public, slug, content, markdown, created_at, updated_at, published_at from public.notes) n
  ), '[]'::jsonb);
end; $$;
revoke execute on function public.export_notes(text) from public;
grant execute on function public.export_notes(text) to anon, authenticated;
