-- 📍 Nearby: what was found near your zip code, kept so the same search is never paid twice.
-- kind: zip (the zip's map point) | search ("dentist", 7 days) | todo (restaurants, fun places, events, day trips) | weekend (this weekend's list).
-- Same rules as everywhere: every row belongs to a user, Row Level Security keeps it private. The app can read and
-- delete its own rows; only the server function writes them (like the AI's other finds).

create table public.nearby (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('zip','search','todo','weekend')),
  key text not null check (length(key) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, key)
);
create index nearby_user on public.nearby (user_id, kind, updated_at desc);

alter table public.nearby enable row level security;
create policy "own nearby read" on public.nearby for select to authenticated using (user_id = auth.uid());
create policy "own nearby delete" on public.nearby for delete to authenticated using (user_id = auth.uid());
create trigger nearby_touch before update on public.nearby for each row execute function public.touch();
