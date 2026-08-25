-- Run once in Supabase SQL Editor.
create table if not exists public.memos (
  id text primary key,
  owner_hash text not null,
  share_hash text,
  title text not null default 'مذكرة جديدة',
  document jsonb,
  source_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index if not exists memos_owner_hash_updated_idx on public.memos(owner_hash, updated_at desc);
create index if not exists memos_share_hash_idx on public.memos(share_hash) where share_hash is not null;

-- The browser never talks directly to this table. The Node server uses the service-role key.
alter table public.memos enable row level security;

-- Storage bucket used by the server proxy. Keep it private; the app serves images via /api/assets/:name.
insert into storage.buckets (id, name, public)
values ('alnoon-assets', 'alnoon-assets', false)
on conflict (id) do nothing;
