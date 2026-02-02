-- 1. Create Pricing Plans Table
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, -- e.g. "Standard Adult", "Premium Kids"
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Pricing Points Table
CREATE TABLE IF NOT EXISTS public.pricing_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES public.pricing_plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- e.g. "Single Lesson", "Monthly Subscription"
  price INTEGER NOT NULL, -- Stored in cents (e.g., 5000 for $50.00)
  credits INTEGER NOT NULL, -- e.g. 1, 4
  type TEXT NOT NULL CHECK (type IN ('one_time', 'subscription')),
  stripe_price_id TEXT, -- Required for subscriptions, optional for one-time
  description TEXT, -- e.g. "Save $10"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Update Profiles to have a Pricing Plan
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pricing_plan_id') THEN
        ALTER TABLE public.profiles 
        ADD COLUMN pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Enable RLS
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_points ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Everyone can read plans/points (needed for checkout modal)
DROP POLICY IF EXISTS "Read access for all" ON public.pricing_plans;
CREATE POLICY "Read access for all" ON public.pricing_plans FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read access for points" ON public.pricing_points;
CREATE POLICY "Read access for points" ON public.pricing_points FOR SELECT USING (true);

-- Admin full access
DROP POLICY IF EXISTS "Admin full access plans" ON public.pricing_plans;
CREATE POLICY "Admin full access plans" ON public.pricing_plans USING (public.is_admin());

DROP POLICY IF EXISTS "Admin full access points" ON public.pricing_points;
CREATE POLICY "Admin full access points" ON public.pricing_points USING (public.is_admin());

-- 6. (Optional) Create a default plan for migration
INSERT INTO public.pricing_plans (name, description) 
SELECT 'Default Plan', 'Legacy pricing'
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_plans);
