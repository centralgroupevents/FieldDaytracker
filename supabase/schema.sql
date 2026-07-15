-- ============================================================================
-- Field Day Tracker — Supabase schema
-- Run this in the Supabase Dashboard -> SQL Editor (or via `supabase db push`).
-- It is idempotent enough to re-run during development.
-- ============================================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Status enum
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'inventory_status') then
    create type inventory_status as enum (
      'Needed',
      'Pending Order',
      'Shipped',
      'Delivered',
      'Picked Up',
      'Refunded'
    );
  end if;
end$$;

-- Upgrade path for databases created before 'Refunded' existed.
alter type inventory_status add value if not exists 'Refunded';

-- ----------------------------------------------------------------------------
-- inventory_items
--   delta and total_cost are STORED GENERATED columns: the database keeps them
--   in sync automatically, so application code can never write a stale value.
-- ----------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id               uuid primary key default gen_random_uuid(),
  item_name        text             not null,
  image_url        text,
  unit_price       numeric(12, 2)   not null default 0,
  target_quantity  integer          not null default 0,
  current_stock    integer          not null default 0,
  delta            integer generated always as (target_quantity - current_stock) stored,
  status           inventory_status not null default 'Needed',
  tracking_number  text,
  carrier          text,
  total_cost       numeric(14, 2) generated always as (unit_price * current_stock) stored,
  created_at       timestamptz      not null default now(),
  updated_at       timestamptz      not null default now()
);

-- Keep updated_at fresh on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_items_updated_at on public.inventory_items;
create trigger trg_inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- Fast lookups used by the webhook listener.
create index if not exists idx_inventory_items_tracking
  on public.inventory_items (tracking_number);
create index if not exists idx_inventory_items_status
  on public.inventory_items (status);

-- ----------------------------------------------------------------------------
-- Row Level Security
--   - Authenticated users get full CRUD (single-team internal tool).
--   - The service-role key bypasses RLS, so webhooks/server actions that use it
--     are unaffected by these policies.
-- ----------------------------------------------------------------------------
alter table public.inventory_items enable row level security;

drop policy if exists "authenticated can read"   on public.inventory_items;
drop policy if exists "authenticated can insert" on public.inventory_items;
drop policy if exists "authenticated can update" on public.inventory_items;
drop policy if exists "authenticated can delete" on public.inventory_items;

create policy "authenticated can read"
  on public.inventory_items for select
  to authenticated using (true);

create policy "authenticated can insert"
  on public.inventory_items for insert
  to authenticated with check (true);

create policy "authenticated can update"
  on public.inventory_items for update
  to authenticated using (true) with check (true);

create policy "authenticated can delete"
  on public.inventory_items for delete
  to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Storage bucket for item photos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

drop policy if exists "public read item images"      on storage.objects;
drop policy if exists "authenticated upload images"   on storage.objects;
drop policy if exists "authenticated delete images"   on storage.objects;

create policy "public read item images"
  on storage.objects for select
  using (bucket_id = 'item-images');

create policy "authenticated upload images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-images');

create policy "authenticated delete images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-images');
