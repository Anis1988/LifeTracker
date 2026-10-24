-- 👥 Whose mailbox (owner's request: label everything found in email with Roza / Anis, everywhere).
-- The mailbox (Gmail address) a row was found in, kept on the row itself so its person chip never depends on old finds.
-- Bills and Spending lines keep it in `details.mailbox` (jsonb they already have). Filled at insert by the server steps,
-- and once for older rows by `mailboxStep` in the daily run (server writes; Row Level Security unchanged).
alter table public.appointments add column if not exists mailbox text check (mailbox is null or length(mailbox) <= 320);
alter table public.papers add column if not exists mailbox text check (mailbox is null or length(mailbox) <= 320);
alter table public.purchases add column if not exists mailbox text check (mailbox is null or length(mailbox) <= 320);
alter table public.contacts add column if not exists mailbox text check (mailbox is null or length(mailbox) <= 320);
-- Heads-ups about something found in email say whose mailbox (the chip in the app, "Roza:" in emails to you).
alter table public.alerts add column if not exists mailbox text check (mailbox is null or length(mailbox) <= 320);
