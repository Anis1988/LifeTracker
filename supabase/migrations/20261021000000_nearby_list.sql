-- 📌 My list (Contacts → 📍 Nearby): places and things to do you saved from Nearby, to go to one day.
-- A snapshot of what was found (name, kind, address, phone, website, map point, miles + drive time, event day,
-- one line about it, the page it came from) plus your own fields: a note, a planned day, done (+ when) and 1–5 stars.
-- Same rules as everywhere: every row belongs to a user, Row Level Security keeps it private. Only you add, edit and
-- delete them (straight from the app, like Contacts); the server only reads names for 💬 Ask.

create table public.nearby_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'other',          -- the Nearby kind: dentist | food | fun | event | trip | …
  address text check (address is null or length(address) <= 300),
  phone text check (phone is null or length(phone) <= 40),
  website text check (website is null or length(website) <= 300),
  lat double precision,
  lon double precision,
  miles real,
  minutes integer,
  route boolean not null default false,        -- true = a real road route, false = an estimate ("about")
  when_text text check (when_text is null or length(when_text) <= 120), -- events: the day(s) and time, in words
  about text check (about is null or length(about) <= 300),
  source text check (source is null or length(source) <= 500),
  note text check (note is null or length(note) <= 2000),
  planned date,
  done boolean not null default false,
  done_at timestamptz,
  rating smallint check (rating is null or rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nearby_list_user on public.nearby_list (user_id, done, created_at desc);

alter table public.nearby_list enable row level security;
create policy "own nearby list" on public.nearby_list for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger nearby_list_touch before update on public.nearby_list for each row execute function public.touch();
