-- Add status column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Backfill existing rows (optional as default handles new ones, but good for existing)
UPDATE public.profiles SET status = 'active' WHERE status IS NULL;
