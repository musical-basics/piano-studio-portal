-- #1097: "Undo" for 10 minutes after Lionel marks a lesson a no-show.
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
--
-- Marking a no-show overwrites the lesson's status and notes (markNoShowCore),
-- so it now keeps what they were here: { at, status, notes }. Undo puts them
-- back (and the credit) within 10 minutes of `at`, then clears it. Additive only.

alter table public.lessons add column if not exists no_show_before jsonb;
