-- 📁 Vault: all your documents (pet vaccines, medical, IDs, home, car, school, taxes, contracts, certificates…).
-- The Vault grows the existing "papers" table (passport, licence… from the Me tab) instead of copying it: one row per
-- document, so the expiry heads-ups and calendar events keep working, and nothing is stored twice.
-- Same rules as everywhere: every row belongs to a user, Row Level Security keeps it private ("own papers" policy).
-- Files stay in the private "docs" bucket under <user id>/vault/… (the existing "own docs" storage policies already
-- limit reading, adding and deleting to the owner's own <user id>/ folder, so no new storage policy is needed).

alter table public.papers
  add column if not exists folder text not null default 'other',          -- pets | medical | ids | home | car | school | taxes | legal | insurance | certificates | other
  add column if not exists due_kind text not null default 'expires' check (due_kind in ('expires','due')), -- "expires" (passport) or "next due" (next vaccine)
  add column if not exists doc_date date,                                  -- the date on the document
  add column if not exists tags text[] not null default '{}',
  add column if not exists files text[] not null default '{}',             -- pages / PDF in the private "docs" bucket (<user id>/vault/…)
  add column if not exists file_hash text,                                 -- SHA-256 of the file: the same file is never saved (or read by the AI) twice
  add column if not exists summary text check (summary is null or length(summary) <= 600),
  add column if not exists body text check (body is null or length(body) <= 4000), -- searchable words read from the document (no full ID numbers)
  add column if not exists source text not null default 'hand' check (source in ('hand','scan','email','inbox')),
  add column if not exists source_key text,                                -- email: mail:<gmail id>:<file hash>
  add column if not exists remind boolean not null default true,           -- heads-ups before the date
  add column if not exists calendar boolean not null default true,         -- an event in the LifeTracker calendar
  add column if not exists ai_by text;

alter table public.papers drop constraint if exists papers_source_key;
alter table public.papers add constraint papers_source_key unique (user_id, source_key);
create index if not exists papers_hash on public.papers (user_id, file_hash);
create index if not exists papers_folder on public.papers (user_id, folder);

-- Old papers: their photo becomes the first file, and they go in the folder that fits their kind.
update public.papers set files = array[photo] where photo is not null and files = '{}';
update public.papers set folder = case
  when kind in ('passport','license','id','trusted','visa') then 'ids'
  when kind in ('registration','inspection') then 'car'
  when kind = 'insurance' then 'insurance'
  else 'other' end
where folder = 'other';

-- 💳 Receipts from business emails go to Money: the receipt file is kept on the purchase (Money → Returns),
-- and bill attachments on the document (Inbox → Documents), with where it came from.
alter table public.purchases add column if not exists file text;
alter table public.documents add column if not exists origin text;
alter table public.documents add column if not exists hash text;
create index if not exists documents_hash on public.documents (user_id, hash);

-- 🤖 What the AI read from a file, kept by the file's SHA-256: the same file is never paid for twice.
-- Server only (no policies): the app never reads it directly.
create table if not exists public.ai_reads (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,               -- vault | bill
  hash text not null,
  data jsonb not null,
  by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, hash)
);
alter table public.ai_reads enable row level security;
drop trigger if exists ai_reads_touch on public.ai_reads;
create trigger ai_reads_touch before update on public.ai_reads for each row execute function public.touch();
