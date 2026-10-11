import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { Alert, Extracted, Finding, Item, Paper, Sender, Settings } from './model.ts';
import { daysBetween, iso, money, nextDue, perYear, today } from './money.ts';
import { findRecurring, matchesItem, merchantKey } from './recurring.ts';
import { fetchAccounts } from './simplefin.ts';
import { ensureCalendar, findAlertEmails, findBillEmails, has, isRateLimit, looksLikeBill, readEmail, refresh, syncCalendar } from './google.ts';
import { readWithAi } from './ai.ts';
import { connection, env, open, saveConnection, settingsOf } from './server.ts';
import { ALERT_QUERY, parseBankAlert } from './alerts.ts';
import { breachStep, ensureBrokers, onlineStep } from './me.ts';
import { sweepStep, unsubStep } from './unsub.ts';
import { spentOf, weekSummary } from './week.ts';
import { paperKind } from './people.ts';

/**
 * 🔄 One automatic run for one person (every morning, or "Sync now"):
 * bank → find recurring bills → Gmail receipts → roll due dates → Google Calendar → heads-ups (+ email).
 * Each step is independent: one failing never stops the others. Free steps first; the AI only reads emails
 * that already look like bills (free check), within the daily limits.
 */
export interface RunLog { steps: string[]; errors: string[]; newAlerts: number }

type NewAlert = Omit<Alert, 'id' | 'seen' | 'created_at'> & { user_id: string };

/** Parts that can be run on their own (from the app's buttons). */
export type Part = 'bills' | 'online' | 'breaches' | 'lists' | 'week';

