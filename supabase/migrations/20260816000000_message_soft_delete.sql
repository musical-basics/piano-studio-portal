-- Soft-delete for chat messages.
--
-- A user can delete a message they SENT. The row is kept (so the thread stays
-- auditable and a delete is reversible by clearing deleted_at); the read layer
-- in lib/core/messages.ts strips content and attachments before they ever reach
-- a client, and the UI renders a "Message deleted" tombstone in its place.
--
-- Writes go through deleteMessageCore, which verifies ownership server-side and
-- uses the service-role client. No new client-facing write policy is added, so
-- this does not open any way for a user to edit a message's content.

ALTER TABLE "public"."messages"
    ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
    ADD COLUMN IF NOT EXISTS "deleted_by" "uuid" REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

COMMENT ON COLUMN "public"."messages"."deleted_at" IS
    'Set when the sender deletes the message. Content/attachments are redacted on read; the row is retained.';
COMMENT ON COLUMN "public"."messages"."deleted_by" IS
    'Profile that performed the delete. Always the sender under current rules.';

-- Deletions are rare, so a partial index keeps the "which messages in this
-- thread are deleted?" reconciliation query (used by the 5s chat poll) cheap.
CREATE INDEX IF NOT EXISTS "idx_messages_deleted_at"
    ON "public"."messages" ("deleted_at")
    WHERE "deleted_at" IS NOT NULL;
