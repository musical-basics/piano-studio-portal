-- Quick fix for messaging RLS policy
-- Run this in Supabase SQL Editor

-- Allow students to view admin profiles (needed for messaging)
CREATE POLICY "Users can view admin profiles"
  ON public.profiles
  FOR SELECT
  USING (role = 'admin' AND auth.uid() IS NOT NULL);
