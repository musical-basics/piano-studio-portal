-- Add zoom_meeting_id column to lessons table to store unique Zoom meeting IDs
ALTER TABLE lessons
ADD COLUMN zoom_meeting_id TEXT;

comment on column lessons.zoom_meeting_id is 'Unique Zoom Meeting ID (used for deletion/updates)';
