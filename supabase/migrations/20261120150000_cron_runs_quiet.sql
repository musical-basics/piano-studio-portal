-- Quiet runs kept once an hour (Lionel's #1077, follow-up). Applied to prod by
-- hand on 2026-11-20.
--
-- Jobs that run every few minutes (lesson reminders every 10, the classroom
-- server watch every 5, the classroom "student waiting alone" check every
-- minute, the family message watcher every 10) would fill cron_runs with tens
-- of thousands of identical "nothing to do" rows a month. Now a run is always
-- kept when it did something or failed, and a quiet run (it worked, did
-- nothing, and the run before it worked too) only when the job has no run on
-- record in the last 55 minutes: at most one quiet row an hour. Hourly,
-- daily and monthly jobs are never more frequent than that, so every one of
-- their runs is kept. The page's day marks read the same.
--
-- Quiet is said by the run itself: recordCronRun (lib/cron-runs.ts) writes the
-- new last_quiet from the job's own rule (lib/scheduled-jobs.ts, e.g. "no
-- reminders due"). A job without a rule (null) counts as quiet when its
-- one-line detail is the same as the run before. The Mac's backup and family
-- watcher check-ins are always quiet.

ALTER TABLE "public"."cron_heartbeats" ADD COLUMN IF NOT EXISTS "last_quiet" boolean;

COMMENT ON COLUMN "public"."cron_heartbeats"."last_quiet" IS
    'Whether the last finished run worked and did nothing (recordCronRun); null = judge by an unchanged last_detail. Quiet runs are kept in cron_runs at most once an hour.';

CREATE OR REPLACE FUNCTION "public"."cron_heartbeats_record_run"() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    finished_moved boolean;
    checkin_moved boolean;
    quiet boolean;
    run_at timestamptz;
BEGIN
    BEGIN
        IF TG_OP = 'INSERT' THEN
            finished_moved := NEW.last_finished_at IS NOT NULL;
            checkin_moved := NEW.last_run_at IS NOT NULL;
            quiet := false;
        ELSE
            finished_moved := NEW.last_finished_at IS NOT NULL AND NEW.last_finished_at IS DISTINCT FROM OLD.last_finished_at;
            checkin_moved := NEW.last_run_at IS NOT NULL AND NEW.last_run_at IS DISTINCT FROM OLD.last_run_at;
            quiet := COALESCE(NEW.last_ok, true) AND OLD.last_ok IS NOT FALSE
                AND COALESCE(NEW.last_quiet, NEW.last_detail IS NOT DISTINCT FROM OLD.last_detail);
        END IF;

        IF finished_moved THEN
            run_at := NEW.last_finished_at;
        ELSIF checkin_moved AND NEW.job IN ('studio-backup', 'family-watch') THEN
            run_at := NEW.last_run_at;
            quiet := true;
        ELSE
            RETURN NULL;
        END IF;

        IF quiet AND EXISTS (
            SELECT 1 FROM public.cron_runs r
            WHERE r.job = NEW.job AND r.finished_at > run_at - interval '55 minutes'
        ) THEN
            RETURN NULL;
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
        ELSE
            INSERT INTO public.cron_runs (job, finished_at, ok) VALUES (NEW.job, NEW.last_run_at, true);
        END IF;

        DELETE FROM public.cron_runs WHERE job = NEW.job AND finished_at < now() - interval '31 days';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'cron_runs: run of % not recorded: %', NEW.job, SQLERRM;
    END;
    RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION "public"."cron_heartbeats_record_run"() FROM PUBLIC, anon, authenticated;

-- Thin out what the first hours already kept (only a few hours of history
-- exist): quiet runs within 55 minutes of the run before them. Failures and
-- runs that did something (a detail different from the run before) stay.
WITH ordered AS (
    SELECT id, ok, detail, finished_at,
           lag(ok) OVER w AS prev_ok,
           lag(detail) OVER w AS prev_detail,
           lag(finished_at) OVER w AS prev_at
    FROM public.cron_runs
    WINDOW w AS (PARTITION BY job ORDER BY finished_at)
)
DELETE FROM public.cron_runs r
USING ordered o
WHERE r.id = o.id
  AND o.ok AND o.prev_ok IS TRUE
  AND o.detail IS NOT DISTINCT FROM o.prev_detail
  AND o.prev_at > o.finished_at - interval '55 minutes';
