-- 📇 Contacts: the places and people you deal with (dentist, garage, insurer…), with phone, website, address and a
-- short description. Found in Gmail, appointments and bills (added straight away: owner's choice) or added by you.
-- Same rules as everywhere: every row belongs to a user, Row Level Security keeps it private.
-- One row per real place: `key` is its normalized identity (website domain, phone, email or name), unique per user.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null check (length(key) between 3 and 220),
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'other',       -- dentist | doctor | car | home | beauty | pet | school | bank | insurance | utility | government | restaurant | shop | other
  person text check (person is null or length(person) <= 120),
  phones text[] not null default '{}',
  emails text[] not null default '{}',
  website text check (website is null or length(website) <= 300),
  address text check (address is null or length(address) <= 300),
  description text check (description is null or length(description) <= 300),
  notes text check (notes is null or length(notes) <= 2000),
  favorite boolean not null default false,
  sources text[] not null default '{}',      -- email | hand | appt | bill | purchase
  mine text[] not null default '{}',         -- fields you set yourself: automatic finds never change them
  status text not null default 'active' check (status in ('active','hidden')), -- hidden = "Not a contact" (remembered, never comes back)
  last_seen date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create index contacts_user on public.contacts (user_id, status, name);

alter table public.contacts enable row level security;
create policy "own contacts" on public.contacts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger contacts_touch before update on public.contacts for each row execute function public.touch();
