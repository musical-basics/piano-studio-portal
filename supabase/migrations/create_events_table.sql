-- Create events table
create table public.events (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  start_time timestamptz not null,
  duration integer not null, -- in minutes
  location_type text not null check (location_type in ('virtual', 'physical')),
  location_details text,
  rsvp_deadline timestamptz,
  created_at timestamptz not null default now(),
  primary key (id)
);

-- Create event_invites table
create table public.event_invites (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'going', 'not_going', 'declined')),
  student_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique(event_id, student_id)
);

-- Enable RLS
alter table public.events enable row level security;
alter table public.event_invites enable row level security;

-- Policies for events
-- Public/Students can read events (simplified for now, ideally only if invited, but read-all is fine for studio events)
create policy "Authenticated users can view events"
  on public.events for select
  to authenticated
  using (true);

-- Only admins can insert/update/delete events
create policy "Admins can manage events"
  on public.events for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Policies for event_invites
-- Students can see their own invites
create policy "Students can view their own invites"
  on public.event_invites for select
  to authenticated
  using (
    student_id = auth.uid()
  );

-- Admins can see all invites
create policy "Admins can view all invites"
  on public.event_invites for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Admins can insert invites
create policy "Admins can insert invites"
  on public.event_invites for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Students can update their own invites (RSVP)
create policy "Students can update their own invites"
  on public.event_invites for update
  to authenticated
  using (
    student_id = auth.uid()
  )
  with check (
    student_id = auth.uid()
  );

-- Admins can update invites
create policy "Admins can update invites"
  on public.event_invites for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
