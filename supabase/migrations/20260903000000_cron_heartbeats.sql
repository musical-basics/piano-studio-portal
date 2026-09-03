-- Cron heartbeats, so a scheduler outage stops being silent.
--
-- Lesson reminders only fire when a cron tick lands inside a notice's 25-60
-- minute window (lib/reminder-policy.ts), and a missed window is never retried.
-- In Aug 2026 GitHub Actions throttled the every-10-minutes workflow down to
-- ~6 runs/day and reminders quietly stopped reaching students for a week.
--
-- Each reminder run stamps last_run_at here. That gives two things:
--   1. the gap since the previous tick, so a run can tell it was late and
--      report any notice window that elapsed unserved during the gap;
--   2. a staleness signal a *different* cron can check, since a scheduler
--      that has stopped entirely cannot report its own absence.
--
-- last_alert_at rate-limits the alert email so sustained throttling does not
-- flood the studio inbox.
--
-- Service-role only: no RLS policies are defined, so the anon/authenticated
-- roles cannot read or write it.

CREATE TABLE IF NOT EXISTS "public"."cron_heartbeats" (
    "job" "text" PRIMARY KEY,
    "last_run_at" timestamptz NOT NULL DEFAULT "now"(),
    "last_alert_at" timestamptz
);

ALTER TABLE "public"."cron_heartbeats" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."cron_heartbeats" IS
    'One row per scheduled job. last_run_at is stamped on every successful run; staleness means the scheduler is down.';
COMMENT ON COLUMN "public"."cron_heartbeats"."last_alert_at" IS
    'When the studio inbox was last emailed about this job, used to rate-limit repeat alerts.';
