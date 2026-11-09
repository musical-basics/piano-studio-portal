-- Studio-wide settings other apps read live. First one: the studio's time zone.
--
-- lessons.date / lessons.time (and profiles.lesson_day / lesson_time,
-- cancellation_log.lesson_date / lesson_time) are wall-clock values in this
-- zone, with no offset stored. Anything outside the portal that turns them
-- into real moments (Lionel's calendar app, agents) must read the zone from
-- here, not assume one. When the studio changes zone, the stored times are
-- converted and this row is flipped in the same transaction, so a reader that
-- uses this row always agrees with the data.

CREATE TABLE IF NOT EXISTS public.studio_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.studio_settings (key, value)
VALUES ('timezone', 'America/Los_Angeles')
ON CONFLICT (key) DO NOTHING;

-- Readable by anyone (nothing secret in it); written only with the service role.
ALTER TABLE public.studio_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "studio settings are readable" ON public.studio_settings;
CREATE POLICY "studio settings are readable" ON public.studio_settings FOR SELECT USING (true);
