-- ============================================================================
-- Outreach: CC/BCC + attachments
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================================

-- Templates gain default CC/BCC and an attachments list.
alter table public.outreach_templates
  add column if not exists cc          text,
  add column if not exists bcc         text,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- The send log records the CC/BCC that actually went out.
alter table public.outreach_sends
  add column if not exists cc  text,
  add column if not exists bcc text;

-- Public bucket that holds uploaded attachment files. Public so Gmail/nodemailer
-- can fetch them by URL when attaching. Uploads happen via the service-role key
-- (server actions), which bypasses RLS.
insert into storage.buckets (id, name, public)
values ('outreach-attachments', 'outreach-attachments', true)
on conflict (id) do nothing;

drop policy if exists "public read outreach attachments" on storage.objects;
create policy "public read outreach attachments"
  on storage.objects for select
  using (bucket_id = 'outreach-attachments');
