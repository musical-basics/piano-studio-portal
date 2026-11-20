-- 30 days of runs per scheduled job (Lionel's #1077), for the row of green and
-- red marks on /admin/jobs. Applied to prod by hand on 2026-11-20.
--
-- cron_heartbeats keeps only each job's last run. cron_runs keeps one row per
-- run for the last 30 days. Its rows come from a trigger on cron_heartbeats,
-- so every writer feeds it without changing anything on their side: the
-- portal's cron routes (recordCronRun in lib/cron-runs.ts) and the Mac's
-- scripts (plain REST upserts, some running as installed copies) alike.
--
--   - A moved last_finished_at is a run (portal routes, lesson transcripts,
--     restore test): ok and detail from last_ok and last_detail, and the
--     duration from last_duration_ms (new here, written by recordCronRun).
--   - The Mac's nightly backup and family message watcher only stamp
--     last_run_at when they check in: on those two rows a moved last_run_at is
--     a run that worked.
--   - Every other last_run_at stamp (per-trigger rows like "reminders:vercel",
--     alert cooldown rows, the reminders' own gap heartbeat, saved state) is
--     not a run and is left out.
--
-- The trigger never fails the heartbeat write it rides on: any error becomes a
-- warning in the database log. Each insert also deletes that job's runs older
-- than 31 days, so the table stays small (about 30,000 rows, a few MB).
--
-- cron_run_days() adds them up per job per studio day for the page.
-- Service-role only: RLS on with no policies, and the function is not
-- executable by anon or authenticated.

ALTER TABLE "public"."cron_heartbeats" ADD COLUMN IF NOT EXISTS "last_duration_ms" integer;

COMMENT ON COLUMN "public"."cron_heartbeats"."last_duration_ms" IS
    'How long the last finished run took, in milliseconds (recordCronRun); copied into cron_runs.';

CREATE TABLE IF NOT EXISTS "public"."cron_runs" (
    "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "job" text NOT NULL,
    "started_at" timestamptz,
    "finished_at" timestamptz NOT NULL,
    "ok" boolean NOT NULL,
    "detail" text,
    "duration_ms" integer
);

CREATE INDEX IF NOT EXISTS "cron_runs_job_finished_at_idx" ON "public"."cron_runs" ("job", "finished_at" DESC);
CREATE INDEX IF NOT EXISTS "cron_runs_finished_at_idx" ON "public"."cron_runs" ("finished_at");

ALTER TABLE "public"."cron_runs" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."cron_runs" IS
    'One row per scheduled job run, last 31 days, written by the cron_heartbeats trigger (Lionel''s #1077, /admin/jobs).';

CREATE OR REPLACE FUNCTION "public"."cron_heartbeats_record_run"() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    finished_moved boolean;
    checkin_moved boolean;
BEGIN
    BEGIN
        IF TG_OP = 'INSERT' THEN
            finished_moved := NEW.last_finished_at IS NOT NULL;
            checkin_moved := NEW.last_run_at IS NOT NULL;
        ELSE
            finished_moved := NEW.last_finished_at IS NOT NULL AND NEW.last_finished_at IS DISTINCT FROM OLD.last_finished_at;
            checkin_moved := NEW.last_run_at IS NOT NULL AND NEW.last_run_at IS DISTINCT FROM OLD.last_run_at;
        END IF;

        IF finished_moved THEN
            INSERT INTO public.cron_runs (job, started_at, finished_at, ok, detail, duration_ms)
            VALUES (
                NEW.job,
                CASE WHEN NEW.last_duration_ms IS NOT NULL
                    THEN NEW.last_finished_at - make_interval(secs => NEW.last_duration_ms / 1000.0) END,
                NEW.last_finished_at,
                COALESCE(NEW.last_ok, true),
                NEW.last_detail,
                NEW.last_duration_ms
            );
        ELSIF checkin_moved AND NEW.job IN ('studio-backup', 'family-watch') THEN
            INSERT INTO public.cron_runs (job, finished_at, ok) VALUES (NEW.job, NEW.last_run_at, true);
        ELSE
            RETURN NULL;
        END IF;

        DELETE FROM public.cron_runs WHERE job = NEW.job AND finished_at < now() - interval '31 days';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'cron_runs: run of % not recorded: %', NEW.job, SQLERRM;
    END;
    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS "cron_heartbeats_record_run" ON "public"."cron_heartbeats";
CREATE TRIGGER "cron_heartbeats_record_run"
    AFTER INSERT OR UPDATE ON "public"."cron_heartbeats"
    FOR EACH ROW EXECUTE FUNCTION "public"."cron_heartbeats_record_run"();

REVOKE ALL ON FUNCTION "public"."cron_heartbeats_record_run"() FROM PUBLIC, anon, authenticated;

-- Per job per studio day since p_since: how many runs, how many failed, the
-- last one's detail and duration, and the last failure's time and detail.
CREATE OR REPLACE FUNCTION "public"."cron_run_days"(p_since timestamptz, p_tz text DEFAULT 'America/New_York')
    RETURNS TABLE (
        job text,
        day date,
        runs integer,
        failed integer,
        last_at timestamptz,
        last_detail text,
        last_duration_ms integer,
        failed_at timestamptz,
        failed_detail text
    )
    LANGUAGE sql
    STABLE
    SET search_path = public
AS $$
    SELECT r.job,
           (r.finished_at AT TIME ZONE p_tz)::date,
           count(*)::integer,
           (count(*) FILTER (WHERE NOT r.ok))::integer,
           max(r.finished_at),
           (array_agg(r.detail ORDER BY r.finished_at DESC))[1],
           (array_agg(r.duration_ms ORDER BY r.finished_at DESC))[1],
           max(r.finished_at) FILTER (WHERE NOT r.ok),
           (array_agg(r.detail ORDER BY r.finished_at DESC) FILTER (WHERE NOT r.ok))[1]
    FROM public.cron_runs r
    WHERE r.finished_at >= p_since
    GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION "public"."cron_run_days"(timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."cron_run_days"(timestamptz, text) TO service_role;

-- Start the history with each job's last recorded run, so the page has a mark
-- for it from day one.
INSERT INTO "public"."cron_runs" (job, finished_at, ok, detail)
SELECT h.job, h.last_finished_at, COALESCE(h.last_ok, true), h.last_detail
FROM "public"."cron_heartbeats" h
WHERE h.last_finished_at IS NOT NULL
  AND h.last_finished_at >= now() - interval '31 days'
  AND NOT EXISTS (SELECT 1 FROM "public"."cron_runs" r WHERE r.job = h.job);

INSERT INTO "public"."cron_runs" (job, finished_at, ok)
SELECT h.job, h.last_run_at, true
FROM "public"."cron_heartbeats" h
WHERE h.job IN ('studio-backup', 'family-watch')
  AND h.last_finished_at IS NULL
  AND h.last_run_at >= now() - interval '31 days'
  AND NOT EXISTS (SELECT 1 FROM "public"."cron_runs" r WHERE r.job = h.job);
