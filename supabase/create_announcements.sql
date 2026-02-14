-- Announcements Feature: Tables and RLS
-- Run this in the Supabase SQL Editor

-- 1. Store the actual message content
create table public.announcements (
  id uuid default gen_random_uuid() primary key,
  subject text not null,
  body text not null,
  teacher_id uuid references auth.users,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Link messages to specific students (Many-to-Many)
create table public.announcement_recipients (
  id uuid default gen_random_uuid() primary key,
  announcement_id uuid references public.announcements on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. RLS Policies
alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;

-- Admins can do everything
create policy "Admins full access announcements" on public.announcements
  for all using ( (select role from profiles where id = auth.uid()) = 'admin' );

create policy "Admins full access recipients" on public.announcement_recipients
  for all using ( (select role from profiles where id = auth.uid()) = 'admin' );

-- Students can VIEW announcements sent to them
create policy "Students view own announcements" on public.announcements
  for select using (
    exists (
      select 1 from announcement_recipients ar
      where ar.announcement_id = announcements.id
      and ar.student_id = auth.uid()
    )
  );

-- Students can view their own recipient records
create policy "Students view own recipient records" on public.announcement_recipients
  for select using ( student_id = auth.uid() );
