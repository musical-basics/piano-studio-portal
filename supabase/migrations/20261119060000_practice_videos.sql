-- #875: students upload a short practice video in their portal between lessons;
-- Lionel watches it in admin and leaves a comment, which reaches the family as a
-- portal message (the usual email notice, and a text if they opted in).
--
-- The files live in a PRIVATE Cloudflare R2 bucket, studio-practice-videos (no
-- public URL; uploads and playback go through short-lived signed links,
-- lib/practice-videos.ts). One row per upload; r2_key is
-- "<student_id>/<id>.<ext>". status: uploading (signed link handed out) ->
-- ready (the file arrived, size checked). Rows stuck in "uploading" are
-- abandoned uploads and are not shown.
--
-- Service role only (RLS on, no policies): every read and write goes through
-- app/actions/practice-videos.ts, which checks who is asking.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
create table if not exists public.practice_videos (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles (id) on delete cascade,
    r2_key text not null unique,
    file_name text,
    content_type text,
    size_bytes bigint,
    duration_seconds integer,
    note text check (note is null or char_length(note) <= 500),
    status text not null default 'uploading' check (status in ('uploading', 'ready')),
    watched_at timestamptz,
    comment text check (comment is null or char_length(comment) <= 4000),
    commented_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists practice_videos_student_idx on public.practice_videos (student_id, created_at desc);
alter table public.practice_videos enable row level security;
