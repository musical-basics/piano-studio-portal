-- Create storage bucket for lesson materials
-- Run this in Supabase SQL Editor

-- Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-materials', 'lesson-materials', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Allow admin uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lesson-materials');

-- Allow public read access
CREATE POLICY "Allow public read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'lesson-materials');

-- Allow admin to delete files
CREATE POLICY "Allow admin deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'lesson-materials');
