


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_email" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "details" "text",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."auth_audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."auth_audit_logs" IS 'Logs of authentication attempts and password resets for troubleshooting.';



CREATE TABLE IF NOT EXISTS "public"."classroom_annotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "text" NOT NULL,
    "song_id" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."classroom_annotations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."classroom_annotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_nudge_offsets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "song_id" "uuid" NOT NULL,
    "element_selector" "text" NOT NULL,
    "offset_x" double precision DEFAULT 0,
    "offset_y" double precision DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."classroom_nudge_offsets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "preset_type" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."classroom_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_recordings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "text" NOT NULL,
    "teacher_id" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "url" "text" NOT NULL,
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."classroom_recordings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_name" "text" NOT NULL,
    "created_by" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."classroom_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "student_id" "uuid",
    "subject" "text",
    "content" "text"
);


ALTER TABLE "public"."crm_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "student_id" "uuid",
    "sender_role" "text" NOT NULL,
    "body_text" "text",
    "gmail_message_id" "text",
    CONSTRAINT "crm_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['student'::"text", 'instructor'::"text"])))
);


ALTER TABLE "public"."crm_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "country_code" "text",
    "status" "text" DEFAULT 'Lead'::"text",
    "last_contacted_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "instructor_strategy" "text",
    "notes" "text",
    "experience_level" "text"
);


