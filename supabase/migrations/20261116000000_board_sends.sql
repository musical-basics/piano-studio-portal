-- Face ID send (POST /api/board-send): one row per signed send attempt from Lionel's board.
-- The nonce is the primary key, so a signature can be used once. At most one live attempt
-- (sending or sent) per board card, so a card is never sent twice.
-- Service role only: RLS on with no policies.
create table if not exists public.board_sends (
    nonce text primary key,
    message_id bigint not null,             -- the board card number
    channel text not null,
    ref text not null default '',           -- the family message the reply answers
    draft_sha256 text not null,
    status text not null default 'sending', -- sending | sent | refused | failed
    reason text,
    portal_message_id uuid,
    created_at timestamptz not null default now(),
    sent_at timestamptz
);

create unique index if not exists board_sends_one_live_per_card
    on public.board_sends (message_id) where status in ('sending', 'sent');

alter table public.board_sends enable row level security;
