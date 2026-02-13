-- Add credit_snapshot_before to track starting balance before credit deduction
ALTER TABLE "public"."lessons" ADD COLUMN IF NOT EXISTS "credit_snapshot_before" integer;
