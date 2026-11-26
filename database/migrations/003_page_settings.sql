-- Page settings (cover, wide, pinned) and database views.
alter table public.notes
  add column if not exists cover text,
  add column if not exists wide boolean not null default false,
  add column if not exists pinned boolean not null default false;

alter table public.databases
  add column if not exists view jsonb not null default '{}'::jsonb;

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
      select id, title, icon, cover, wide, pinned, parent_id, position, is_public, slug, database_id, properties, content, markdown,
             created_at, updated_at, published_at, deleted_at from public.notes) n), '[]'::jsonb),
    'databases', coalesce((select jsonb_agg(to_jsonb(d)) from public.databases d), '[]'::jsonb)
  );
end; $$;
