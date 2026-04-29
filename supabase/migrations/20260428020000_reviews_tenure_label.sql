-- Free-text tenure label — author writes the exact string the badge will display.
-- Replaces the (student_since, student_until) derivation, which produced copy
-- that didn't match the studio's own phrasing (e.g. "Parent of 2 students…").
ALTER TABLE "public"."reviews"
    ADD COLUMN IF NOT EXISTS "tenure_label" text;

UPDATE "public"."reviews" SET "tenure_label" = 'Student in 2023'                       WHERE "id" = '783b7b3c-5c9c-46f8-ba4f-9ff20da11b4e'; -- Susan C.
UPDATE "public"."reviews" SET "tenure_label" = 'Student in 2023'                       WHERE "id" = 'f935242f-dc41-4c5e-85a7-1c85ab447e64'; -- Bai V.
UPDATE "public"."reviews" SET "tenure_label" = 'Student from 2023-2025'                WHERE "id" = '83d237c3-cd38-4e6c-9fa6-4f3bac416f58'; -- Jason B.
UPDATE "public"."reviews" SET "tenure_label" = 'Parent of 2 students from 2024-2026'   WHERE "id" = '12c9a7cd-0cda-423f-a542-62748ae24697'; -- Xu Y.
UPDATE "public"."reviews" SET "tenure_label" = 'Student in 2025'                       WHERE "id" = 'df938b4b-9c8f-434e-b166-4c8aaeed3301'; -- Jay W.
UPDATE "public"."reviews" SET "tenure_label" = 'Student since 2025'                    WHERE "id" = 'cad01304-b603-44b5-abe6-009e95db718b'; -- Yakir S. (existing)
