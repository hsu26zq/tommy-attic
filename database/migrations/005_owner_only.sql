-- Public pages were removed: only the owner can read notes, databases and files now.
drop policy if exists "anyone reads public notes" on public.notes;
drop policy if exists "anyone reads public databases" on public.databases;
drop policy if exists "anyone reads files in public notes" on storage.objects;
