-- Add credit_snapshot column to lessons table
-- This stores the student's remaining credit balance at the time the lesson was logged
-- Nullable because older lessons won't have this data
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS credit_snapshot INTEGER;

-- Add a comment for documentation
COMMENT ON COLUMN lessons.credit_snapshot IS 'Student credit balance after this lesson was logged (for receipt display)';
