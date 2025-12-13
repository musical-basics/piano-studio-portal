-- Add duration to events if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'duration') THEN
        ALTER TABLE public.events ADD COLUMN duration INTEGER NOT NULL DEFAULT 60;
    END IF;
END $$;

-- Add location_type to events if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'location_type') THEN
        ALTER TABLE public.events ADD COLUMN location_type TEXT NOT NULL DEFAULT 'physical' CHECK (location_type IN ('virtual', 'physical'));
    END IF;
END $$;

-- Add location_details to events if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'location_details') THEN
        ALTER TABLE public.events ADD COLUMN location_details TEXT;
    END IF;
END $$;

-- Add rsvp_deadline to events if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'rsvp_deadline') THEN
        ALTER TABLE public.events ADD COLUMN rsvp_deadline TIMESTAMPTZ;
    END IF;
END $$;

-- Add updated_at to event_invites if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_invites' AND column_name = 'updated_at') THEN
        ALTER TABLE public.event_invites ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;
END $$;

-- Add student_notes to event_invites if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_invites' AND column_name = 'student_notes') THEN
        ALTER TABLE public.event_invites ADD COLUMN student_notes TEXT;
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
