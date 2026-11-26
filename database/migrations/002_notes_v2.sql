-- Notes v2: notes only (no blog), nested pages, trash, databases, version history, links.
drop index if exists public.notes_public_idx;
alter table public.notes drop column if exists type;

alter table public.notes
  add column parent_id uuid references public.notes(id) on delete cascade,
  add column position double precision not null default 0,
  add column icon text,
  add column deleted_at timestamptz,
  add column database_id uuid,
  add column properties jsonb not null default '{}'::jsonb;

create table public.databases (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.notes add constraint notes_database_fk foreign key (database_id) references public.databases(id) on delete cascade;

create index notes_parent_idx on public.notes (parent_id, position);
create index notes_database_idx on public.notes (database_id, position);
create index notes_public_idx on public.notes (is_public, published_at desc) where deleted_at is null;
create index databases_note_idx on public.databases (note_id);

create table public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  title text not null,
  content jsonb not null,
  markdown text not null default '',
  created_at timestamptz not null default now()
);
create index note_versions_note_idx on public.note_versions (note_id, created_at desc);

create or replace function private.is_public_database(db uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.databases d join public.notes n on n.id = d.note_id
                 where d.id = db and n.is_public and n.deleted_at is null);
$$;
revoke execute on function private.is_public_database(uuid) from public;
grant execute on function private.is_public_database(uuid) to anon, authenticated;

drop policy if exists "anyone reads public notes" on public.notes;
create policy "anyone reads public notes" on public.notes for select
  using ((is_public and deleted_at is null) or (database_id is not null and private.is_public_database(database_id)));

alter table public.databases enable row level security;
create policy "owner manages databases" on public.databases for all using (private.is_owner()) with check (private.is_owner());
create policy "anyone reads public databases" on public.databases for select using (private.is_public_database(id));

alter table public.note_versions enable row level security;
create policy "owner manages versions" on public.note_versions for all using (private.is_owner()) with check (private.is_owner());

create or replace function public.set_trashed(root uuid, trashed boolean) returns void
language sql security invoker set search_path = public as $$
  with recursive tree as (
    select id from public.notes where id = root
    union all
    select n.id from public.notes n join tree t on n.parent_id = t.id
  )
  update public.notes set deleted_at = case when trashed then now() else null end
  where id in (select id from tree);
$$;
revoke execute on function public.set_trashed(uuid, boolean) from public, anon;
grant execute on function public.set_trashed(uuid, boolean) to authenticated;

create or replace function public.note_ancestors(target uuid) returns table (id uuid, title text, icon text, depth int)
language sql stable security invoker set search_path = public as $$
  with recursive up as (
    select n.id, n.title, n.icon, n.parent_id, 0 as depth from public.notes n where n.id = target
    union all
    select p.id, p.title, p.icon, p.parent_id, up.depth + 1 from public.notes p join up on p.id = up.parent_id
  )
  select id, title, icon, depth from up where depth > 0 order by depth desc;
$$;

create or replace function public.note_backlinks(target uuid) returns table (id uuid, title text, icon text)
language sql stable security invoker set search_path = public as $$
  select n.id, n.title, n.icon from public.notes n
  where n.id <> target and n.deleted_at is null and position(target::text in n.content::text) > 0
  order by n.updated_at desc limit 50;
$$;
revoke execute on function public.note_ancestors(uuid) from public, anon;
revoke execute on function public.note_backlinks(uuid) from public, anon;
grant execute on function public.note_ancestors(uuid) to authenticated;
grant execute on function public.note_backlinks(uuid) to authenticated;

create or replace function public.export_notes(token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select backup_token_hash into h from public.settings where id = 1;
  if h is null or encode(extensions.digest(token, 'sha256'), 'hex') <> h then
    raise exception 'invalid token';
  end if;
  return jsonb_build_object(
    'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from (
      select id, title, icon, parent_id, position, is_public, slug, database_id, properties, content, markdown,
             created_at, updated_at, published_at, deleted_at from public.notes) n), '[]'::jsonb),
    'databases', coalesce((select jsonb_agg(to_jsonb(d)) from public.databases d), '[]'::jsonb)
  );
end; $$;

-- Devices register themselves after login; no pair codes.
alter table public.devices drop column if exists pair_code;
