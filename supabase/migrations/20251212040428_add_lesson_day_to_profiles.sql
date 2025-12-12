-- Add lesson_day column to profiles table for recurring lesson day
ALTER TABLE profiles
ADD COLUMN lesson_day TEXT;

-- Optional: constraint to limit values, but keeping it flexible for now as per plan
-- ALTER TABLE profiles ADD CONSTRAINT check_lesson_day CHECK (lesson_day IN ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'));

comment on column profiles.lesson_day is 'Recurring lesson day for the student (e.g., "Monday")';
