-- Migration: Add completed_source column to lessons table
-- Run this in the Supabase SQL editor.
-- Values: 'agent_log' | 'zoom_webhook' | 'admin_ui' | 'system'
-- NULL means the lesson was completed before this column was added.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS completed_source TEXT
    CHECK (completed_source IN ('agent_log', 'zoom_webhook', 'admin_ui', 'system'));

-- Optional: backfill known rows (those with video_url and null snapshots are likely zoom_webhook)
UPDATE public.lessons
SET completed_source = 'zoom_webhook'
WHERE status = 'completed'
  AND video_url IS NOT NULL
  AND credit_snapshot_before IS NULL
  AND completed_source IS NULL;

-- All other completed lessons with snapshots were likely agent_log or admin_ui
-- Leave them NULL unless you want to distinguish further.
