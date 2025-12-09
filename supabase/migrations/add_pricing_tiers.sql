-- Add pricing_tiers table
-- Run this in the Supabase SQL Editor

-- Create pricing_tiers table
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
    duration INTEGER PRIMARY KEY,
    single_price INTEGER NOT NULL,
    pack_price INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add lesson_duration column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS lesson_duration INTEGER DEFAULT 30;

-- Enable RLS on pricing_tiers
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

-- Everyone can read pricing (public)
CREATE POLICY "Anyone can view pricing tiers"
    ON public.pricing_tiers FOR SELECT
    USING (true);

-- Only admins can update pricing
CREATE POLICY "Admins can update pricing tiers"
    ON public.pricing_tiers FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Seed default pricing data
INSERT INTO public.pricing_tiers (duration, single_price, pack_price)
VALUES
    (30, 4500, 16500),   -- 30 min: $45 single, $165 4-pack
    (45, 6000, 22500),   -- 45 min: $60 single, $225 4-pack
    (60, 7500, 27500)    -- 60 min: $75 single, $275 4-pack
ON CONFLICT (duration) DO UPDATE SET
    single_price = EXCLUDED.single_price,
    pack_price = EXCLUDED.pack_price,
    updated_at = NOW();
