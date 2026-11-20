-- #1005: "Today's changes" in admin. One row each time a lesson is booked,
-- moved, cancelled, removed, logged, marked a no-show or missed, has its log
-- undone, or is put on hold or released, with who did it:
--   admin  = Lionel (the admin pages, his email buttons, or his agent)
--   family = the student or parent (cancel, make-up picker)
--   auto   = the portal on its own (auto-schedule, the next-week booking after
--            a log, Zoom and classroom automatic logs)
-- Written by the portal's server code (service role) next to the real action,
-- inside try/catch, so a failed write never blocks the action itself. There is
-- no foreign key to lessons on purpose: a cancelled lesson's row is deleted.
-- Admin (is_admin()) can read it; nobody else can read or write it directly.
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
create table if not exists public.lesson_events (
    id uuid primary key default gen_random_uuid(),
    lesson_id uuid,
    student_id uuid not null references public.profiles(id) on delete cascade,
    kind text not null check (kind in ('booked', 'moved', 'cancelled', 'removed', 'logged', 'no_show', 'missed', 'unlogged', 'held', 'released')),
    actor text not null check (actor in ('admin', 'family', 'auto')),
    lesson_date date,
    lesson_time text,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists lesson_events_created_at_idx on public.lesson_events (created_at desc);
create index if not exists lesson_events_student_idx on public.lesson_events (student_id, created_at desc);
alter table public.lesson_events enable row level security;
drop policy if exists "Admin read lesson_events" on public.lesson_events;
create policy "Admin read lesson_events" on public.lesson_events for select using (public.is_admin());
