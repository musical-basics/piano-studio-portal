-- #1086: "Undo" for 10 minutes after Lionel cancels a lesson in admin.
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
--
-- Cancelling deletes the lessons row (cancelLessonCore), so Undo needs what
-- the row carried. Every cancel now keeps it here:
--   undo_snapshot:     the lessons row as it was, its homework ticks, and how it
--                      was cancelled ({ lesson, homework_ticks, kind, notify, via }).
--   undone_at / undone_by / undone_lesson_id: set when the cancel was undone,
--                      with the new lessons row it was booked back as. An undone
--                      cancel no longer counts as "previously cancelled" for the
--                      auto-schedule or the booking warning.
-- lesson_events gets two kinds for "Today's changes": 'cancel_undone' and
-- 'no_show_undone' (#1097, same release). Additive only.

alter table public.cancellation_log add column if not exists undo_snapshot jsonb;
alter table public.cancellation_log add column if not exists undone_at timestamptz;
alter table public.cancellation_log add column if not exists undone_by uuid;
alter table public.cancellation_log add column if not exists undone_lesson_id uuid;

alter table public.lesson_events drop constraint if exists lesson_events_kind_check;
alter table public.lesson_events add constraint lesson_events_kind_check check (kind in (
    'booked', 'moved', 'cancelled', 'removed', 'logged', 'no_show', 'missed', 'unlogged', 'held', 'released',
    'cancel_undone', 'no_show_undone'
));
