-- Money ledger: fees the family owes, and dollar credits they have been given.
--
-- Before this, money moved in two places with no history and no shared vocabulary:
--
--   * `profiles.balance_due`, a lump sum of ad-hoc charges (sheet music, the
--     late-cancel fee). The portal showed the number but never what it was for, so
--     a parent could see "$45.00" with no way to find out why.
--   * The Stripe customer balance, the only thing that actually reduces a
--     recurring subscription charge. Nothing in the app read or wrote it, so a
--     dollar credit was invisible to the family until the invoice arrived.
--
-- Note this is about DOLLARS. `profiles.credits` is a count of LESSONS and has its
-- own ledger (credit_transactions); the two must never be confused.
--
-- This table is the append-only record behind the portal's billing section. It is
-- a display/audit log, not the source of truth: balance_due and the Stripe
-- customer balance remain authoritative for what is owed and what is credited.

CREATE TABLE IF NOT EXISTS "public"."billing_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,

    "kind" "text" NOT NULL CHECK ("kind" IN (
        'fee',              -- ad-hoc charge or late-cancel fee added to balance_due
        'fee_waived',       -- an admin removed a fee from balance_due
        'balance_payment',  -- the family paid their outstanding balance
        'account_credit'    -- dollar credit applied to the Stripe customer balance
    )),

    -- Signed, in cents, from the family's point of view:
    --   positive = they owe more   (a fee)
    --   negative = they owe less   (a waiver, a payment, a credit)
    -- Stored in cents so this never drifts the way a float dollar amount would.
    "amount_cents" integer NOT NULL,

    -- Shown verbatim to the parent in the portal, so it must read as an
    -- explanation ("Sheet music: Bach Prelude"), not an internal code.
    "description" "text" NOT NULL,

    -- Which pot the money moved in, and therefore how the family settles it:
    --   'balance'      -> profiles.balance_due, paid by its own one-off checkout
    --   'subscription' -> Stripe customer balance, auto-applied to the next invoice
    "applies_to" "text" NOT NULL CHECK ("applies_to" IN ('balance', 'subscription')),

    -- Set on 'account_credit' rows: the Stripe customer balance transaction that
    -- actually moved the money. Unique, so replaying an admin action or a script
    -- cannot log the same credit twice.
    "stripe_balance_txn_id" "text",

    "created_by" "uuid" REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT "now"() NOT NULL
);

CREATE INDEX IF NOT EXISTS "billing_transactions_student_created_idx"
    ON "public"."billing_transactions" ("student_id", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_transactions_stripe_txn_idx"
    ON "public"."billing_transactions" ("stripe_balance_txn_id")
    WHERE "stripe_balance_txn_id" IS NOT NULL;

-- Students read their own history through getBillingHistory(), a server action
-- that uses the service-role client and scopes by the effective user id (so admin
-- impersonation previews correctly). Matching credit_transactions and
-- cancellation_log: RLS on with no policies = deny all for anon and student keys.
ALTER TABLE "public"."billing_transactions" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."billing_transactions" IS
    'Append-only ledger of dollar fees and credits, shown to families in the portal billing section. Display/audit only: profiles.balance_due and the Stripe customer balance remain authoritative. Not to be confused with credit_transactions, which tracks LESSON credits. Service-role access only.';
