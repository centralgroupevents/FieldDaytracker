-- ============================================================================
-- Outreach tab — Supabase schema
-- Run this in the Supabase Dashboard -> SQL Editor (paste + Run).
-- Safe to re-run: everything is "if not exists" / "on conflict do nothing".
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- outreach_contacts — the pipeline. `stage` is plain text (not an enum) so the
-- list of stages can grow without a migration.
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  company    text,
  stage      text        not null default 'New',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- outreach_templates — reusable email starting points. Body/subject may contain
-- {{name}}, {{email}}, {{company}} placeholders.
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  subject    text        not null default '',
  body       text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- outreach_sends — an append-only log of every email attempt (sent/failed/skipped).
-- ----------------------------------------------------------------------------
create table if not exists public.outreach_sends (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid references public.outreach_contacts (id) on delete set null,
  template_id uuid references public.outreach_templates (id) on delete set null,
  to_email    text        not null,
  subject     text        not null default '',
  status      text        not null default 'sent',   -- sent | failed | skipped
  error       text,
  created_at  timestamptz not null default now()
);

-- Keep updated_at fresh. Reuses the same helper name the inventory schema uses;
-- "create or replace" makes this safe whether or not that schema ran first.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_outreach_contacts_updated_at on public.outreach_contacts;
create trigger trg_outreach_contacts_updated_at
  before update on public.outreach_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_outreach_templates_updated_at on public.outreach_templates;
create trigger trg_outreach_templates_updated_at
  before update on public.outreach_templates
  for each row execute function public.set_updated_at();

create index if not exists idx_outreach_contacts_stage on public.outreach_contacts (stage);
create index if not exists idx_outreach_sends_contact  on public.outreach_sends (contact_id);

-- ----------------------------------------------------------------------------
-- RLS — matches the inventory tables. The app's server actions use the
-- service-role key (createAdminClient), which bypasses RLS, so these policies
-- only affect any future logged-in browser access.
-- ----------------------------------------------------------------------------
alter table public.outreach_contacts  enable row level security;
alter table public.outreach_templates enable row level security;
alter table public.outreach_sends     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['outreach_contacts','outreach_templates','outreach_sends'] loop
    execute format('drop policy if exists "authenticated all" on public.%I', t);
    execute format(
      'create policy "authenticated all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end$$;
