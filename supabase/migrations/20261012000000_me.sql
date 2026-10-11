-- 👤 "Me": your name online, people-search sites, data breaches, mailing lists, documents that expire.
-- Same rules as the rest: every row belongs to a user and Row Level Security keeps it private.

-- ---------- 🕵️ what was found about you (web pages, people-search sites, data breaches) ----------
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('web','broker','breach')),
  key text not null,                -- web: the page address; broker: the site id; breach: the breach name
  title text not null,
  url text,
  site text,
  snippet text,
  verdict text,                     -- web: profile | people-search | news | worrying | other
  why text,
  status text not null default 'new', -- web/breach: new | ok | not-me | done; broker: unknown | listed | requested | gone | not-listed
  found_at date not null default current_date,
  check_after date,                 -- people-search: look again from this day (they often list you again)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, key)
);
create index findings_user on public.findings (user_id, kind);

-- ---------- 📭 who sends you newsletters and ads (counted from Gmail, never the contents) ----------
create table public.senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  address text not null,            -- the sender's email address (lower case)
  name text,
  sample text,                      -- the subject of a recent email
  emails int not null default 0,    -- emails seen
  unread int not null default 0,    -- of which never opened
  first_seen date,
  last_seen date,
  last_opened date,                 -- the newest one you opened
  unsub jsonb not null default '{}'::jsonb, -- {oneClick?: url, web?: url, mailto?: address}
  spam boolean not null default false, -- seen in Spam: never unsubscribed (it would confirm your address)
  status text not null default 'subscribed' check (status in ('subscribed','unsubscribed','web','kept','blocked','failed')),
  auto boolean not null default false, -- unsubscribed by the automatic mode
  done_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, address)
);
create index senders_user on public.senders (user_id, emails desc);

-- ---------- 🪪 documents that expire (passport, licence, registration…) ----------
create table public.papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'other',
  name text not null check (length(name) between 1 and 120),
  holder text,                      -- whose it is (you, a child…)
  number_end text,                  -- last 4 characters only
  expires date,
  notes text,
  photo text,                       -- a photo of it in the private "docs" bucket (<user id>/papers/…), optional
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index papers_user on public.papers (user_id, expires);

alter table public.findings enable row level security;
alter table public.senders enable row level security;
alter table public.papers enable row level security;
create policy "own findings" on public.findings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own senders" on public.senders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own papers" on public.papers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger findings_touch before update on public.findings for each row execute function public.touch();
create trigger senders_touch before update on public.senders for each row execute function public.touch();
create trigger papers_touch before update on public.papers for each row execute function public.touch();