ALTER TABLE "public"."crm_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "student_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "student_notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'going'::"text", 'not_going'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."event_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "location_type" "text" NOT NULL,
    "location_details" "text",
    "description" "text",
    "rsvp_deadline" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "duration" integer DEFAULT 60 NOT NULL,
    "zoom_meeting_id" "text",
    CONSTRAINT "events_location_type_check" CHECK (("location_type" = ANY (ARRAY['virtual'::"text", 'physical'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "experience" "text" NOT NULL,
    "goals" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inquiries_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'student'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."inquiries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "notes" "text",
    "video_url" "text",
    "sheet_music_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration" integer DEFAULT 60 NOT NULL,
    "zoom_link" "text",
    "zoom_meeting_id" "text",
    "credit_snapshot" integer,
    "reminder_24h_sent" boolean DEFAULT false,
    "reminder_2h_sent" boolean DEFAULT false,
    "reminder_15m_sent" boolean DEFAULT false,
    "is_confirmed" boolean DEFAULT false,
    "google_event_id" "text",
    CONSTRAINT "lessons_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lessons"."zoom_meeting_id" IS 'Unique Zoom Meeting ID (used for deletion/updates)';



CREATE TABLE IF NOT EXISTS "public"."makeup_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "is_taken" boolean DEFAULT false,
    "end_time" timestamp with time zone
);


ALTER TABLE "public"."makeup_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachments" "jsonb"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messages"."attachments" IS 'JSON array of attachments: [{type: "image"|"file", url: string, name: string, size: number}]';



CREATE TABLE IF NOT EXISTS "public"."pieces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "composer" "text",
    "difficulty" "text",
    "youtube_url" "text",
    "xml_url" "text" NOT NULL,
    "mp3_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."pieces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_tiers" (
    "duration" integer NOT NULL,
    "single_price" integer NOT NULL,
    "pack_price" integer NOT NULL
);


ALTER TABLE "public"."pricing_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "phone" "text",
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "credits" integer DEFAULT 0 NOT NULL,
    "credits_total" integer DEFAULT 0 NOT NULL,
    "balance_due" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "zoom_link" "text",
    "stripe_customer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lesson_duration" integer DEFAULT 30,
    "default_meeting_link" "text",
    "lesson_day" "text",
    "available_hours" "jsonb" DEFAULT '[]'::"jsonb",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "studio_name" "text",
    "parent_email" "text",
    "public_id" "text",
    "lesson_time" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."lesson_day" IS 'Recurring lesson day for the student (e.g., "Monday")';



COMMENT ON COLUMN "public"."profiles"."available_hours" IS 'Array of availability objects: [{ day: "Monday", enabled: boolean, start: "09:00", end: "17:00" }]';



COMMENT ON COLUMN "public"."profiles"."studio_name" IS 'The display name for the teacher''s studio (e.g. "Lionel Yu Piano Studio")';



COMMENT ON COLUMN "public"."profiles"."parent_email" IS 'Secondary email for parents (CC on invites)';



COMMENT ON COLUMN "public"."profiles"."public_id" IS 'Public identifier for external integrations';



CREATE TABLE IF NOT EXISTS "public"."resource_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."resource_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text" DEFAULT 'pdf'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "resources_category_check" CHECK (("category" = ANY (ARRAY['Sheet Music'::"text", 'Theory'::"text", 'Scales'::"text", 'Exercises'::"text", 'Recording'::"text"])))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "name" "text" NOT NULL,
    "rating" integer NOT NULL,
    "text" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_pages" (
    "id" "text" DEFAULT 'home'::"text" NOT NULL,
    "html_template" "text",
    "script_content" "text",
    "variable_values" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."site_pages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_audit_logs"
    ADD CONSTRAINT "auth_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_annotations"
    ADD CONSTRAINT "classroom_annotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_annotations"
    ADD CONSTRAINT "classroom_annotations_student_id_song_id_key" UNIQUE ("student_id", "song_id");



ALTER TABLE ONLY "public"."classroom_nudge_offsets"
    ADD CONSTRAINT "classroom_nudge_offsets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_nudge_offsets"
    ADD CONSTRAINT "classroom_nudge_offsets_song_id_element_selector_key" UNIQUE ("song_id", "element_selector");



ALTER TABLE ONLY "public"."classroom_presets"
    ADD CONSTRAINT "classroom_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_presets"
    ADD CONSTRAINT "classroom_presets_user_id_preset_type_key" UNIQUE ("user_id", "preset_type");



ALTER TABLE ONLY "public"."classroom_recordings"
    ADD CONSTRAINT "classroom_recordings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_rooms"
    ADD CONSTRAINT "classroom_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_rooms"
    ADD CONSTRAINT "classroom_rooms_room_name_key" UNIQUE ("room_name");



ALTER TABLE ONLY "public"."crm_drafts"
    ADD CONSTRAINT "crm_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_messages"
    ADD CONSTRAINT "crm_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_students"
    ADD CONSTRAINT "crm_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_invites"
    ADD CONSTRAINT "event_invites_event_id_student_id_key" UNIQUE ("event_id", "student_id");



ALTER TABLE ONLY "public"."event_invites"
    ADD CONSTRAINT "event_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiries"
    ADD CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."makeup_slots"
    ADD CONSTRAINT "makeup_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pieces"
    ADD CONSTRAINT "pieces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_tiers"
    ADD CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("duration");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_assignments"
    ADD CONSTRAINT "resource_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_assignments"
    ADD CONSTRAINT "resource_assignments_resource_id_student_id_key" UNIQUE ("resource_id", "student_id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_pages"
    ADD CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_classroom_nudge_offsets_song_id" ON "public"."classroom_nudge_offsets" USING "btree" ("song_id");



CREATE INDEX "idx_lessons_date" ON "public"."lessons" USING "btree" ("date");



CREATE INDEX "idx_lessons_status" ON "public"."lessons" USING "btree" ("status");



CREATE INDEX "idx_lessons_student_id" ON "public"."lessons" USING "btree" ("student_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_has_attachments" ON "public"."messages" USING "btree" ((("attachments" IS NOT NULL)));



CREATE INDEX "idx_messages_recipient_id" ON "public"."messages" USING "btree" ("recipient_id");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_resource_assignments_resource_id" ON "public"."resource_assignments" USING "btree" ("resource_id");



CREATE INDEX "idx_resource_assignments_student_id" ON "public"."resource_assignments" USING "btree" ("student_id");



CREATE INDEX "idx_resources_category" ON "public"."resources" USING "btree" ("category");



CREATE UNIQUE INDEX "unique_status_per_student" ON "public"."classroom_annotations" USING "btree" ("student_id", "song_id");



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."inquiries" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "on_lessons_updated" BEFORE UPDATE ON "public"."lessons" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."classroom_nudge_offsets"
    ADD CONSTRAINT "classroom_nudge_offsets_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."pieces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_drafts"
    ADD CONSTRAINT "crm_drafts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."crm_students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_messages"
    ADD CONSTRAINT "crm_messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."crm_students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_invites"
    ADD CONSTRAINT "event_invites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_invites"
    ADD CONSTRAINT "event_invites_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_assignments"
    ADD CONSTRAINT "resource_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_assignments"
    ADD CONSTRAINT "resource_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admin manage crm_drafts" ON "public"."crm_drafts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Admin manage crm_messages" ON "public"."crm_messages" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Admin manage crm_students" ON "public"."crm_students" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Admin manage slots" ON "public"."makeup_slots" USING ((((("auth"."jwt"() ->> 'user_metadata'::"text"))::"jsonb" ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admin write access" ON "public"."site_pages" USING ((((("auth"."jwt"() ->> 'user_metadata'::"text"))::"jsonb" ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admins can delete lessons" ON "public"."lessons" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete messages" ON "public"."messages" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete reviews" ON "public"."reviews" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert invites" ON "public"."event_invites" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert lessons" ON "public"."lessons" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage events" ON "public"."events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage resource assignments" ON "public"."resource_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage resources" ON "public"."resources" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update invites" ON "public"."event_invites" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update lessons" ON "public"."lessons" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update reviews" ON "public"."reviews" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all auth logs" ON "public"."auth_audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all inquiries" ON "public"."inquiries" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all invites" ON "public"."event_invites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all lessons" ON "public"."lessons" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all messages" ON "public"."messages" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all reviews" ON "public"."reviews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Allow admin update" ON "public"."pricing_tiers" FOR UPDATE USING ((((("auth"."jwt"() ->> 'user_metadata'::"text"))::"jsonb" ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Allow all access" ON "public"."assets" USING (true);



CREATE POLICY "Allow all access to presets" ON "public"."classroom_presets" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public read" ON "public"."pricing_tiers" FOR SELECT USING (true);



CREATE POLICY "Anyone can insert inquiries" ON "public"."inquiries" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can insert reviews" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can view events" ON "public"."events" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable all access for pieces" ON "public"."pieces" USING (true) WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."classroom_annotations" FOR SELECT USING (true);



CREATE POLICY "Public can read approved reviews" ON "public"."reviews" FOR SELECT USING (("status" = 'approved'::"text"));



CREATE POLICY "Public insert crm_students" ON "public"."crm_students" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public read access" ON "public"."pieces" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."site_pages" FOR SELECT USING (true);



CREATE POLICY "Public read available slots" ON "public"."makeup_slots" FOR SELECT USING (("is_taken" = false));



CREATE POLICY "Public read recordings" ON "public"."classroom_recordings" FOR SELECT USING (true);



CREATE POLICY "Service Role Full Access" ON "public"."classroom_annotations" USING (true);



CREATE POLICY "Service Role Full Access" ON "public"."classroom_rooms" USING (true);



CREATE POLICY "Students can update their own invites" ON "public"."event_invites" FOR UPDATE TO "authenticated" USING (("student_id" = "auth"."uid"())) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can view assigned resources" ON "public"."resources" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."resource_assignments"
  WHERE (("resource_assignments"."resource_id" = "resources"."id") AND ("resource_assignments"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students can view own assignments" ON "public"."resource_assignments" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can view own lessons" ON "public"."lessons" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view their own invites" ON "public"."event_invites" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students manage invites" ON "public"."event_invites" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students view events" ON "public"."events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."event_invites"
  WHERE (("event_invites"."event_id" = "events"."id") AND ("event_invites"."student_id" = "auth"."uid"())))));



CREATE POLICY "Teacher upload recordings" ON "public"."classroom_recordings" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can mark received messages as read" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "recipient_id")) WITH CHECK (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can send messages" ON "public"."messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("role" = ( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));



CREATE POLICY "Users can view admin profiles" ON "public"."profiles" FOR SELECT USING ((("role" = 'admin'::"text") AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "Users can view own messages" ON "public"."messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classroom_annotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classroom_presets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classroom_recordings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classroom_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inquiries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."makeup_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pieces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_pages" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."classroom_annotations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."crm_students";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";












GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."auth_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."auth_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_annotations" TO "anon";
GRANT ALL ON TABLE "public"."classroom_annotations" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_annotations" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_nudge_offsets" TO "anon";
GRANT ALL ON TABLE "public"."classroom_nudge_offsets" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_nudge_offsets" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_presets" TO "anon";
GRANT ALL ON TABLE "public"."classroom_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_presets" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_recordings" TO "anon";
GRANT ALL ON TABLE "public"."classroom_recordings" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_recordings" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_rooms" TO "anon";
GRANT ALL ON TABLE "public"."classroom_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."crm_drafts" TO "anon";
GRANT ALL ON TABLE "public"."crm_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."crm_messages" TO "anon";
GRANT ALL ON TABLE "public"."crm_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_messages" TO "service_role";



GRANT ALL ON TABLE "public"."crm_students" TO "anon";
GRANT ALL ON TABLE "public"."crm_students" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_students" TO "service_role";



GRANT ALL ON TABLE "public"."event_invites" TO "anon";
GRANT ALL ON TABLE "public"."event_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."event_invites" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."inquiries" TO "anon";
GRANT ALL ON TABLE "public"."inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiries" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."makeup_slots" TO "anon";
GRANT ALL ON TABLE "public"."makeup_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."makeup_slots" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."pieces" TO "anon";
GRANT ALL ON TABLE "public"."pieces" TO "authenticated";
GRANT ALL ON TABLE "public"."pieces" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_tiers" TO "anon";
GRANT ALL ON TABLE "public"."pricing_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."resource_assignments" TO "anon";
GRANT ALL ON TABLE "public"."resource_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "anon";
GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."site_pages" TO "anon";
GRANT ALL ON TABLE "public"."site_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."site_pages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































