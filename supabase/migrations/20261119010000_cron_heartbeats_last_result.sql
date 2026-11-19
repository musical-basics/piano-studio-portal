-- Did each scheduled job's last run work? (Lionel's #777, the admin jobs page.)
--
-- last_run_at already says when some jobs last ran OK, but only a few stamp it
-- and nothing records a failed run. Every cron route now records each run
-- through recordCronRun (lib/cron-runs.ts): when it finished, whether it
-- worked, and a short detail (the error text on a failure). The monthly
-- restore test on the Mac records the same. /admin/jobs reads them.
--
-- These are new columns, so the existing meaning of last_run_at and
-- last_alert_at (reminder gap detection, the backup watchdog, alert cooldowns)
-- is untouched. Service-role only, like the rest of the table.

ALTER TABLE "public"."cron_heartbeats" ADD COLUMN IF NOT EXISTS "last_finished_at" timestamptz;
ALTER TABLE "public"."cron_heartbeats" ADD COLUMN IF NOT EXISTS "last_ok" boolean;
ALTER TABLE "public"."cron_heartbeats" ADD COLUMN IF NOT EXISTS "last_detail" text;

COMMENT ON COLUMN "public"."cron_heartbeats"."last_finished_at" IS
    'When the job last finished a run, whether it worked or not (recordCronRun in lib/cron-runs.ts).';
COMMENT ON COLUMN "public"."cron_heartbeats"."last_ok" IS
    'Whether that last run worked. Null for rows only stamped through last_run_at.';
COMMENT ON COLUMN "public"."cron_heartbeats"."last_detail" IS
    'A short summary of that last run; the error text when it failed.';
