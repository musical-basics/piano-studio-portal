-- #989: a lesson that is deliberately waiting (e.g. on a parent's OK) can be put
-- "on hold" with a reason. A held lesson is left out of the red unlogged badge
-- and the unlogged emails (8:30am, 11pm, the monthly list), and nothing logs,
-- removes or no-shows it (email buttons, admin buttons, automatic logging) until
-- Lionel releases it. Null = not on hold.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
alter table public.lessons add column if not exists on_hold_reason text
    check (on_hold_reason is null or char_length(on_hold_reason) between 1 and 300);
alter table public.lessons add column if not exists on_hold_at timestamptz;
