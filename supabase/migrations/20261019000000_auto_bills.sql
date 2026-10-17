-- 🆕 Fully automatic (owner's choice): bills found by the bank rhythm, bill emails and bill documents are now added to
-- Bills by themselves, with a heads-up and an Undo in the 🔔 Inbox (which remembers it, so it never comes back).
-- The "suggestions" table stays as that memory: status 'accepted' + item_id = added (evidence.auto = true when it was
-- automatic), 'ignored' = undone / not a bill. Nothing is ever paid, cancelled or moved.
--
-- One time: every find still waiting for an OK ('new') becomes a bill now, the same way (or is linked to a bill that
-- already matches it: same name or same bank name), with a heads-up. Row Level Security is unchanged.

do $$
declare
  s record;
  found_id uuid;
  new_id uuid;
  cyc text;
  word text;
  src text;
begin
  for s in select * from public.suggestions where status = 'new' order by created_at loop
    select i.id into found_id from public.items i
      where i.user_id = s.user_id and i.status <> 'cancelled'
        and (lower(i.name) = lower(s.name) or (s.merchant is not null and i.merchant is not null and lower(i.merchant) = lower(s.merchant)))
      limit 1;
    if found_id is not null then
      update public.suggestions set status = 'accepted', item_id = found_id, evidence = evidence || '{"auto": true}'::jsonb where id = s.id;
      continue;
    end if;
    cyc := case when s.cycle in ('weekly','biweekly','monthly','quarterly','semiannual','yearly','once') then s.cycle else 'monthly' end;
    insert into public.items (user_id, name, category, amount, currency, cycle, next_due, ends_on, trial_ends, merchant, details, source, autopay)
      values (s.user_id, left(coalesce(nullif(trim(s.name), ''), 'Bill'), 120), coalesce(s.category, 'other'), coalesce(s.amount, 0), coalesce(s.currency, 'USD'), cyc,
              s.next_due, s.ends_on, s.trial_ends, s.merchant, coalesce(s.details, '{}'::jsonb), s.source, s.source = 'bank')
      returning id into new_id;
    update public.suggestions set status = 'accepted', item_id = new_id, evidence = evidence || '{"auto": true}'::jsonb where id = s.id;
    word := case cyc when 'weekly' then 'weekly' when 'biweekly' then 'every 2 weeks' when 'monthly' then 'monthly' when 'quarterly' then 'every 3 months'
                     when 'semiannual' then 'every 6 months' when 'yearly' then 'yearly' else 'one time' end;
    src := case s.source when 'bank' then 'from your bank' when 'email' then 'from your email' else 'from a document' end;
    insert into public.alerts (user_id, kind, key, title, body, item_id)
      values (s.user_id, 'found', 'moved:' || s.source || ':' || s.key,
              left('Added: ' || left(coalesce(nullif(trim(s.name), ''), 'Bill'), 120) || case when coalesce(s.amount, 0) > 0 then ' $' || to_char(s.amount, 'FM999999990.00') else '' end || ' ' || word || ' — ' || src, 200),
              'It was waiting in Inbox; bills found for you are now added by themselves. Not a bill? Tap Undo in the 🔔 Inbox (it won’t come back).', new_id)
      on conflict (user_id, kind, key) do nothing;
  end loop;
end $$;
