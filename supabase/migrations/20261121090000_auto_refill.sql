-- #1477 Auto-refill plan: instead of paying every month, the family's saved
-- card is charged for 4 lessons (at their monthly plan's price) each time
-- their lessons run out. Offered next to the monthly plan, on a half split
-- (protocol 1.20). Applied to prod by hand on 2026-11-21 (migrations are not
-- auto-run). Additive only.
--
-- auto_refill_plans   one row per family that turned it on (on or off now),
--                     with the saved card and the price they agreed to.
-- auto_refills        every refill: the first 4 lessons bought at checkout
--                     ('start') and each charge when the lessons ran out
--                     ('refill'). At most one open refill per family (the
--                     partial unique index), and each refill has its own
--                     Stripe PaymentIntent, so one run-out is never charged
--                     twice.
-- credit_auto_refill  adds a paid refill's lessons once, labelled
--                     'auto-refill' in the credit history.
--
-- Service key only: RLS on, no policies; the portal reads them through server
-- actions that check who is asking.

CREATE TABLE IF NOT EXISTS "public"."auto_refill_plans" (
    "student_id" uuid PRIMARY KEY REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "status" text NOT NULL DEFAULT 'on' CHECK ("status" IN ('on', 'off')),
    "stripe_customer_id" text,
    "payment_method_id" text,
    "card_brand" text,
    "card_last4" text,
    -- What each refill gives and costs, from the family's monthly plan when they chose it.
    "credits" integer NOT NULL CHECK ("credits" > 0),
    "price_cents" integer NOT NULL CHECK ("price_cents" >= 50),
    "pricing_point_id" uuid REFERENCES "public"."pricing_points"("id") ON DELETE SET NULL,
    "started_at" timestamptz NOT NULL DEFAULT "now"(),
    -- A lesson taken after this that leaves the balance at 0 or below starts a
    -- refill. Moves on when a refill lands or is skipped.
    "armed_at" timestamptz NOT NULL DEFAULT "now"(),
    -- The Checkout that turned it on, and the last one that changed the card
    -- (the webhook and the return page both see them; only one applies each).
    "start_session_id" text,
    "card_session_id" text,
    -- A monthly plan set to end at its period end when they switched.
    "ended_subscription_id" text,
    "last_refill_at" timestamptz,
    "stopped_at" timestamptz,
    "stopped_by" text CHECK ("stopped_by" IN ('family', 'admin')),
    "created_at" timestamptz NOT NULL DEFAULT "now"(),
    "updated_at" timestamptz NOT NULL DEFAULT "now"()
);

ALTER TABLE "public"."auto_refill_plans" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."auto_refill_plans" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."auto_refill_plans" IS
    '#1477 auto-refill: families whose saved card is charged for their monthly number of lessons each time the lessons run out. Service key only.';

CREATE TABLE IF NOT EXISTS "public"."auto_refills" (
    "id" uuid PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "student_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "kind" text NOT NULL CHECK ("kind" IN ('start', 'refill')),
    -- due: waiting to be charged; charging: a charge is in flight; failed:
    -- declined (retried at next_retry_at, or waiting for a new card when that
    -- is empty); paid; skipped: the lessons were no longer at 0 when it came
    -- to charging; cancelled: auto-refill was turned off first.
    "status" text NOT NULL CHECK ("status" IN ('due', 'charging', 'failed', 'paid', 'skipped', 'cancelled')),
    "credits" integer NOT NULL CHECK ("credits" > 0),
    "price_cents" integer NOT NULL CHECK ("price_cents" >= 0),
    -- What the card is charged: the price less any dollar account credit used.
    "amount_cents" integer NOT NULL CHECK ("amount_cents" >= 0),
    "account_credit_cents" integer NOT NULL DEFAULT 0 CHECK ("account_credit_cents" >= 0),
    -- The lesson log (credit_transactions.changed_at) that ran the lessons out.
    "triggered_at" timestamptz,
    "stripe_payment_intent_id" text UNIQUE,
    "checkout_session_id" text UNIQUE,
    "attempts" integer NOT NULL DEFAULT 0,
    "next_retry_at" timestamptz,
    "last_error" text,
    "charging_at" timestamptz,
    "paid_at" timestamptz,
    "credited_at" timestamptz,
    "credits_before" integer,
    "credits_after" integer,
    "note" text,
    "created_at" timestamptz NOT NULL DEFAULT "now"(),
    "updated_at" timestamptz NOT NULL DEFAULT "now"()
);

-- One open refill per family: a run-out can never start a second charge.
CREATE UNIQUE INDEX IF NOT EXISTS "auto_refills_one_open_idx"
    ON "public"."auto_refills" ("student_id")
    WHERE "status" IN ('due', 'charging', 'failed');

CREATE INDEX IF NOT EXISTS "auto_refills_student_created_idx"
    ON "public"."auto_refills" ("student_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "auto_refills_status_idx"
    ON "public"."auto_refills" ("status", "next_retry_at");

ALTER TABLE "public"."auto_refills" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."auto_refills" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."auto_refills" IS
    '#1477 auto-refill: the first purchase and every refill charge, one Stripe PaymentIntent each, at most one open per family. Service key only.';

-- Adds a paid refill's lessons, once. Locks the refill row, so the webhook,
-- the return page and the cron can all call it: only the first adds lessons.
-- The ledger row is labelled 'auto-refill'.
CREATE OR REPLACE FUNCTION "public"."credit_auto_refill"(p_refill uuid)
    RETURNS TABLE (previous_credits integer, new_credits integer, already boolean)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r auto_refills%ROWTYPE;
    v_new integer;
BEGIN
    SELECT * INTO r FROM auto_refills WHERE id = p_refill FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'refill not found';
    END IF;
    IF r.credited_at IS NOT NULL THEN
        RETURN QUERY SELECT r.credits_before, r.credits_after, true;
        RETURN;
    END IF;
    IF r.status <> 'paid' THEN
        RAISE EXCEPTION 'refill is not paid (status %)', r.status;
    END IF;
    PERFORM set_config('app.credit_source', 'auto-refill', true);
    PERFORM set_config('app.credit_note', CASE WHEN r.kind = 'start' THEN 'auto-refill started' ELSE 'lessons ran out' END, true);
    UPDATE profiles SET credits = coalesce(credits, 0) + r.credits
     WHERE id = r.student_id
     RETURNING credits INTO v_new;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'student not found';
    END IF;
    PERFORM set_config('app.credit_source', '', true);
    PERFORM set_config('app.credit_note', '', true);
    UPDATE auto_refills
       SET credited_at = now(), credits_before = v_new - r.credits, credits_after = v_new, updated_at = now()
     WHERE id = p_refill;
    UPDATE auto_refill_plans
       SET armed_at = now(), last_refill_at = now(), updated_at = now()
     WHERE student_id = r.student_id;
    RETURN QUERY SELECT v_new - r.credits, v_new, false;
END;
$$;

REVOKE ALL ON FUNCTION "public"."credit_auto_refill"(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."credit_auto_refill"(uuid) TO service_role;

-- Protocol 1.20: offered to half the families first (the Tests card on /admin/jobs).
INSERT INTO "public"."portal_rollouts" ("feature", "stage", "note") VALUES
    ('auto_refill', 'half', 'New: auto-refill offered next to the monthly plan when buying (#1477): 4 lessons at the monthly price, charged only when the lessons run out. Old: the monthly plan and lesson packages only. Off also pauses refill charges.')
ON CONFLICT ("feature") DO NOTHING;
