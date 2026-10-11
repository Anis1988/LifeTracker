-- Private bucket for bills, statements and policies: each user only sees their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit)
values ('docs', 'docs', false, 15728640)
on conflict (id) do nothing;

create policy "own docs read" on storage.objects for select to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own docs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Daily automatic run (bank, Gmail, calendar, reminders) at 11:15 UTC (about 7am New York).
-- It calls the "cron" server function with two values kept in Supabase Vault (see README → Setup):
--   lt_project_url  = https://<project>.supabase.co
--   lt_cron_secret  = the same text as the CRON_SECRET function secret
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule('lifetracker-daily', '15 11 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'lt_project_url') || '/functions/v1/cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lt_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$job$);
