-- #984: email the studio when a family's plan payment fails twice in a row,
-- and again if Stripe gives up and ends the plan. See lib/plan-payment-alerts.ts
-- and app/api/cron/plan-payment-check.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
--
-- plan_payment_events: every Stripe event about a plan payment, once by its
-- event id (the hourly check and the webhook can both see the same event).
-- The failure run is read from here: failed payments since the last paid one.
-- plan_payment_alerts: one row per email, claimed BEFORE it is sent, so the
-- same failure run (or the same ended plan) is never emailed twice.
-- RLS on with no policies: service-role access only.

CREATE TABLE IF NOT EXISTS "public"."plan_payment_events" (
    "stripe_event_id" "text" PRIMARY KEY,
    "subscription_id" "text" NOT NULL,
    "kind" "text" NOT NULL CHECK ("kind" IN ('failed', 'paid', 'ended')),
    -- When it happened at Stripe.
    "at" timestamptz NOT NULL,
    "invoice_id" "text",
    -- The event as lib/plan-payment-alerts.ts reads it (PlanEvent).
    "event" "jsonb" NOT NULL,
    "recorded_at" timestamptz NOT NULL DEFAULT "now"()
);
CREATE INDEX IF NOT EXISTS "plan_payment_events_subscription_at"
    ON "public"."plan_payment_events" ("subscription_id", "at");

CREATE TABLE IF NOT EXISTS "public"."plan_payment_alerts" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "subscription_id" "text" NOT NULL,
    -- 'failed:<first failed event of the run>' or 'ended'.
    "alert_key" "text" NOT NULL,
    "kind" "text" NOT NULL CHECK ("kind" IN ('failed_twice', 'ended_unpaid')),
    "student_id" "uuid" REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
    -- The event that raised it.
    "event_id" "text",
    "claimed_at" timestamptz NOT NULL DEFAULT "now"(),
    "sent_at" timestamptz,
    CONSTRAINT "plan_payment_alerts_once" UNIQUE ("subscription_id", "alert_key")
);

ALTER TABLE "public"."plan_payment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."plan_payment_alerts" ENABLE ROW LEVEL SECURITY;
