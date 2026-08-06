-- Confirmation-aware reminder notices.
--
-- Unconfirmed lessons get 48h / 24h / 12h / 15m notices asking the student to
-- confirm; confirmed lessons get just the 24h and 15m reminders. These two
-- columns are the dedupe flags for the new 48h and 12h notices, matching the
-- existing reminder_24h_sent / reminder_15m_sent pattern.
--
-- reminder_2h_sent still exists but is no longer used (the 2h reminder was
-- replaced by this schedule).
--
-- Applied to production 2026-08-06 via the management API.

ALTER TABLE public.lessons
    ADD COLUMN IF NOT EXISTS reminder_48h_sent boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS reminder_12h_sent boolean DEFAULT false;
