-- #1092: families owed a make-up lesson, listed in admin (Today tab) until one
-- is booked, so none is forgotten. See lib/core/owed-makeups.ts.
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
--
-- Rows come from "Today's changes" (lesson_events, #1005), one per event:
--   missed    = "I missed this" with no make-up booked in it: owed
--   cancelled = a lesson Lionel cancelled (admin pages, email button or his
--               agent): 'ask' until he says it was on him (owed) or not
-- Cancels by the family and "student set inactive" never come here.
-- A row closes when a make-up is booked from the list, when he says an
-- already booked lesson was the make-up, settles it by hand, says it is not
-- owed, or the cancelled lesson is back at its time.
--
-- Admin (is_admin()) can read it; every write goes through the portal's
-- server code with the service key. Additive only.

create table if not exists public.owed_makeups (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles(id) on delete cascade,
    -- The lesson_events row it came from: one row per miss or cancel.
    event_id uuid unique,
    source text not null check (source in ('missed', 'cancelled')),
    -- The lesson that did not happen (its row is gone, so no foreign key).
    lesson_id uuid,
    lesson_date date not null,
    lesson_time text not null,              -- 'HH:MM' studio (Eastern) wall clock
    duration integer not null default 60,   -- minutes, the length a make-up gets by default
    via text,                               -- how the cancel came in ('agent', 'email button', ...)
    status text not null default 'owed' check (status in ('ask', 'owed', 'settled', 'dismissed')),
    -- How it closed, in a few words ('booked from the list', 'not owed', ...).
    outcome text,
    makeup_lesson_id uuid,
    makeup_date date,
    makeup_time text,
    -- When the miss or cancel happened (the event's time).
    created_at timestamptz not null default now(),
    decided_at timestamptz
);

create index if not exists owed_makeups_open_idx on public.owed_makeups (status, created_at);
create index if not exists owed_makeups_student_idx on public.owed_makeups (student_id, created_at desc);

alter table public.owed_makeups enable row level security;

drop policy if exists "Admin read owed_makeups" on public.owed_makeups;
create policy "Admin read owed_makeups" on public.owed_makeups for select using (public.is_admin());

comment on table public.owed_makeups is
    'Families owed a make-up lesson (#1092): from "I missed this" and lessons Lionel cancelled, until one is booked or he settles or dismisses it. Admin reads; writes go through server code with the service key.';
