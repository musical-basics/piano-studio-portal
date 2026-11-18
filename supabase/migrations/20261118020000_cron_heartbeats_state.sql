-- A small state blob for watches that need more than "when did it last run".
--
-- The classroom server watch (lib/classroom-server-watch.ts, Lionel's #724)
-- probes the self-hosted LiveKit server every 5 minutes and must email once
-- when it goes down (two misses in a row) and once when it is back. That needs
-- the last good answer, the current run of misses and whether the "down" email
-- already went out, kept between runs. It lives here, on the watch's own
-- cron_heartbeats row, instead of in a table of its own.

ALTER TABLE "public"."cron_heartbeats" ADD COLUMN IF NOT EXISTS "state" jsonb;

COMMENT ON COLUMN "public"."cron_heartbeats"."state" IS
    'Per-job state kept between runs, e.g. the classroom server watch: lastOkAt, consecutiveFailures, downSince, alerted.';
