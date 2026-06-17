-- Credit transaction ledger.
--
-- profiles.credits is a single mutable integer with no history, which made a
-- batch of accidental deductions on 2026-06-17 impossible to reverse precisely.
-- This adds an append-only ledger and a trigger that records EVERY change to
-- profiles.credits automatically, regardless of which code path made it (lesson
-- completion, admin action, Stripe top-up, repair, scripts). Reversal/audit then
-- becomes: read the rows in a time window.

CREATE TABLE IF NOT EXISTS "public"."credit_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "previous_credits" integer NOT NULL,
    "new_credits" integer NOT NULL,
    "delta" integer NOT NULL,
    -- Optional context. Populated when a caller sets the `app.credit_source`
    -- GUC in its transaction (e.g. SET LOCAL app.credit_source = 'stripe'); NULL
    -- otherwise. The ledger is complete either way.
    "source" "text",
    "note" "text",
    "changed_at" timestamptz DEFAULT "now"() NOT NULL
);

CREATE INDEX IF NOT EXISTS "credit_transactions_student_changed_idx"
    ON "public"."credit_transactions" ("student_id", "changed_at" DESC);
CREATE INDEX IF NOT EXISTS "credit_transactions_changed_at_idx"
    ON "public"."credit_transactions" ("changed_at" DESC);

-- Lock down: only the service role (which bypasses RLS) may read/write. Students
-- and anon must never see credit history. RLS on + no policies = deny all.
ALTER TABLE "public"."credit_transactions" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION "public"."log_credit_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" AS $$
BEGIN
    IF NEW."credits" IS DISTINCT FROM OLD."credits" THEN
        INSERT INTO "public"."credit_transactions"
            ("student_id", "previous_credits", "new_credits", "delta", "source")
        VALUES (
            NEW."id",
            OLD."credits",
            NEW."credits",
            NEW."credits" - OLD."credits",
            NULLIF("current_setting"('app.credit_source', true), '')
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "profiles_log_credit_change" ON "public"."profiles";
CREATE TRIGGER "profiles_log_credit_change"
    AFTER UPDATE OF "credits" ON "public"."profiles"
    FOR EACH ROW EXECUTE FUNCTION "public"."log_credit_change"();

COMMENT ON TABLE "public"."credit_transactions" IS
    'Append-only audit log of every change to profiles.credits, written by the profiles_log_credit_change trigger. Service-role access only.';
