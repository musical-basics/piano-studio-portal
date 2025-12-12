-- Add studio_name column to profiles table
ALTER TABLE profiles 
ADD COLUMN studio_name TEXT;

-- Comment on column
COMMENT ON COLUMN profiles.studio_name IS 'The display name for the teacher''s studio (e.g. "Lionel Yu Piano Studio")';
