# Studio time zone

Lesson dates and times are stored as **wall-clock values in the studio's time zone, with no offset**: `lessons.date` + `lessons.time`, `profiles.lesson_day` + `profiles.lesson_time`, `cancellation_log.lesson_date` + `lesson_time`, and the admin's `profiles.available_hours`. Everything else that holds a moment (`events.start_time`, `makeup_slots`, Zoom meetings, Google Calendar events) is an absolute timestamp and never needs converting.

The zone is named in two places that must always agree:

| Where | Who reads it |
| --- | --- |
| `STUDIO_TZ` in `lib/studio-timezone.ts` | the portal's own code (server and browser) |
| `studio_settings.timezone` (database row, readable with the public key) | other apps, live: Lionel's calendar app (Elephant), agents |

`GET /api/agent/lessons` also returns `studio_timezone` and a `starts_at` ISO timestamp per lesson, so API readers can skip the zone entirely.

## Changing the studio's zone

Changing only the code shifts every lesson by the zone difference; changing only the data does the same the other way. Do all of this in one sitting, at a quiet time (no lesson in the next few hours, since the reminders cron runs every 10 minutes):

1. Make sure every outside reader (Elephant) reads `studio_settings.timezone` or `starts_at` and does not assume a zone.
2. Change `STUDIO_TZ`, push, and wait for the Vercel deploy to go live.
3. Immediately run the conversion below against production. It is one transaction: the times convert and `studio_settings.timezone` flips together, so a reader using the setting never sees a mismatch.
4. Check a few upcoming lessons: `starts_at` from `GET /api/agent/lessons` must be the same instants as before the switch.

Conversion, Pacific to Eastern (swap the two zone names, and the `+ 3 hours`, for any other pair):

```sql
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
```

Not converted, on purpose: `lesson_intent_flags.target_date` (a date only; it would move only for a lesson after 9pm Pacific, and there are no standing slots that late), and each student's own `profiles.timezone` (that is the family's zone, used to show them their local time).

## History

- Until 2026-11-09 the studio ran on Pacific time (Lionel lived in Las Vegas). He moved to Columbia, Maryland; the switch to Eastern was coordinated with Elephant through the command center.
