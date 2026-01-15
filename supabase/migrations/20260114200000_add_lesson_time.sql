ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS lesson_time TEXT; -- Format "15:30" (24h)
