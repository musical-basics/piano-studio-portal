-- Add zoom_link column to lessons table to store unique meeting URLs
ALTER TABLE lessons
ADD COLUMN zoom_link TEXT;

comment on column lessons.zoom_link is 'Unique Zoom meeting URL for this lesson';
