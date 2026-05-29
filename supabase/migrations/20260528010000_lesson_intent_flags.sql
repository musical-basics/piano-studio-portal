-- =========================================================
-- Migration: Add Lesson Intent Flags and RLS Policies
-- =========================================================

-- Create lesson_intent_flags table
CREATE TABLE IF NOT EXISTS public.lesson_intent_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  target_date DATE NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('skip_requested', 'cancel_requested', 'reschedule_requested', 'schedule_requested', 'other')),
  status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'dismissed')) DEFAULT 'active',
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('admin', 'agent', 'system')) DEFAULT 'admin',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_lesson_intent_flags_student_date_status 
  ON public.lesson_intent_flags(student_id, target_date, status);

CREATE INDEX IF NOT EXISTS idx_lesson_intent_flags_source_message 
  ON public.lesson_intent_flags(source_message_id);

CREATE INDEX IF NOT EXISTS idx_lesson_intent_flags_lesson_id 
  ON public.lesson_intent_flags(lesson_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.lesson_intent_flags ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS on_lesson_intent_flags_updated ON public.lesson_intent_flags;
CREATE TRIGGER on_lesson_intent_flags_updated
  BEFORE UPDATE ON public.lesson_intent_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Policies
DROP POLICY IF EXISTS "Admins can manage all lesson intent flags" ON public.lesson_intent_flags;
CREATE POLICY "Admins can manage all lesson intent flags"
  ON public.lesson_intent_flags
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Students can view own lesson intent flags" ON public.lesson_intent_flags;
CREATE POLICY "Students can view own lesson intent flags"
  ON public.lesson_intent_flags
  FOR SELECT
  USING (auth.uid() = student_id);
