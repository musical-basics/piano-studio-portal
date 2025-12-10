-- Add zoom_link column to profiles if it doesn't exist
-- Run this in the Supabase SQL Editor

-- Add zoom_link column to profiles (for both students and admin/teacher)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS zoom_link TEXT;

-- Create makeup_slots table for rescheduling
CREATE TABLE IF NOT EXISTS public.makeup_slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_taken BOOLEAN DEFAULT false,
    taken_by_student_id UUID REFERENCES public.profiles(id),
    taken_by_lesson_id UUID REFERENCES public.lessons(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on makeup_slots
ALTER TABLE public.makeup_slots ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view available slots
CREATE POLICY "Authenticated users can view available makeup slots"
    ON public.makeup_slots FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only admins can create/update/delete slots
CREATE POLICY "Admins can manage makeup slots"
    ON public.makeup_slots FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Students can claim available slots (update is_taken)
CREATE POLICY "Students can claim available slots"
    ON public.makeup_slots FOR UPDATE
    USING (
        is_taken = false AND
        auth.uid() IS NOT NULL
    )
    WITH CHECK (
        is_taken = true AND
        taken_by_student_id = auth.uid()
    );

-- Create index for faster lookup of available slots
CREATE INDEX IF NOT EXISTS idx_makeup_slots_available 
    ON public.makeup_slots(start_time) 
    WHERE is_taken = false;

COMMENT ON TABLE public.makeup_slots IS 'Available makeup lesson slots that students can book for rescheduling';
