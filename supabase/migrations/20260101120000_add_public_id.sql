-- Add public_id column to profiles table
ALTER TABLE profiles ADD COLUMN public_id TEXT;

-- Add comment
COMMENT ON COLUMN profiles.public_id IS 'Public identifier for external integrations';
