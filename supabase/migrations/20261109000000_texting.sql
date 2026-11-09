-- Texting families: the number portal messages are texted to, the family's
-- consent, and a log of every text in and out.
--
-- Consent is recorded with when and how it was given (the family in their
-- portal settings, or Lionel after they agreed with him), because Twilio's
-- number approval and the carriers both ask for it.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS sms_phone TEXT,                 -- E.164, e.g. +16045551234
    ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sms_opt_in_source TEXT;         -- 'portal' | 'teacher' | 'text'

CREATE INDEX IF NOT EXISTS profiles_sms_phone_idx ON public.profiles (sms_phone) WHERE sms_phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    phone TEXT NOT NULL,
    body TEXT,
    -- Twilio's message id. Unique so a re-delivered inbound text posts once.
    twilio_sid TEXT UNIQUE,
    status TEXT,
    error TEXT,
    message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sms_messages_phone_created_idx ON public.sms_messages (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_messages_student_created_idx ON public.sms_messages (student_id, created_at DESC);

-- Service role only: phone numbers and message text never go to the browser from here.
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