export async function syncUser(db: SupabaseClient, userId: string, email?: string, opts: { full?: boolean; only?: Part[]; force?: boolean } = {}): Promise<RunLog> {
  const s = await settingsOf(db, userId);
  const log: RunLog = { steps: [], errors: [], newAlerts: 0 };
  const alerts: NewAlert[] = [];
  // Server functions are stopped after about 150 s: long reads stop in time and carry on the next run.
  const until = Date.now() + 110_000;
  const want = (p: Part) => !opts.only || opts.only.includes(p);
  const step = async (name: string, f: () => Promise<string | void>) => {
    if (Date.now() > until + 15_000) { log.errors.push(`${name}: skipped (out of time, next run)`); return; }
    try {
      const r = await f();
      if (r) log.steps.push(`${name}: ${r}`);
    } catch (e) {
      log.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
  };

  if (want('bills')) {
    await step('Bank', () => bankStep(db, userId, s, opts.full));
    await step('Bank alerts', () => alertStep(db, userId, s, until));
    await step('Recurring', () => detectStep(db, userId, s, alerts));
    await step('Gmail', () => gmailStep(db, userId, s, alerts, until));
    await step('Due dates', () => rollStep(db, userId));
    await step('Calendar', () => calendarStep(db, userId, s));
    await step('Heads-ups', () => headsUpStep(db, userId, s, alerts));
  }
  if (want('breaches')) await step('Data breaches', () => breachStep(db, userId, alerts));
  if (want('online')) await step('Your name online', async () => { await ensureBrokers(db, userId); return onlineStep(db, userId, s, alerts, opts.force); });
  if (want('lists')) {
    await step('Mailing lists', () => sweepStep(db, userId, s, until));
    await step('Unsubscribe', () => unsubStep(db, userId, s, until + 10_000));
  }

  if (alerts.length) {
    const { data } = await db.from('alerts').upsert(alerts, { onConflict: 'user_id,kind,key', ignoreDuplicates: true }).select('title, body');
    log.newAlerts = data?.length ?? 0;
    if (data?.length && s.notify.email && email) await step('Email', () => digest(email, data as { title: string; body: string | null }[]));
  }
  if (want('week') && email) await step('My week', () => weekStep(db, userId, email, s, opts.force));
  if (!opts.only) await saveConnection(db, userId, 'status', null, { lastRun: new Date().toISOString(), steps: log.steps, errors: log.errors });
  return log;
}

// ---------- 🏦 bank ----------
async function bankStep(db: SupabaseClient, userId: string, s: Settings, full?: boolean): Promise<string | void> {
  const c = await connection(db, userId, 'simplefin');
  if (!c) return;
  const last = c.meta.lastSync as string | undefined;
  const since = full || !last ? iso(new Date(Date.now() - s.bank.lookbackDays * 86400_000)) : iso(new Date(Date.parse(last) - 10 * 86400_000));
  const { accounts, errors } = await fetchAccounts(await open(c.secret), since);
  const rows = accounts.flatMap((a) => (a.transactions ?? []).filter((t) => !t.pending).map((t) => {
    const description = (t.payee || t.description || t.memo || '').slice(0, 200);
    return {
      user_id: userId, external_id: `${a.id}:${t.id}`, account: `${a.org?.name ?? ''} ${a.name}`.trim().slice(0, 80),
      posted: iso(new Date(t.posted * 1000)), amount: Number(t.amount), description, merchant: merchantKey(description),
    };
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('transactions').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,external_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  await saveConnection(db, userId, 'simplefin', null, {
    lastSync: new Date().toISOString(), errors,
    accounts: accounts.map((a) => ({ name: `${a.org?.name ?? ''} ${a.name}`.trim(), balance: Number(a.balance), currency: a.currency })),
  });
  return `${rows.length} transactions from ${accounts.length} account(s)${errors.length ? ` (bank says: ${errors.join('; ')})` : ''}`;
}

// ---------- 📧 bank alert emails (free: patterns, no AI) ----------
async function alertStep(db: SupabaseClient, userId: string, s: Settings, until: number): Promise<string | void> {
  const c = await connection(db, userId, 'google');
  if (!c || !s.bank.alerts || !has(c.meta.scope as string, 'gmail')) return;
  const at = await refresh(await open(c.secret));
  const seen = new Set((c.meta.seenAlerts as string[] | undefined) ?? []);
  // First time: as far back as your alerts go (400 days), spread over several runs so Gmail's per-minute limit isn't hit; then the last week.
  const done = !!c.meta.alertsDone;
  const all = (await findAlertEmails(at, done ? 7 : s.bank.lookbackDays, ALERT_QUERY, done ? 200 : 2000)).filter((id) => !seen.has(id));
  const ids = all.slice(0, PER_RUN);
  const rows: Record<string, unknown>[] = [];
  let skipped = 0, stopped = '';
  const banks = new Set<string>();
  for (const id of ids) {
    if (Date.now() > until) { stopped = 'out of time: the rest next time'; break; }
    let m;
    try { m = await readEmail(at, id); } catch (e) {
      if (!isRateLimit(e)) throw e;
      stopped = 'Gmail asked to slow down: the rest next time'; break;
    }
    seen.add(id);
    const tx = parseBankAlert(m);
    if (!tx) { skipped++; continue; }
    banks.add(tx.bank);
    rows.push({ user_id: userId, external_id: `mail:${id}`, account: tx.account, posted: tx.posted, amount: -tx.amount, description: tx.merchant, merchant: merchantKey(tx.merchant) });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('transactions').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,external_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const left = all.filter((id) => !seen.has(id)).length;
  await saveConnection(db, userId, 'google', null, {
    seenAlerts: [...seen].slice(-5000), alertsScanned: new Date().toISOString(), alertsDone: done || left === 0,
    alertsRead: ((c.meta.alertsRead as number) ?? 0) + rows.length, alertBanks: [...new Set([...((c.meta.alertBanks as string[]) ?? []), ...banks])],
  });
  if (ids.length) return `${rows.length} purchase(s) read from ${ids.length} alert email(s)${banks.size ? ` (${[...banks].join(', ')})` : ''}${skipped ? `, ${skipped} not purchases` : ''}${left ? `; ${left} older ones next time` : ''}${stopped ? `. ${stopped}` : ''}`;
}
const PER_RUN = 300; // alert emails read per run (about 75 seconds)

// ---------- 🔁 recurring bills in the transactions ----------
async function detectStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[]): Promise<string | void> {
  const since = iso(new Date(Date.now() - s.bank.lookbackDays * 86400_000));
  const { data: txs } = await db.from('transactions').select('posted, amount, description, merchant').eq('user_id', userId).gte('posted', since).limit(20000);
  if (!txs?.length) return;
  const found = findRecurring(txs as { posted: string; amount: number; description: string; merchant: string }[], s.bank.minCharges);
  const { data: items } = await db.from('items').select('*').eq('user_id', userId).neq('status', 'cancelled');
  const { data: sugg } = await db.from('suggestions').select('key, status').eq('user_id', userId).eq('source', 'bank');
  const known = new Map((sugg ?? []).map((x) => [x.key, x.status]));
  let matched = 0, fresh = 0;
  for (const r of found) {
    const item = (items as Item[] | null)?.find((i) => matchesItem(i, r.key));
    if (item) {
      matched++;
      const patch: Partial<Item> = {};
      if (!item.last_charged || r.lastDate > item.last_charged) {
        patch.last_charged = r.lastDate;
        patch.last_amount = r.amount;
        if (item.cycle !== 'once' && (!item.next_due || item.next_due <= r.lastDate)) patch.next_due = r.nextDue;
        if (!item.merchant) patch.merchant = r.key;
        // The price changed (2% or more): new amount, price history, and a heads-up.
        if (item.amount > 0 && Math.abs(r.amount - item.amount) / item.amount >= 0.02) {
          patch.amount = r.amount;
          patch.price_history = [...(item.price_history ?? []), { date: r.lastDate, amount: r.amount }].slice(-24);
          const up = r.amount > item.amount;
          alerts.push({ user_id: userId, kind: 'price', key: `${item.id}:${r.lastDate}`, item_id: item.id, title: `${item.name} ${up ? 'went up' : 'went down'}: ${money(item.amount)} → ${money(r.amount)}`, body: up ? `That's ${money((r.amount - item.amount) * Math.max(1, perYear(item.cycle)))} more a year. Worth checking if you still need it, or asking for a better deal.` : 'Good news: it costs less now.' });
        }
      }
      if (Object.keys(patch).length) await db.from('items').update(patch).eq('id', item.id);
      await db.from('transactions').update({ item_id: item.id }).eq('user_id', userId).eq('merchant', r.key).is('item_id', null);
      continue;
    }
    const st = known.get(r.key);
    if (st === 'ignored' || st === 'accepted') continue;
    const row = {
      user_id: userId, key: r.key, source: 'bank', name: r.name, category: r.category, amount: r.amount, cycle: r.cycle, next_due: r.nextDue,
      merchant: r.key, evidence: { charges: r.charges }, status: 'new',
    };
    await db.from('suggestions').upsert(row, { onConflict: 'user_id,source,key' });
    if (!st) {
      fresh++;
      alerts.push({ user_id: userId, kind: 'found', key: `bank:${r.key}`, item_id: null, title: `New bill found: ${r.name} ${money(r.amount)} ${r.cycle}`, body: 'Open Inbox to add it or ignore it.' });
    }
  }
  return `${found.length} recurring payment(s): ${matched} matched to your bills, ${fresh} new to check`;
}

// ---------- ✉️ Gmail receipts ----------
async function gmailStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[], until: number): Promise<string | void> {
  const c = await connection(db, userId, 'google');
  if (!c || !s.gmail.on || !has(c.meta.scope as string, 'gmail')) return;
  const at = await refresh(await open(c.secret));
  const seen = new Set((c.meta.seenMail as string[] | undefined) ?? []);
  const ids = (await findBillEmails(at, c.meta.gmailScanned ? 5 : 60, s.gmail.plusTag)).filter((id) => !seen.has(id));
  const { data: items } = await db.from('items').select('*').eq('user_id', userId).neq('status', 'cancelled');
  let read = 0, bills = 0, skipped = 0;
  let stopped = '';
  for (const id of ids) {
    if (Date.now() > until) { stopped = 'out of time: the rest next time'; break; }
    let m;
    try { m = await readEmail(at, id); } catch (e) {
      if (!isRateLimit(e)) throw e;
      stopped = 'Gmail asked to slow down: the rest next time'; break;
    }
    if (!looksLikeBill(m) || !s.ai.readEmails) { seen.add(id); skipped++; continue; }
    if (read >= s.ai.maxPerRun) break; // the rest next time
    let x: Extracted;
    try {
      x = (await readWithAi(db, userId, s, { text: `From: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\n\n${m.text}` })).data;
    } catch (e) {
      stopped = e instanceof Error ? e.message : String(e); // AI limits reached: try again next run
      break;
    }
    read++;
    seen.add(id);
    if (!x.isBill) continue;
    bills++;
    await applyExtracted(db, userId, x, 'email', `mail:${merchantKey(x.merchant || x.name)}`, { subject: m.subject, from: m.from }, (items as Item[]) ?? [], alerts);
  }
  await saveConnection(db, userId, 'google', null, { seenMail: [...seen].slice(-1000), gmailScanned: new Date().toISOString() });
  return `${ids.length} email(s) looked at: ${read} read by the AI, ${bills} bill(s), ${skipped} skipped for free${stopped ? `. Stopped: ${stopped}` : ''}`;
}

/**
 * What the AI found (email or document): updates the matching bill (new date, amount, renewal) or makes a
 * suggestion for you to OK. Never creates a bill by itself.
 */
export async function applyExtracted(db: SupabaseClient, userId: string, x: Extracted, source: 'email' | 'document', key: string, evidence: Record<string, unknown>, items: Item[], alerts: NewAlert[]): Promise<{ itemId?: string; suggestionId?: string }> {
  const item = items.find((i) => matchesItem(i, merchantKey(x.merchant || x.name)) || i.name.toLowerCase() === x.name.toLowerCase());
  if (item) {
    const patch: Partial<Item> = {};
    if (x.nextDue && x.nextDue >= today() && x.nextDue !== item.next_due) patch.next_due = x.nextDue;
    if (x.endsOn && x.endsOn !== item.ends_on) patch.ends_on = x.endsOn;
    if (x.trialEnds && x.trialEnds !== item.trial_ends) patch.trial_ends = x.trialEnds;
    if (x.amount && item.amount > 0 && Math.abs(x.amount - item.amount) / item.amount >= 0.02) {
      patch.amount = x.amount;
      patch.price_history = [...(item.price_history ?? []), { date: today(), amount: x.amount }].slice(-24);
      alerts.push({ user_id: userId, kind: 'price', key: `${item.id}:${x.amount}`, item_id: item.id, title: `${item.name}: ${money(item.amount)} → ${money(x.amount)}`, body: x.summary || null });
    }
    const details = { ...item.details, ...(x.policyNumber ? { policyNumber: x.policyNumber } : {}), ...(x.coverage ? { coverage: x.coverage } : {}), ...(x.deductible ? { deductible: x.deductible } : {}), ...(x.balance ? { balance: x.balance } : {}), ...(x.rate ? { rate: x.rate } : {}) };
    if (JSON.stringify(details) !== JSON.stringify(item.details)) patch.details = details;
    if (Object.keys(patch).length) await db.from('items').update(patch).eq('id', item.id);
    for (const w of x.warnings.slice(0, 2)) alerts.push({ user_id: userId, kind: 'renewal', key: `${item.id}:${w.slice(0, 60)}`, item_id: item.id, title: `${item.name}: ${w}`.slice(0, 200), body: null });
    return { itemId: item.id };
  }
  const { data: prev } = await db.from('suggestions').select('id, status').eq('user_id', userId).eq('source', source).eq('key', key).maybeSingle();
  if (prev && prev.status !== 'new') return { suggestionId: prev.id };
  const row = {
    user_id: userId, key, source, name: x.name || x.merchant, category: x.category, amount: x.amount, currency: x.currency || 'USD', cycle: x.cycle,
    next_due: x.nextDue, ends_on: x.endsOn, trial_ends: x.trialEnds, merchant: merchantKey(x.merchant || x.name),
    details: { policyNumber: x.policyNumber || undefined, coverage: x.coverage || undefined, deductible: x.deductible ?? undefined, balance: x.balance ?? undefined, rate: x.rate ?? undefined, last4: x.last4 || undefined },
    evidence: { ...evidence, note: [x.summary, ...x.warnings].filter(Boolean).join(' ') }, status: 'new',
  };
  const { data } = await db.from('suggestions').upsert(row, { onConflict: 'user_id,source,key' }).select('id').single();
  if (!prev) alerts.push({ user_id: userId, kind: 'found', key: `${source}:${key}`, item_id: null, title: `New ${source === 'email' ? 'bill in your email' : 'bill in a document'}: ${row.name}${x.amount ? ` ${money(x.amount)}` : ''}`, body: 'Open Inbox to add it or ignore it.' });
  return { suggestionId: data?.id };
}

// ---------- 📆 due dates roll forward ----------
async function rollStep(db: SupabaseClient, userId: string): Promise<string | void> {
  const { data } = await db.from('items').select('id, next_due, cycle').eq('user_id', userId).eq('status', 'active').lt('next_due', today()).neq('cycle', 'once');
  for (const i of data ?? []) await db.from('items').update({ next_due: nextDue(i as Item) }).eq('id', i.id);
  if (data?.length) return `${data.length} due date(s) moved to the next one`;
}

// ---------- 📅 Google Calendar ----------
async function calendarStep(db: SupabaseClient, userId: string, s: Settings): Promise<string | void> {
  const c = await connection(db, userId, 'google');
  if (!c || !s.calendar.on || !has(c.meta.scope as string, 'calendar')) return;
  const at = await refresh(await open(c.secret));
  const calendarId = await ensureCalendar(at, c.meta.calendarId as string | undefined);
  if (calendarId !== c.meta.calendarId) await saveConnection(db, userId, 'google', null, { calendarId });
  const { data: items } = await db.from('items').select('*').eq('user_id', userId);
  const { data: papers } = s.papers.on ? await db.from('papers').select('*').eq('user_id', userId) : { data: [] };
  const r = await syncCalendar(at, calendarId, (items as Item[]) ?? [], s, env('SITE_URL'), (papers as Paper[]) ?? []);
  return `calendar up to date (${r.added} added, ${r.changed} changed, ${r.removed} removed)`;
}

// ---------- 🔔 heads-ups ----------
async function headsUpStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[]): Promise<string | void> {
  const { data } = await db.from('items').select('*').eq('user_id', userId).eq('status', 'active');
  const t = today();
  let n = 0;
  for (const i of (data as Item[]) ?? []) {
    const due = nextDue(i);
    if (due && !i.autopay && daysBetween(t, due) <= s.notify.dueDays) { alerts.push({ user_id: userId, kind: 'due', key: `${i.id}:${due}`, item_id: i.id, title: `Pay ${i.name}: ${money(i.amount)} due ${due === t ? 'today' : due}`, body: 'Not on autopay.' }); n++; }
    if (i.trial_ends && i.trial_ends >= t && daysBetween(t, i.trial_ends) <= 3) { alerts.push({ user_id: userId, kind: 'trial', key: `${i.id}:${i.trial_ends}`, item_id: i.id, title: `${i.name}: free trial ends ${i.trial_ends}`, body: `Cancel before then if you don't want to pay ${money(i.amount)}.` }); n++; }
    if (i.ends_on && i.ends_on >= t && daysBetween(t, i.ends_on) <= s.notify.renewalDays) { alerts.push({ user_id: userId, kind: 'renewal', key: `${i.id}:${i.ends_on}`, item_id: i.id, title: `${i.name} renews or ends on ${i.ends_on}`, body: 'A good moment to compare prices or cancel.' }); n++; }
  }
  // 🪪 documents that expire: one heads-up at each step (90, 30, 7 days before by default), and once expired.
  if (s.papers.on) {
    const { data: papers } = await db.from('papers').select('*').eq('user_id', userId).not('expires', 'is', null);
    for (const p of (papers as Paper[]) ?? []) {
      const left = daysBetween(t, p.expires!);
      const at = [...s.papers.remind].sort((a, b) => a - b).find((d) => left <= d);
      if (left < 0) { alerts.push({ user_id: userId, kind: 'paper', key: `${p.id}:${p.expires}:expired`, item_id: null, title: `${paperKind(p.kind).icon} ${p.name} has expired (${p.expires})`, body: 'Renew it, or delete it in Me if you already did.' }); n++; }
      else if (at != null) { alerts.push({ user_id: userId, kind: 'paper', key: `${p.id}:${p.expires}:${at}`, item_id: null, title: `${paperKind(p.kind).icon} ${p.name} expires in ${left} day${left === 1 ? '' : 's'} (${p.expires})`, body: paperKind(p.kind).renew ? `Renew: ${paperKind(p.kind).renew}` : 'Time to renew it.' }); n++; }
    }
  }
  // 🔒 credit freeze (once per change) and the free credit reports (every few months).
  const c = s.credit;
  const left = (['equifax', 'experian', 'transunion'] as const).filter((b) => c[b] !== 'frozen');
  if (left.length) alerts.push({ user_id: userId, kind: 'credit', key: `freeze:${left.join(',')}`, item_id: null, title: `🔒 Freeze your credit: ${left.length} of 3 left`, body: 'Free, takes 5 minutes each, and stops anyone opening a loan or card in your name. Steps in Me → Credit.' });
  const due = !c.lastReport || daysBetween(c.lastReport, t) >= c.reportMonths * 30;
  if (due) alerts.push({ user_id: userId, kind: 'credit', key: `report:${t.slice(0, 7)}`, item_id: null, title: '🔎 Check your free credit reports', body: 'annualcreditreport.com: look for accounts you don’t know. Then tick “Checked” in Me → Credit.' });
  if (n) return `${n} heads-up(s)`;
}

// ---------- 📊 My week (an email on your chosen day; the same summary as on Home) ----------
async function weekStep(db: SupabaseClient, userId: string, email: string, s: Settings, force?: boolean): Promise<string | void> {
  if (!s.week.on && !force) return;
  const t = today();
  const meta = (await connection(db, userId, 'me'))?.meta ?? {};
  if (!force && (new Date(`${t}T12:00:00Z`).getUTCDay() !== s.week.day || meta.weekSent === t)) return;
  const since = iso(new Date(Date.now() - 63 * 86400_000));
  const [items, findings, senders, papers, tx] = await Promise.all([
    db.from('items').select('*').eq('user_id', userId),
    db.from('findings').select('*').eq('user_id', userId).neq('status', 'unknown'),
    db.from('senders').select('*').eq('user_id', userId).eq('status', 'unsubscribed'),
    db.from('papers').select('*').eq('user_id', userId),
    db.from('transactions').select('posted, amount, description').eq('user_id', userId).gte('posted', since).limit(20000),
  ]);
  const lines = weekSummary({ items: (items.data as Item[]) ?? [], findings: (findings.data as Finding[]) ?? [], senders: (senders.data as Sender[]) ?? [], papers: s.papers.on ? (papers.data as Paper[]) ?? [] : [], settings: s, spent: spentOf((tx.data ?? []) as { posted: string; amount: number; description: string | null }[], t) }, t);
  const r = await sendEmail(email, `LifeTracker: your week (${t})`, ['Your week, in short:', '', ...lines.map((l) => `${l.icon} ${l.text}`)].join('\n'));
  if (r.startsWith('sent')) await saveConnection(db, userId, 'me', null, { weekSent: t });
  return r;
}

/** The morning email (Resend: RESEND_API_KEY, RESEND_FROM). */
function digest(to: string, list: { title: string; body: string | null }[]): Promise<string> {
  const text = [`LifeTracker: ${list.length} new heads-up${list.length > 1 ? 's' : ''}`, '', ...list.map((a) => `• ${a.title}${a.body ? `\n  ${a.body}` : ''}`)].join('\n');
  return sendEmail(to, `LifeTracker: ${list[0].title}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`, text);
}

async function sendEmail(to: string, subject: string, body: string): Promise<string> {
  const key = env('RESEND_API_KEY');
  if (!key) return 'skipped (no RESEND_API_KEY)';
  const site = env('SITE_URL');
  const text = `${body}\n\n${site ? `Open LifeTracker: ${site}` : ''}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('RESEND_FROM') || 'LifeTracker <onboarding@resend.dev>', to: [to], subject: subject.slice(0, 150), text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  return `sent to ${to}`;
}

