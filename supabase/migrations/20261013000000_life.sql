-- 🧾 Returns & warranties (from Gmail receipts or added by hand) and 🎂 important dates & car care.
-- Same rules as everywhere: every row belongs to a user, Row Level Security keeps it private.

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,                 -- mail:<gmail id> for ones found in Gmail, hand:<uuid> for ones added by hand
  store text not null check (length(store) between 1 and 120),
  item text,                         -- what was bought
  amount numeric(12,2),
  bought date not null default current_date,
  return_by date,                    -- last day to return it
  warranty_ends date,
  status text not null default 'keep' check (status in ('keep','kept','returning','returned','ignored')), -- keep = still deciding; kept = keeping it (warranty only)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create index purchases_user on public.purchases (user_id, return_by);

create table public.life_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'other',  -- birthday | anniversary | car | health | home | pet | other
  title text not null check (length(title) between 1 and 120),
  next_date date not null,
  every_months int check (every_months is null or every_months between 1 and 120), -- null = once; 12 = every year
  remind_days int not null default 3 check (remind_days between 0 and 60),
  notes text,
  calendar jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index life_dates_user on public.life_dates (user_id, next_date);

alter table public.purchases enable row level security;
alter table public.life_dates enable row level security;
create policy "own purchases" on public.purchases for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own life dates" on public.life_dates for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger purchases_touch before update on public.purchases for each row execute function public.touch();
create trigger life_dates_touch before update on public.life_dates for each row execute function public.touch();
