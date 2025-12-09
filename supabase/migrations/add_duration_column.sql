-- Add duration column to lessons table
-- Run this in Supabase SQL Editor

ALTER TABLE public.lessons 
ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.lessons.duration IS 'Duration in minutes (30, 45, 60)';
