-- #980: where a student's lessons happen, 'zoom' (default) or 'classroom'.
-- A classroom student's reminders, lesson-scheduled emails, portal join button
-- and the studio's 9pm / morning emails give the classroom link
-- (classroom.musicalbasics.com/<public_id>) instead of Zoom. Zoom meetings are
-- still created as before; they are just not shown to classroom families.
-- Set per student with the switch in Edit Student. See lib/lesson-venue.ts.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS lesson_venue text NOT NULL DEFAULT 'zoom';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_lesson_venue_check') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_lesson_venue_check CHECK (lesson_venue IN ('zoom', 'classroom'));
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.lesson_venue IS
    'Where this student''s lessons happen: zoom (default) or classroom. Classroom families are given the classroom link instead of Zoom (#980).';
