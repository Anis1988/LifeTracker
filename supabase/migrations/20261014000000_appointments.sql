-- 📅 Appointments found in emails and texts (and added straight to the LifeTracker calendar: owner's choice).
-- Same rules as everywhere: every row belongs to a user, Row Level Security keeps it private.
-- The message itself is not kept: only the appointment and who sent it.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,                  -- mail:<gmail id> | text:<hash> | hand:<uuid>
  title text not null check (length(title) between 1 and 120),
  kind text not null default 'other',  -- health | dental | car | beauty | home | pet | work | food | other
  day date not null,
  time text check (time is null or time ~ '^\d{2}:\d{2}$'), -- HH:MM in your time zone; null = all day
  minutes int check (minutes is null or minutes between 1 and 720),
  place text,
  with_who text,
  notes text,
  source text not null default 'hand' check (source in ('email','text','hand')),
  source_from text,                   -- who sent it (email sender / phone number or name)
  status text not null default 'booked' check (status in ('booked','cancelled','removed')), -- removed = you took it off
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create index appointments_user on public.appointments (user_id, day);

alter table public.appointments enable row level security;
create policy "own appointments" on public.appointments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger appointments_touch before update on public.appointments for each row execute function public.touch();

-- Every hour (at :40): look for new appointment emails and put them in the calendar.
select cron.schedule('lifetracker-appointments', '40 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'lt_project_url') || '/functions/v1/cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lt_cron_secret')),
    body := '{"only":"appts"}'::jsonb,
    timeout_milliseconds := 300000
  );
$job$);
