-- #934: an "Adjust lessons" button in admin. Lionel adds or takes lessons with
-- a reason he types; the change and the reason land together in the credit
-- history (credit_transactions), so no hand edit is left without a why.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).

-- 1. The ledger trigger also records an optional note from app.credit_note
--    (set in the same transaction, like app.credit_source).
CREATE OR REPLACE FUNCTION "public"."log_credit_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" AS $$
BEGIN
    IF NEW."credits" IS DISTINCT FROM OLD."credits" THEN
        INSERT INTO "public"."credit_transactions"
            ("student_id", "previous_credits", "new_credits", "delta", "source", "note")
        VALUES (
            NEW."id",
            OLD."credits",
            NEW."credits",
            NEW."credits" - OLD."credits",
            NULLIF("current_setting"('app.credit_source', true), ''),
            NULLIF("current_setting"('app.credit_note', true), '')
        );
    END IF;
    RETURN NEW;
END;
$$;

-- 2. One call does the change and labels it: source 'admin adjustment', note =
--    his reason. Service role only (app/actions/credit-adjust.ts checks admin).
CREATE OR REPLACE FUNCTION "public"."adjust_lesson_credits"(p_student uuid, p_delta integer, p_reason text)
    RETURNS TABLE (previous_credits integer, new_credits integer)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_new integer;
BEGIN
    IF p_delta IS NULL OR p_delta = 0 THEN
        RAISE EXCEPTION 'the change must not be zero';
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'a reason is required';
    END IF;
    PERFORM set_config('app.credit_source', 'admin adjustment', true);
    PERFORM set_config('app.credit_note', left(btrim(p_reason), 300), true);
    UPDATE profiles SET credits = coalesce(credits, 0) + p_delta
     WHERE id = p_student
     RETURNING credits INTO v_new;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'student not found';
    END IF;
    PERFORM set_config('app.credit_source', '', true);
    PERFORM set_config('app.credit_note', '', true);
    RETURN QUERY SELECT v_new - p_delta, v_new;
END;
$$;

REVOKE ALL ON FUNCTION "public"."adjust_lesson_credits"(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."adjust_lesson_credits"(uuid, integer, text) TO service_role;
