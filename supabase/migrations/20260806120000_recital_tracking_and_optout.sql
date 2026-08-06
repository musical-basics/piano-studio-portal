-- Recital email tracking + announcement-email opt-out.
--
-- recital_email_events stores self-hosted open/click tracking (no redirect
-- wrapping: opens come from a 1x1 pixel served by /api/recital-track, clicks
-- are logged when the RSVP page is loaded with the src=em URL param).
-- RLS enabled with no policies: service-role access only.
--
-- profiles.announcement_emails_opt_out backs the unsubscribe link in
-- announcement emails (recital invites etc.); transactional lesson emails are
-- unaffected.
--
-- Applied to production 2026-08-06 via the management API.

CREATE TABLE IF NOT EXISTS public.recital_email_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id uuid NOT NULL,
    student_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('open', 'click')),
    detail text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recital_email_events_event_student_idx
    ON public.recital_email_events (event_id, student_id);
ALTER TABLE public.recital_email_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS announcement_emails_opt_out boolean DEFAULT false;
