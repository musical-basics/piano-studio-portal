-- #953 / #954: a text transcript of every lesson recording, made on the Mac
-- overnight (scripts/transcribe_lessons.py: whisper.cpp, local and free), so
-- lessons become searchable from admin (Recordings tab, "Search what was said").
--
-- One row per recording that was transcribed. dropbox_path is the media file
-- whisper heard: the audio_only .m4a of a Zoom meeting folder, or the video
-- itself (a "YYYY-MM-DD - Lesson.mp4" or a classroom copy). video_path is the
-- video to play for it (the meeting's shared-screen .mp4), transcript_path the
-- plain-text copy saved next to it in Dropbox. Copies of the same file (same
-- Dropbox content_hash) are transcribed once.
--
-- segments: [{"s": start seconds, "e": end seconds, "t": "what was said"}].
-- No separate text column: the search vector is built from the segments'
-- strings (jsonb_to_tsvector keeps only the "t" values; s and e are numbers),
-- which keeps the free plan's 500 MB in mind. The admin search runs through
-- search_lesson_transcripts(), which also picks out the matching segments.
--
-- Service role only (RLS on, no policies; the function is not executable by
-- anon or signed-in users): every read goes through app/actions/transcripts.ts,
-- which checks the caller is the admin. Never shown in the family portal.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).

create table if not exists public.lesson_transcripts (
    id uuid primary key default gen_random_uuid(),
    dropbox_path text not null unique,
    video_path text,
    transcript_path text,
    content_hash text,
    student_folder text,
    student_id uuid references public.profiles (id) on delete set null,
    recorded_on date,
    lesson_id uuid references public.lessons (id) on delete set null,
    duration_seconds integer,
    segments jsonb not null default '[]'::jsonb,
    model text,
    transcribe_seconds integer,
    created_at timestamptz not null default now(),
    search tsvector generated always as (jsonb_to_tsvector('english'::regconfig, segments, '["string"]'::jsonb)) stored
);

create index if not exists lesson_transcripts_search_idx on public.lesson_transcripts using gin (search);
create index if not exists lesson_transcripts_recorded_idx on public.lesson_transcripts (recorded_on desc);
create index if not exists lesson_transcripts_student_idx on public.lesson_transcripts (student_id);
create index if not exists lesson_transcripts_hash_idx on public.lesson_transcripts (content_hash);
alter table public.lesson_transcripts enable row level security;

comment on table public.lesson_transcripts is
    'Lesson recording transcripts made on the Mac (scripts/transcribe_lessons.py, #953); searched in admin (#954). Service role only.';

-- The admin search (#954): lessons whose transcript matches q (web search
-- syntax: words, "a phrase", -not), newest first, each with the segments that
-- matched, at most 30 per lesson. Where no single segment holds the whole
-- query, a phrase split across two segments matches the pair (reported at the
-- first), and failing that the segments holding any of the words are shown
-- (several words can come up minutes apart). total = every matching lesson,
-- before the limit.
create or replace function public.search_lesson_transcripts(q text, max_lessons integer default 50, only_student uuid default null)
returns table (
    id uuid,
    student_id uuid,
    student_folder text,
    recorded_on date,
    lesson_id uuid,
    dropbox_path text,
    video_path text,
    transcript_path text,
    duration_seconds integer,
    hits jsonb,
    hit_count integer,
    total bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
    with tq0 as (
        select websearch_to_tsquery('english', q) as query
    ),
    tq as (
        select query,
               case when position('!' in querytree(query)) = 0
                    then replace(querytree(query), '&', '|')::tsquery end as anyq
        from tq0
    ),
    matched as (
        select t.*, count(*) over () as total
        from public.lesson_transcripts t, tq
        where t.search @@ tq.query
          and (only_student is null or t.student_id = only_student)
        order by t.recorded_on desc nulls last, t.created_at desc
        limit greatest(1, least(coalesce(max_lessons, 50), 200))
    ),
    segs as (
        select m.id as tid, s.ord, s.seg, lead(s.seg) over (partition by m.id order by s.ord) as next_seg
        from matched m
        cross join lateral jsonb_array_elements(m.segments) with ordinality as s(seg, ord)
    ),
    single as (
        select s.tid, s.ord, s.seg
        from segs s, tq
        where to_tsvector('english', coalesce(s.seg->>'t', '')) @@ tq.query
    ),
    paired as (
        select s.tid, s.ord, jsonb_set(s.seg, '{t}', to_jsonb(concat_ws(' ', s.seg->>'t', s.next_seg->>'t'))) as seg
        from segs s, tq
        where s.next_seg is not null
          and not exists (select 1 from single x where x.tid = s.tid)
          and to_tsvector('english', concat_ws(' ', s.seg->>'t', s.next_seg->>'t')) @@ tq.query
    ),
    anyword as (
        select s.tid, s.ord, s.seg
        from segs s, tq
        where tq.anyq is not null
          and not exists (select 1 from single x where x.tid = s.tid)
          and not exists (select 1 from paired x where x.tid = s.tid)
          and to_tsvector('english', coalesce(s.seg->>'t', '')) @@ tq.anyq
    ),
    numbered as (
        select h.*, row_number() over (partition by h.tid order by h.ord) as n
        from (select * from single union all select * from paired union all select * from anyword) h
    ),
    hits as (
        select h.tid, jsonb_agg(h.seg order by h.ord) filter (where h.n <= 30) as hits, count(*)::integer as hit_count
        from numbered h
        group by h.tid
    )
    select m.id, m.student_id, m.student_folder, m.recorded_on, m.lesson_id, m.dropbox_path, m.video_path,
           m.transcript_path, m.duration_seconds, coalesce(h.hits, '[]'::jsonb), coalesce(h.hit_count, 0), m.total
    from matched m
    left join hits h on h.tid = m.id
    order by m.recorded_on desc nulls last, m.created_at desc
$$;

revoke all on function public.search_lesson_transcripts(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.search_lesson_transcripts(text, integer, uuid) to service_role;
