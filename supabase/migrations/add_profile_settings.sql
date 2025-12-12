-- Add available_hours and timezone to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS available_hours JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Add comment to describe structure
COMMENT ON COLUMN profiles.available_hours IS 'Array of availability objects: [{ day: "Monday", enabled: boolean, start: "09:00", end: "17:00" }]';
