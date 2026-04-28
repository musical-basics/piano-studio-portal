-- Adds an explicit `student_since` year column to reviews so testimonial
-- tenure can be displayed without depending on a linked profile.
ALTER TABLE "public"."reviews"
    ADD COLUMN IF NOT EXISTS "student_since" smallint;

ALTER TABLE "public"."reviews"
    ADD CONSTRAINT "reviews_student_since_range"
    CHECK ("student_since" IS NULL OR ("student_since" BETWEEN 1900 AND 2100));
