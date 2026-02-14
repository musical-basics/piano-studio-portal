-- Announcements v2: Add status and sent_at columns
-- Run this in the Supabase SQL Editor

alter table public.announcements
add column if not exists status text check (status in ('draft', 'sent')) default 'draft';

alter table public.announcements
add column if not exists sent_at timestamp with time zone;

-- Backfill: mark any existing rows as 'sent' since they were already sent
update public.announcements set status = 'sent', sent_at = created_at where status is null or status = 'draft';
