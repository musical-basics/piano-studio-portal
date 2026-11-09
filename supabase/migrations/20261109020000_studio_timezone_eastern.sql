-- Studio time zone: Pacific -> Eastern (Lionel moved to Columbia, MD).
-- Run once against production on 2026-11-09, right after the deploy that set
-- STUDIO_TZ = 'America/New_York'. Converts every stored wall-clock time so each
-- lesson keeps its real moment, and flips studio_settings.timezone in the same
-- transaction (Elephant reads that row live). See docs/studio-timezone.md.
-- NOT safe to run twice: it would shift everything another 3 hours.

BEGIN;

-- Each lesson keeps its real moment: read it as Pacific wall-clock, write it as Eastern.
UPDATE lessons SET
    date = (((date + time) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/New_York')::date,
    time = (((date + time) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/New_York')::time;

UPDATE cancellation_log SET
    lesson_date = (((lesson_date + lesson_time::time) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/New_York')::date,
    lesson_time = to_char((((lesson_date + lesson_time::time) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/New_York')::time, 'HH24:MI:SS')
WHERE lesson_date IS NOT NULL AND lesson_time ~ '^\d{1,2}:\d{2}';

-- Standing weekly slots: Pacific to Eastern is +3 hours all year (both zones change
-- for daylight time on the same dates), rolling to the next day after 9pm Pacific.
UPDATE profiles SET
    lesson_day = CASE WHEN lesson_time::time >= '21:00' THEN
        (ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[
            array_position(ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], lesson_day)]
        ELSE lesson_day END,
    lesson_time = to_char(lesson_time::time + interval '3 hours', 'HH24:MI')
WHERE lesson_time ~ '^\d{1,2}:\d{2}';

-- Lionel's makeup-slot availability keeps its real hours too.
UPDATE profiles SET
    available_hours = (
        SELECT jsonb_agg(
            e || jsonb_build_object(
                'start', to_char((e->>'start')::time + interval '3 hours', 'HH24:MI'),
                'end',   to_char((e->>'end')::time + interval '3 hours', 'HH24:MI')))
        FROM jsonb_array_elements(available_hours) e),
    timezone = 'America/New_York'
WHERE role = 'admin' AND jsonb_typeof(available_hours) = 'array';

UPDATE studio_settings SET value = 'America/New_York', updated_at = now() WHERE key = 'timezone';

COMMIT;
