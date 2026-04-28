-- Adds `student_until` to reviews so a tenure window (past students) can be
-- expressed alongside the existing `student_since`. NULL = ongoing.
ALTER TABLE "public"."reviews"
    ADD COLUMN IF NOT EXISTS "student_until" smallint;

ALTER TABLE "public"."reviews"
    ADD CONSTRAINT "reviews_student_until_range"
    CHECK ("student_until" IS NULL OR ("student_until" BETWEEN 1900 AND 2100));

ALTER TABLE "public"."reviews"
    ADD CONSTRAINT "reviews_student_window_order"
    CHECK ("student_until" IS NULL OR "student_since" IS NULL OR "student_until" >= "student_since");

UPDATE "public"."reviews" SET "student_until" = 2023 WHERE "id" = '783b7b3c-5c9c-46f8-ba4f-9ff20da11b4e'; -- Susan C.
UPDATE "public"."reviews" SET "student_until" = 2023 WHERE "id" = 'f935242f-dc41-4c5e-85a7-1c85ab447e64'; -- Bai V.
UPDATE "public"."reviews" SET "student_until" = 2025 WHERE "id" = '83d237c3-cd38-4e6c-9fa6-4f3bac416f58'; -- Jason B.
UPDATE "public"."reviews" SET "student_until" = 2026 WHERE "id" = '12c9a7cd-0cda-423f-a542-62748ae24697'; -- Xu Y.
UPDATE "public"."reviews" SET "student_until" = 2025 WHERE "id" = 'df938b4b-9c8f-434e-b166-4c8aaeed3301'; -- Jay W.
