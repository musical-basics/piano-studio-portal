-- Chat reactions and replies.
--
-- 1. message_reactions
--    One row per (message, user, emoji). The UI offers a fixed set (thumbs up,
--    heart, party); the allowed set is enforced in TypeScript
--    (lib/chat-reactions.ts) rather than as a SQL IN-list, so adding an emoji
--    later doesn't need a migration and so no encoding mismatch between this
--    file and the app can reject a legitimate reaction. The column constraint
--    here is only a sanity bound on length.
--
--    Writes go through toggleReactionCore on the service-role client, which
--    verifies the actor is a participant in the underlying message. The
--    client-facing policies below are still written tightly so a direct
--    PostgREST call can't react on a stranger's thread.
--
-- 2. messages.reply_to_id
--    A message may quote an earlier one in the same thread. The quoted excerpt
--    is NOT denormalized: the read layer resolves the parent row on the fly, so
--    an edit to the original updates the quote and a deleted original shows as
--    "Message deleted" instead of leaking text the sender removed.

ALTER TABLE "public"."messages"
    ADD COLUMN IF NOT EXISTS "reply_to_id" "uuid" REFERENCES "public"."messages"("id") ON DELETE SET NULL;

COMMENT ON COLUMN "public"."messages"."reply_to_id" IS
    'The message this one replies to. The quoted preview is resolved from the parent row on read, never copied, so edits and deletes of the original propagate.';

-- Replies are a minority of messages, so a partial index keeps the parent
-- lookup (one query per loaded page) cheap.
CREATE INDEX IF NOT EXISTS "idx_messages_reply_to_id"
    ON "public"."messages" ("reply_to_id")
    WHERE "reply_to_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "message_id" "uuid" NOT NULL REFERENCES "public"."messages"("id") ON DELETE CASCADE,
    "user_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_reactions_emoji_check" CHECK (("char_length"("emoji") BETWEEN 1 AND 16))
);

ALTER TABLE "public"."message_reactions" OWNER TO "postgres";

COMMENT ON TABLE "public"."message_reactions" IS
    'Emoji reactions on chat messages. One row per (message, user, emoji); a repeat tap deletes the row.';

-- A user can hold each emoji on a message at most once; the toggle relies on this.
CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_unique"
    ON "public"."message_reactions" ("message_id", "user_id", "emoji");

-- Reactions are read per loaded page (WHERE message_id IN (...)).
CREATE INDEX IF NOT EXISTS "idx_message_reactions_message_id"
    ON "public"."message_reactions" ("message_id");

ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view reactions on their messages" ON "public"."message_reactions";
CREATE POLICY "Users can view reactions on their messages" ON "public"."message_reactions"
    FOR SELECT USING (
        "public"."is_admin"() OR EXISTS (
            SELECT 1 FROM "public"."messages" "m"
            WHERE "m"."id" = "message_reactions"."message_id"
              AND ("auth"."uid"() = "m"."sender_id" OR "auth"."uid"() = "m"."recipient_id")
        )
    );

DROP POLICY IF EXISTS "Users can add own reactions" ON "public"."message_reactions";
CREATE POLICY "Users can add own reactions" ON "public"."message_reactions"
    FOR INSERT WITH CHECK (
        "auth"."uid"() = "user_id" AND EXISTS (
            SELECT 1 FROM "public"."messages" "m"
            WHERE "m"."id" = "message_reactions"."message_id"
              AND ("auth"."uid"() = "m"."sender_id" OR "auth"."uid"() = "m"."recipient_id")
              AND "m"."deleted_at" IS NULL
        )
    );

DROP POLICY IF EXISTS "Users can remove own reactions" ON "public"."message_reactions";
CREATE POLICY "Users can remove own reactions" ON "public"."message_reactions"
    FOR DELETE USING ("auth"."uid"() = "user_id" OR "public"."is_admin"());

GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";
