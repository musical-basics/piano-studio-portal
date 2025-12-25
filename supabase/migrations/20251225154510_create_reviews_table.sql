-- Create reviews table
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id),
  name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.reviews enable row level security;

-- Policies

-- Public can read approved reviews
create policy "Public can read approved reviews"
on public.reviews for select
using (status = 'approved');

-- Authenticated users (students) can insert reviews
create policy "Authenticated users can insert reviews"
on public.reviews for insert
to authenticated
with check (true);

-- Admins can update reviews
create policy "Admins can update reviews"
on public.reviews for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

-- Admins can delete reviews
create policy "Admins can delete reviews"
on public.reviews for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);
