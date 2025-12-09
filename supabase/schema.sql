-- =============================================
-- Piano Studio Management App - Database Schema
-- =============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('student', 'admin')) DEFAULT 'student',
  credits INTEGER NOT NULL DEFAULT 0,
  credits_total INTEGER NOT NULL DEFAULT 0,
  balance_due NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  zoom_link TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lessons table
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TIME NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled')) DEFAULT 'scheduled',
  notes TEXT,
  video_url TEXT,
  sheet_music_url TEXT,
  duration INTEGER NOT NULL DEFAULT 60, -- Duration in minutes (30, 45, 60)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

-- Lessons indexes
CREATE INDEX idx_lessons_student_id ON public.lessons(student_id);
CREATE INDEX idx_lessons_date ON public.lessons(date);
CREATE INDEX idx_lessons_status ON public.lessons(status);

-- Messages indexes
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at for profiles
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Auto-update updated_at for lessons
CREATE TRIGGER on_lessons_updated
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES - PROFILES
-- =============================================

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Profiles: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- Profiles: All authenticated users can view admin profiles (for messaging)
CREATE POLICY "Users can view admin profiles"
  ON public.profiles
  FOR SELECT
  USING (role = 'admin' AND auth.uid() IS NOT NULL);

-- Profiles: Users can update their own profile (non-role fields)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- Profiles: Admins can update any profile
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin());

-- =============================================
-- RLS POLICIES - LESSONS
-- =============================================

-- Lessons: Students can view their own lessons
CREATE POLICY "Students can view own lessons"
  ON public.lessons
  FOR SELECT
  USING (auth.uid() = student_id);

-- Lessons: Admins can view all lessons
CREATE POLICY "Admins can view all lessons"
  ON public.lessons
  FOR SELECT
  USING (public.is_admin());

-- Lessons: Only admins can insert lessons
CREATE POLICY "Admins can insert lessons"
  ON public.lessons
  FOR INSERT
  WITH CHECK (public.is_admin());

-- Lessons: Only admins can update lessons
CREATE POLICY "Admins can update lessons"
  ON public.lessons
  FOR UPDATE
  USING (public.is_admin());

-- Lessons: Only admins can delete lessons
CREATE POLICY "Admins can delete lessons"
  ON public.lessons
  FOR DELETE
  USING (public.is_admin());

-- =============================================
-- RLS POLICIES - MESSAGES
-- =============================================

-- Messages: Users can view messages they sent or received
CREATE POLICY "Users can view own messages"
  ON public.messages
  FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Messages: Admins can view all messages
CREATE POLICY "Admins can view all messages"
  ON public.messages
  FOR SELECT
  USING (public.is_admin());

-- Messages: Users can send messages (insert)
CREATE POLICY "Users can send messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Messages: Users can update their received messages (mark as read)
CREATE POLICY "Users can mark received messages as read"
  ON public.messages
  FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Messages: Admins can delete any message
CREATE POLICY "Admins can delete messages"
  ON public.messages
  FOR DELETE
  USING (public.is_admin());
