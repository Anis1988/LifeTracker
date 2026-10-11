-- LifeTracker: everything you pay regularly (subscriptions, mortgage, insurance, utilities…), for one person or many.
-- Every table belongs to a user and Row Level Security keeps each user's rows private. Secrets (bank access,
-- Google tokens) and AI counters live in tables the app can't read at all: only the server functions can.

create extension if not exists pgcrypto;

-- ---------- settings (one row per user) ----------
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- what you pay ----------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 120),
  category text not null default 'subscription',
  amount numeric(12,2) not null default 0,
  currency text not null default 'USD',
  cycle text not null default 'monthly' check (cycle in ('weekly','biweekly','monthly','quarterly','semiannual','yearly','once')),
  next_due date,
  ends_on date,          -- contract end / policy renewal / mortgage payoff
  trial_ends date,       -- free trial: when it starts charging
  autopay boolean not null default true,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  merchant text,         -- how it shows on the bank statement (matching key)
  account text,          -- card or account it is paid from
  website text,
  notes text,
  details jsonb not null default '{}'::jsonb,   -- per kind: mortgage balance/rate, policy number, coverage…
  source text not null default 'manual',        -- manual | bank | document | email
  price_history jsonb not null default '[]'::jsonb, -- [{date, amount}]
  last_charged date,
  last_amount numeric(12,2),
  calendar jsonb not null default '{}'::jsonb,  -- Google Calendar event ids
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_user on public.items (user_id);

-- ---------- bank / card transactions (read-only copies) ----------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  external_id text not null,
  account text,
  posted date not null,
  amount numeric(12,2) not null,   -- negative = money out
  description text,
  merchant text,
  item_id uuid references public.items on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);
create index transactions_user_posted on public.transactions (user_id, posted desc);

-- ---------- "Is this a bill?" found automatically, waiting for your OK ----------
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  key text not null,                -- merchant key or document/email id (one suggestion per thing)
  source text not null,             -- bank | document | email
  name text not null,
  category text,
  amount numeric(12,2),
  currency text default 'USD',
  cycle text,
  next_due date,
  ends_on date,
  trial_ends date,
  merchant text,
  details jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,  -- charges seen, email subject, document id…
  status text not null default 'new' check (status in ('new','accepted','ignored')),
  item_id uuid references public.items on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, key)
);

-- ---------- uploaded bills, statements, policies ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  path text not null,               -- in the private "docs" bucket: <user id>/<file>
  file_name text not null,
  mime text not null,
  size int not null default 0,
  status text not null default 'new' check (status in ('new','reading','done','failed')),
  extracted jsonb,
  ai_by text,
  error text,
  item_id uuid references public.items on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- heads-ups: price went up, trial ends, renewal soon, new bill found ----------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,               -- price | trial | renewal | due | found | sync
  key text not null,                -- one alert per thing (e.g. item id + date)
  title text not null,
  body text,
  item_id uuid references public.items on delete cascade,
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, kind, key)
);

-- ---------- server-only: secrets and counters (no policies = the app can't read them) ----------
create table public.connections (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,               -- simplefin | google
  secret text not null,             -- encrypted by the server functions (AES-GCM)
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  provider text not null,
  n int not null default 0,
  primary key (user_id, day, provider)
);

-- ---------- Row Level Security ----------
alter table public.settings enable row level security;
alter table public.items enable row level security;
alter table public.transactions enable row level security;
alter table public.suggestions enable row level security;
alter table public.documents enable row level security;
alter table public.alerts enable row level security;
alter table public.connections enable row level security;
alter table public.ai_usage enable row level security;

create policy "own settings" on public.settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items" on public.items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own transactions" on public.transactions for select to authenticated using (user_id = auth.uid());
create policy "own transactions delete" on public.transactions for delete to authenticated using (user_id = auth.uid());
create policy "own suggestions" on public.suggestions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own documents" on public.documents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own alerts" on public.alerts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- connections and ai_usage: no policies on purpose (server functions only, with the service key).

-- updated_at stamps
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger items_touch before update on public.items for each row execute function public.touch();
create trigger settings_touch before update on public.settings for each row execute function public.touch();
create trigger suggestions_touch before update on public.suggestions for each row execute function public.touch();

-- AI counter: +1 if still under the limit (null = no limit). Atomic, so two checks at once can't pass the limit.
create or replace function public.take_ai(p_user uuid, p_provider text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  insert into public.ai_usage (user_id, day, provider, n) values (p_user, current_date, p_provider, 0)
    on conflict do nothing;
  select n into cur from public.ai_usage where user_id = p_user and day = current_date and provider = p_provider for update;
  if p_limit is not null and cur >= p_limit then return false; end if;
  update public.ai_usage set n = n + 1 where user_id = p_user and day = current_date and provider = p_provider;
  return true;
end $$;
revoke all on function public.take_ai(uuid, text, int) from public, anon, authenticated;
