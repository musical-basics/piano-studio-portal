-- Enable the moddatetime extension
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- Create inquiries table to track improved leads
CREATE TABLE public.inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT, -- Optional
  experience TEXT NOT NULL, -- Beginner, Intermediate, Advanced
  goals TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'student', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all inquiries
CREATE POLICY "Admins can view all inquiries"
  ON public.inquiries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Public can insert inquiries (for the landing page form)
CREATE POLICY "Anyone can insert inquiries"
  ON public.inquiries
  FOR INSERT
  WITH CHECK (true);

-- Create updated_at trigger using the extension
create trigger handle_updated_at before update on inquiries
  for each row execute procedure extensions.moddatetime (updated_at);
