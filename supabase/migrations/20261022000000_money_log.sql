-- 📜 Money → Log (owner's request, like the Trading app's log): short time-stamped lines on what happened to your money
-- data: a purchase added (and from where, and the category it counts in), a receipt attached or merged, a category
-- moved, a line edited or deleted, a bill added by itself or undone.
-- Same rules as everywhere: every row belongs to a user, Row Level Security keeps it private. The owner reads and
-- deletes their own lines; only the server writes them (Edge Functions with the service role). Kept 180 days (the
-- daily run removes older ones).

create table if not exists public.money_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('purchase','receipt','bill','change')),
  ref text,                -- what it is about: a transactions id, or an items id (bills)
  key text,                -- "add:<transactions id>" for "added" lines, so the first-open backfill never doubles one
  text text not null check (length(text) <= 300),
  data jsonb not null default '{}'::jsonb, -- e.g. {tx, item, cat, from, to, source}
  unique (user_id, key)
);
create index if not exists money_log_user_at on public.money_log (user_id, at desc);

alter table public.money_log enable row level security;
create policy "own money log read" on public.money_log for select to authenticated using (user_id = auth.uid());
create policy "own money log delete" on public.money_log for delete to authenticated using (user_id = auth.uid());
