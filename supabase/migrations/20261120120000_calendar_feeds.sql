-- #1082: "Add to my calendar". Each family gets a private, unguessable feed URL
-- (/api/calendar/<token>.ics) that keeps their lessons in their own phone
-- calendar. One row per student, made the first time the family asks for the
-- link; "Reset link" replaces the token, so the old URL stops working.
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
--
-- A table of its own rather than a profiles column: families may update their
-- own profiles row, and the student page reads profiles with select("*").
-- Here row security is on with no policies, so only the service key (the feed
-- route and the portal's server actions, which act for the signed-in family
-- only) can read or write a token. No family can see or set anyone's token.

CREATE TABLE IF NOT EXISTS "public"."calendar_feeds" (
    "student_id" "uuid" PRIMARY KEY REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "token" "text" NOT NULL UNIQUE CHECK (char_length("token") >= 32),
    "created_at" timestamptz NOT NULL DEFAULT "now"(),
    "reset_at" timestamptz,
    "last_fetched_at" timestamptz
);

ALTER TABLE "public"."calendar_feeds" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."calendar_feeds" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."calendar_feeds" IS
    'Private calendar feed tokens (#1082), one per student. Service key only (RLS on, no policies). Reset replaces the token.';
