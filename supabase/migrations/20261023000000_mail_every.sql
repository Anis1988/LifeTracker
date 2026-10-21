-- 📬 Email checks: the email look now runs every quarter hour (:00, :15, :30, :45 UTC) instead of once an hour.
-- Each person's Settings → 📬 Email checks (`mail.every`: 15/30/60/120/240 min, or Off = daily run only) decides which
-- slots really read their Gmail (the `cron` function checks it; `at` = the slot time). Same job name, so the old hourly
-- job is replaced, never left running beside it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'lifetracker-appointments') then
    perform cron.unschedule('lifetracker-appointments');
  end if;
end $$;

select cron.schedule('lifetracker-appointments', '0,15,30,45 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'lt_project_url') || '/functions/v1/cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lt_cron_secret')),
    body := jsonb_build_object('only', 'appts', 'at', now()),
    timeout_milliseconds := 300000
  );
$job$);
