-- Add is_confirmed column to lessons table for attendance confirmation
ALTER TABLE lessons ADD COLUMN is_confirmed BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN lessons.is_confirmed IS 'Whether the student has confirmed attendance for this lesson';
