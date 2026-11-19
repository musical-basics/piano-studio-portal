-- #936: a short monthly statement to each family on the 1st (lessons held last
-- month, lessons left, next payment date if on a plan). See
-- lib/monthly-statements.ts and app/api/cron/monthly-statements.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
--
-- One row per family per month, claimed BEFORE the email goes out, so a re-run
-- (or a second trigger) never sends a family the same month twice. A send that
-- Resend clearly refused releases its claim so a re-run can retry it; anything
-- unclear keeps the claim with the error noted.
-- RLS on with no policies: service-role access only.

CREATE TABLE IF NOT EXISTS "public"."monthly_statements_sent" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    -- The month the statement covers, "YYYY-MM" (studio time).
    "month" "text" NOT NULL CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    "claimed_at" timestamptz NOT NULL DEFAULT "now"(),
    "sent_at" timestamptz,
    "resend_id" "text",
    "error" "text",
    CONSTRAINT "monthly_statements_sent_once" UNIQUE ("student_id", "month")
);

ALTER TABLE "public"."monthly_statements_sent" ENABLE ROW LEVEL SECURITY;
