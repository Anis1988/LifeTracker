-- ⏸ Pause everything (owner's request: a big red button at the top of the app). While paused, nothing runs for that
-- person: no AI call (any AI, free or paid: take_ai() below says no), no email, no Gmail/Calendar/bank work, no
-- automatic run (daily, quarter-hour email look, Friday weekend list), no phone texts read, until Resume.
-- One row per person. The owner reads their own row; only the server writes it (api action "pause").

create table if not exists public.pauses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  paused boolean not null default false,
  at timestamptz not null default now()
);
alter table public.pauses enable row level security;
create policy "own pause read" on public.pauses for select to authenticated using (user_id = auth.uid());

-- AI counter: +1 if still under the limit (null = no limit). Atomic. Never while paused (checked here, at the one
-- door every AI call goes through, so no code path can spend AI while the app is paused).
create or replace function public.take_ai(p_user uuid, p_provider text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  if exists (select 1 from public.pauses where user_id = p_user and paused) then return false; end if;
  insert into public.ai_usage (user_id, day, provider, n) values (p_user, current_date, p_provider, 0)
    on conflict do nothing;
  select n into cur from public.ai_usage where user_id = p_user and day = current_date and provider = p_provider for update;
  if p_limit is not null and cur >= p_limit then return false; end if;
  update public.ai_usage set n = n + 1 where user_id = p_user and day = current_date and provider = p_provider;
  return true;
end $$;
revoke all on function public.take_ai(uuid, text, int) from public, anon, authenticated;
