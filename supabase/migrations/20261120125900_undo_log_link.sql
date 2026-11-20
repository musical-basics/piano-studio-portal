-- #1063: "Undo log" next to each automatic log in the morning email. Its
-- one-time link is recorded in lesson_action_link_uses like the other email
-- buttons, so the action check gets 'undo_log'. Additive only.
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).

alter table public.lesson_action_link_uses drop constraint if exists lesson_action_link_uses_action_check;
alter table public.lesson_action_link_uses add constraint lesson_action_link_uses_action_check check (action in (
    'log', 'remove', 'missed', 'noshow', 'approve_move', 'decline_move', 'undo_log'
));
