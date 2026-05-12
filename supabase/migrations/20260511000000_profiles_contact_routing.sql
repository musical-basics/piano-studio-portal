-- Add first-class fields for how the studio addresses each student/contact in
-- messages and UI. These were previously tracked only as a Commander overlay;
-- promoting them to source-of-truth columns on profiles.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS preferred_name TEXT,
    ADD COLUMN IF NOT EXISTS parent_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_salutation TEXT,
    ADD COLUMN IF NOT EXISTS primary_contact_role TEXT;

-- Constrain primary_contact_role to a small enum-like set (NULL means "not set"
-- i.e. defaults to addressing the student themselves).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_primary_contact_role_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_primary_contact_role_check
            CHECK (primary_contact_role IS NULL OR primary_contact_role IN ('student', 'parent'));
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.preferred_name IS
    'Display nickname for the student (e.g. "Rob" for "Robert Alconcel"). Used in UI and message addressing when primary_contact_role is "student".';

COMMENT ON COLUMN public.profiles.parent_contact_name IS
    'Name of the primary parent/guardian/contact person (e.g. "Amanda Daigle", "Zou Guo"). Shown in admin views and used to address outbound messages when primary_contact_role is "parent".';

COMMENT ON COLUMN public.profiles.contact_salutation IS
    'Explicit override for how to address the recipient in messages (e.g. "Rob", "Amanda", "Zou"). When set, takes precedence over preferred_name / parent_contact_name first-name derivation.';

COMMENT ON COLUMN public.profiles.primary_contact_role IS
    'Who Lionel actually communicates with for this student: "student" (default behavior) or "parent". NULL is treated as "student". Drives default salutation routing.';
