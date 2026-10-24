import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { Alert, Extracted, Finding, Item, LifeDate, Paper, Sender, Settings } from './model.ts';
import { addCycle, daysBetween, dueDayOf, iso, money, nextDue, parseDay, perYear, today, todayIn } from './money.ts';
import { findRecurring, matchesItem, merchantKey } from './recurring.ts';
import { fetchAccounts } from './simplefin.ts';
import { countReads, ensureCalendar, findAlertEmails, findBillEmails, has, isRateLimit, looksLikeBill, readEmail, refresh, stopCounting, syncCalendar } from './google.ts';
import { allBoxes, boxName, boxPeople, boxPerson, boxTag, mailBoxes, saveState, stateOf, tokenOf, type Box } from './mailbox.ts';
import { nameAddresses, personOf, personOfBox } from './mailPeople.ts';
import { labelAlerts, mailboxStep } from './mailboxFill.ts';
import { sameSpend } from './receiptText.ts';
import { readWithAi } from './ai.ts';
import { connection, env, open, saveConnection, settingsOf } from './server.ts';
import { ALERT_QUERY, AUTOPAY_QUERY, parseAutopay, parseBankAlert } from './alerts.ts';
import { breachStep, ensureBrokers, onlineStep } from './me.ts';
import { sweepStep, unsubStep } from './unsub.ts';
import { spentOf, weekSummary, type WeekInput } from './week.ts';
import { paperKind } from './people.ts';
import { docIcon } from './vaultText.ts';
import { vaultEmailStep } from './vaultMail.ts';
import { purchaseAlerts, purchaseStep } from './purchases.ts';
import { mergeBankRows, moveOldReceipts, receiptEmailStep, type BankRow } from './receipts.ts';
import { addedLines, logMoney, pruneLog } from './moneyLog.ts';
import { spendCat, spendReport, type SpendTx } from './spend.ts';
import { dateKind, mailDue, nextMailCheck, type MailCheck } from './model.ts';
import { apptEmailStep } from './appointments.ts';
import { allRows } from './rows.ts';
import { contactStep } from './contactFind.ts';
import { weekendFor } from './nearbyFind.ts';
import { driveText, fridayOf, milesText, type Spot } from './place.ts';
import type { Mail } from './google.ts';
import type { Appointment } from './model.ts';
import { emailText, pickAlerts, planEmail } from './emails.ts';

/**
 * 🔄 One automatic run for one person (every morning, or "Sync now"):
 * bank → find recurring bills → Gmail receipts → roll due dates → Google Calendar → heads-ups (+ email).
 * Each step is independent: one failing never stops the others. Free steps first; the AI only reads emails
 * that already look like bills (free check), within the daily limits.
 */
export interface RunLog { steps: string[]; errors: string[]; newAlerts: number }

type NewAlert = Omit<Alert, 'id' | 'seen' | 'created_at'> & { user_id: string };

/** Parts that can be run on their own (from the app's buttons). */
// 'mail' = the hourly email look (with the appointments): bank alert emails, bill emails, order emails, receipts and
// document attachments. Free checks first, so most hours cost nothing; the AI only within each step's per-run cap.
export type Part = 'bills' | 'online' | 'breaches' | 'lists' | 'week' | 'purchases' | 'appts' | 'calendar' | 'contacts' | 'vault' | 'mail' | 'weekend';

/** Step names whose result counts for the 📬 email-check status. */
const MAIL_STEPS = /^(Appointments|Bank alerts|Gmail|Returns & warranties|Vault|Receipts|Contacts)\b/;

/**
 * slot = the quarter-hour email look (cron, rounded call time): it reads Gmail only when that slot is due for this
 * person's 📬 Email checks setting (`mail.every`; Off = only the daily run).
 */
export async function syncUser(db: SupabaseClient, userId: string, email?: string, opts: { full?: boolean; only?: Part[]; force?: boolean; slot?: number } = {}): Promise<RunLog> {
  const s = await settingsOf(db, userId);
  const log: RunLog = { steps: [], errors: [], newAlerts: 0 };
  if (opts.slot != null && !mailDue(s.mail.every, opts.slot)) return log;
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

  // 📇 Emails the steps below read (appointments, bills, orders): also looked at for contacts, without reading them twice.
  const mails: Mail[] = [];
  // ✉️ Every Gmail step reads each mailbox in turn: the main Google account, then the extra ones switched on.
  const boxes = await mailBoxes(db, userId).catch(() => [] as Box[]);
  const each = async (name: string, f: (b: Box) => Promise<string | void>) => { for (const b of boxes) await step(boxName(name, b), () => f(b)); };
  // 📬 New emails read in this run (each step reads only emails it hasn't seen), for the email-check status.
  const read = new Set<string>();
  const tokens: string[] = [];
  if (want('mail')) for (const b of boxes) tokenOf(b).then((at) => { tokens.push(at); countReads(at, read); }).catch(() => undefined);
  // 📅 Appointments (also every hour on their own): straight into the (main account's) calendar.
  let apptChanges = 0;
  if (want('appts')) await each('Appointments', async (b) => { const r = await apptEmailStep(db, userId, s, alerts, until, mails, b); apptChanges += r.changed; return r.text; });
  // 🎉 Friday morning: this weekend's list near your zip (early in the run, so the long email reads can't crowd it out).
  if (want('weekend')) await step('This weekend', () => weekendStep(db, userId, s, alerts, opts.force));
  if (!want('bills') && (apptChanges || (opts.only?.includes('calendar')))) await step('Calendar', () => calendarStep(db, userId, s));
  if (want('bills')) {
    await step('Bank', () => bankStep(db, userId, s, opts.full));
    await each('Bank alerts', (b) => alertStep(db, userId, s, until, b));
    await step('Recurring', () => detectStep(db, userId, s, alerts));
    await each('Gmail', (b) => gmailStep(db, userId, s, alerts, until, b, mails));
    await step('Due dates', () => rollStep(db, userId));
    await step('Calendar', () => calendarStep(db, userId, s));
    await step('Heads-ups', () => headsUpStep(db, userId, s, alerts));
    await step('Money log', () => pruneLog(db, userId)); // 📜 kept 180 days
    await step('Whose mailbox', async () => mailboxStep(db, userId, await allBoxes(db, userId))); // 👥 older email finds learn their mailbox (once each)
  } else if (want('mail')) {
    await each('Bank alerts', (b) => alertStep(db, userId, s, until, b));
    await each('Gmail', (b) => gmailStep(db, userId, s, alerts, until, b, mails));
  }
  const mail = want('mail') || want('vault');
  // 🧾 Receipts the Vault once put in Returns move to Spending (once).
  if (want('bills') || mail) await step('Receipts moved', () => moveOldReceipts(db, userId));
  if (want('purchases') || want('mail')) await each('Returns & warranties', (b) => purchaseStep(db, userId, s, until, b, mails));
  // 📁 Important documents attached to emails → Vault (owner's choice: straight in); receipts → Spending, bills → Bills.
  if (want('bills') || mail) await each('Vault', (b) => vaultEmailStep(db, userId, s, alerts, until + 10_000, b));
  // 🧾 Plain receipt emails → Spending (free patterns first).
  if (want('bills') || mail) await each('Receipts', (b) => receiptEmailStep(db, userId, s, until + 10_000, b, mails));
  if (want('bills') || mail) await saveConnection(db, userId, 'receipts', null, { mailChecked: new Date().toISOString() }).catch(() => undefined);
  // 📇 Contacts: straight into Contacts (owner's choice). The hourly appointment look only folds in what it already read.
  if (want('contacts') || mails.length) await step('Contacts', () => contactStep(db, userId, s, until + 10_000, { mails, search: want('contacts'), email, boxes }));
  if (want('bills') || want('purchases')) await step('Coming up', () => lifeStep(db, userId, s, alerts));
  if (want('breaches')) await each('Data breaches', (b) => breachStep(db, userId, alerts, b));
  if (want('online')) await step('Your name online', async () => { await ensureBrokers(db, userId); return onlineStep(db, userId, s, alerts, opts.force); });
  if (want('lists')) {
    await each('Mailing lists', (b) => sweepStep(db, userId, s, until, b));
    await step('Unsubscribe', () => unsubStep(db, userId, s, until + 10_000, boxes));
  }
  // Each mailbox: when it was last looked at (and its first problem, shown under it in Settings → Google).
  if (want('bills') || mail || want('appts') || want('purchases')) {
    const now = new Date().toISOString();
    for (const b of boxes) {
      const err = b.main ? undefined : log.errors.find((e) => e.includes(`(${b.email ?? b.kind}):`));
      await saveState(db, userId, b, 'google', { lastScan: now, ...(b.main ? {} : { lastError: err?.slice(0, 200) ?? null }) }).catch(() => undefined);
    }
  }

  if (want('mail') && boxes.length) {
    for (const at of tokens) stopCounting(at);
    const lines = [...log.steps, ...log.errors].filter((x) => MAIL_STEPS.test(x));
    const errs = log.errors.filter((x) => MAIL_STEPS.test(x));
    const slow = lines.some((x) => /slow down|rate limit|quota/i.test(x)) ? 'stopped: Gmail asked to slow down'
      : errs.some((x) => /out of time/i.test(x)) ? 'stopped: out of time, the rest next check' : '';
    const at = opts.slot ?? Date.now();
    const next = nextMailCheck(s.mail.every, at);
    const check: MailCheck = {
      at: new Date(at).toISOString(), every: s.mail.every, next: next ? new Date(next).toISOString() : null,
      state: slow ? 'slow' : errs.length ? 'err' : 'ok',
      text: slow || (errs.length ? `problem: ${errs[0].replace(/^[^:]+:\s*/, '')}`.slice(0, 90) : read.size ? `${read.size} new` : 'nothing new'),
    };
    await saveConnection(db, userId, 'receipts', null, { mailCheck: check }).catch(() => undefined);
  }

  if (alerts.length) {
    // 👥 Whose mailbox each heads-up is about (chip in the app, "Roza:" in emails); names instead of addresses.
    await labelAlerts(db, userId, alerts, await allBoxes(db, userId).catch(() => boxes)).catch(() => undefined);
    const { data } = await db.from('alerts').upsert(alerts, { onConflict: 'user_id,kind,key', ignoreDuplicates: true }).select('title, body');
    log.newAlerts = data?.length ?? 0;
  }
  // 📊 "Send my week now" (a button): sent right away. The automatic ones go in the one email below.
  if (want('week') && email && opts.force && opts.only) await step('My week', () => weekStep(db, userId, email, s));
  // ✉️ At most one automatic email a day (or a week), only the kinds switched on (Settings → Emails to me).
  if (email && !opts.force) await step('Email', () => emailStep(db, userId, email, s, !opts.only));
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
      posted: iso(new Date(t.posted * 1000)), amount: Number(t.amount), description, merchant: merchantKey(description), source: 'bank' as const,
    };
  }));
  // 🧾 A purchase already in Spending from its receipt: merged into that line (counted once).
  const { rows: toAdd } = await mergeBankRows(db, userId, rows);
  await storeRows(db, userId, toAdd, s.spend.rules);
  await saveConnection(db, userId, 'simplefin', null, {
    lastSync: new Date().toISOString(), errors,
    accounts: accounts.map((a) => ({ name: `${a.org?.name ?? ''} ${a.name}`.trim(), balance: Number(a.balance), currency: a.currency })),
  });
  return `${rows.length} transactions from ${accounts.length} account(s)${errors.length ? ` (bank says: ${errors.join('; ')})` : ''}`;
}

/** New bank lines stored (a line already there is left alone), each new purchase written in 📜 Money → Log. */
export async function storeRows(db: SupabaseClient, userId: string, rows: BankRow[], rules: Record<string, string>): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await db.from('transactions').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,external_id', ignoreDuplicates: true }).select('id, posted, amount, description, merchant, item_id, source, account');
    if (error) throw new Error(error.message);
    await logMoney(db, userId, addedLines(data ?? [], rules));
  }
}

// ---------- 📧 bank alert emails (free: patterns, no AI) ----------
async function alertStep(db: SupabaseClient, userId: string, s: Settings, until: number, box: Box): Promise<string | void> {
  if (!s.bank.alerts) return;
  const c = { meta: await stateOf(db, userId, box, 'google') };
  const at = await tokenOf(box);
  const tag = boxTag(box);
  const seen = new Set((c.meta.seenAlerts as string[] | undefined) ?? []);
  // First time: as far back as your alerts go (400 days), spread over several runs so Gmail's per-minute limit isn't hit; then the last week.
  // A new kind of alert (ALERT_QUERY changed, e.g. PayPal added) looks back again once; emails already read are skipped.
  const done = !!c.meta.alertsDone && c.meta.alertsQuery === ALERT_QUERY;
  const all = (await findAlertEmails(at, done ? 7 : s.bank.lookbackDays, ALERT_QUERY, done ? 200 : 2000)).filter((id) => !seen.has(id));
  const ids = all.slice(0, PER_RUN);
  const rows: BankRow[] = [];
  let skipped = 0, stopped = '';
  const banks = new Set<string>();
  for (const id of ids) {
    if (Date.now() > until) { stopped = 'out of time: the rest next time'; break; }
    let m;
    try { m = await readEmail(at, id, tag); } catch (e) {
      if (!isRateLimit(e)) throw e;
      stopped = 'Gmail asked to slow down: the rest next time'; break;
    }
    seen.add(id);
    const tx = parseBankAlert(m);
    if (!tx) { skipped++; continue; }
    banks.add(tx.bank);
    rows.push({ user_id: userId, external_id: `mail:${id}`, account: tx.account, posted: tx.posted, amount: -tx.amount, description: tx.merchant, merchant: merchantKey(tx.merchant), source: 'alert', ...(tag ? { note: `From email (${tag})` } : {}), ...(box.email ? { details: { mailbox: box.email.toLowerCase() } } : {}) });
  }
  // ✉️ The same alert sent to two of your mailboxes: counted once.
  const { rows: fresh, twins } = await otherBoxTwins(db, userId, rows, tag);
  // 🧾 A purchase already in Spending from its receipt: merged into that line (counted once).
  const { rows: toAdd, merged } = await mergeBankRows(db, userId, fresh);
  await storeRows(db, userId, toAdd, s.spend.rules);
  const left = all.filter((id) => !seen.has(id)).length;
  await saveState(db, userId, box, 'google', {
    seenAlerts: [...seen].slice(-5000), alertsScanned: new Date().toISOString(), alertsDone: done || left === 0, alertsQuery: ALERT_QUERY,
    alertsRead: ((c.meta.alertsRead as number) ?? 0) + rows.length, alertBanks: [...new Set([...((c.meta.alertBanks as string[]) ?? []), ...banks])],
  });
  if (ids.length) return `${rows.length} purchase(s) read from ${ids.length} alert email(s)${twins ? ` (${twins} already read from your other mailbox)` : ''}${merged ? ` (${merged} matched a receipt already in Spending)` : ''}${banks.size ? ` (${[...banks].join(', ')})` : ''}${skipped ? `, ${skipped} not purchases` : ''}${left ? `; ${left} older ones next time` : ''}${stopped ? `. ${stopped}` : ''}`;
}
const PER_RUN = 300; // alert emails read per run (about 75 seconds)

/** Which mailbox an alert line came from: "From email (work@…)" in its note for an extra one, else the main one. */
const mailboxOf = (note: string | null | undefined) => note?.match(/^From email \(([^)]+)\)/)?.[1] ?? '';
/**
 * The same bank alert can reach two mailboxes (a forward, two addresses on the card): a line already read from ANOTHER
 * mailbox with the same amount, a similar shop and a date within 1 day is the same purchase. Two equal purchases in
 * the same mailbox stay two (two coffees on one day are real).
 */
async function otherBoxTwins(db: SupabaseClient, userId: string, rows: BankRow[], tag: string | undefined): Promise<{ rows: BankRow[]; twins: number }> {
  if (!rows.length) return { rows, twins: 0 };
  const days = rows.map((r) => r.posted).sort();
  const shift = (d: string, n: number) => iso(new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000));
  const { data } = await db.from('transactions').select('posted, amount, description, merchant, note').eq('user_id', userId).eq('source', 'alert')
    .gte('posted', shift(days[0], -1)).lte('posted', shift(days[days.length - 1], 1)).limit(5000);
  const mine = tag ?? '';
  const others = ((data ?? []) as { posted: string; amount: number; description: string | null; merchant: string | null; note: string | null }[]).filter((t) => mailboxOf(t.note) !== mine);
  if (!others.length) return { rows, twins: 0 };
  const near = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) <= 86400_000;
  const keep = rows.filter((r) => !others.some((t) => near(r.posted, t.posted) && sameSpend(r, t)));
  return { rows: keep, twins: rows.length - keep.length };
}

// ---------- 🔁 recurring bills in the transactions ----------
async function detectStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[]): Promise<string | void> {
  const since = iso(new Date(Date.now() - s.bank.lookbackDays * 86400_000));
  const txs = await allRows<{ posted: string; amount: number; description: string; merchant: string }>((a, b) => db.from('transactions').select('posted, amount, description, merchant').eq('user_id', userId).gte('posted', since).order('posted', { ascending: false }).order('external_id').range(a, b));
  if (!txs?.length) return;
  const found = findRecurring(txs as { posted: string; amount: number; description: string; merchant: string }[], s.bank.minCharges);
  const { data: items } = await db.from('items').select('*').eq('user_id', userId).neq('status', 'cancelled');
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
    // 🆕 New: added to Bills straight away (owner's choice: fully automatic), with a heads-up and an Undo (remembered).
    const res = await autoAddBill(db, userId, { source: 'bank', key: r.key, name: r.name, category: r.category, amount: r.amount, cycle: r.cycle, next_due: r.nextDue, merchant: r.key, evidence: { charges: r.charges } }, alerts, (items as Item[] | null) ?? undefined);
    if (res.added && res.itemId) {
      fresh++;
      await db.from('items').update({ last_charged: r.lastDate, last_amount: r.amount }).eq('id', res.itemId);
      await db.from('transactions').update({ item_id: res.itemId }).eq('user_id', userId).eq('merchant', r.key).is('item_id', null);
    }
  }
  return `${found.length} recurring payment(s): ${matched} matched to your bills, ${fresh} new added to Bills`;
}

// ---------- ✉️ Gmail receipts ----------
async function gmailStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[], until: number, box: Box, mails: Mail[] = []): Promise<string | void> {
  if (!s.gmail.on) return;
  const c = { meta: await stateOf(db, userId, box, 'google') };
  const at = await tokenOf(box);
  const tag = boxTag(box);
  // 👥 box = which mailbox (every one, for the person chip); mailbox = only the extra ones (said in the heads-up).
  const via = { ...(tag ? { mailbox: tag } : {}), ...(box.email ? { box: box.email, who: boxPerson(box)?.name } : {}) };
  const seen = new Set((c.meta.seenMail as string[] | undefined) ?? []);
  // Look back to the last run that read everything (first time: 60 days), so a run stopped by limits loses nothing.
  const last = c.meta.gmailDone as string | undefined;
  const since = last ? Math.ceil((Date.now() - Date.parse(last)) / 86400_000) + 1 : 60;
  const ids = (await findBillEmails(at, Math.min(60, Math.max(5, since)), s.gmail.plusTag)).filter((id) => !seen.has(id));
  const { data: items } = await db.from('items').select('*').eq('user_id', userId).neq('status', 'cancelled');
  let read = 0, bills = 0, skipped = 0;
  let stopped = '';
  // 🔁 "Your Auto Pay payment will be processed soon" notices: read for free (no AI), with their own list of emails done.
  const apSeen = new Set((c.meta.seenAutopay as string[] | undefined) ?? []);
  const apIds = (await findAlertEmails(at, 45, AUTOPAY_QUERY, 30)).filter((id) => !apSeen.has(id));
  for (const id of apIds) {
    if (Date.now() > until) break;
    let m;
    try { m = await readEmail(at, id, tag); } catch (e) { if (!isRateLimit(e)) throw e; break; }
    apSeen.add(id);
    const n = parseAutopay({ from: m.from, subject: m.subject, text: m.text, date: m.date });
    if (!n) continue;
    seen.add(id); // the AI never needs to read it
    bills++;
    const x: Extracted = {
      isBill: true, name: n.company, merchant: n.company, category: n.category, amount: n.amount, currency: 'USD', cycle: 'monthly', nextDue: n.due,
      endsOn: null, trialEnds: null, last4: n.last4, policyNumber: '', coverage: '', deductible: null, balance: null, rate: null,
      summary: `Auto Pay of ${money(n.amount)} on ${n.due}${n.last4 ? ` from the account ending ${n.last4}` : ''}.`, warnings: [],
    };
    const r = await applyExtracted(db, userId, x, 'email', `mail:${merchantKey(n.company)}`, { subject: m.subject, from: m.from, autopay: true, ...via }, (items as Item[]) ?? [], alerts);
    if (r.itemId) await db.from('items').update({ autopay: true }).eq('id', r.itemId).eq('user_id', userId);
  }
  for (const id of ids) {
    if (Date.now() > until) { stopped = 'out of time: the rest next time'; break; }
    let m;
    try { m = await readEmail(at, id, tag); } catch (e) {
      if (!isRateLimit(e)) throw e;
      stopped = 'Gmail asked to slow down: the rest next time'; break;
    }
    if (!looksLikeBill(m) || !s.ai.readEmails) { seen.add(id); skipped++; continue; }
    mails.push(m);
    if (read >= s.ai.maxPerRun) { stopped = 'the rest next time'; break; }
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
    await applyExtracted(db, userId, x, 'email', `mail:${merchantKey(x.merchant || x.name)}`, { subject: m.subject, from: m.from, ...via }, (items as Item[]) ?? [], alerts);
  }
  const now = new Date().toISOString();
  const done = !stopped && ids.every((id) => seen.has(id));
  await saveState(db, userId, box, 'google', { seenMail: [...seen].slice(-1000), seenAutopay: [...apSeen].slice(-500), gmailScanned: now, ...(done ? { gmailDone: now } : {}) });
  return `${ids.length} email(s) looked at: ${read} read by the AI, ${bills} bill(s), ${skipped} skipped for free${stopped ? `. Stopped: ${stopped}` : ''}`;
}

/**
 * What the AI found (email or document): updates the matching bill (new date, amount, renewal), or adds it to Bills by
 * itself (owner's choice: fully automatic) with a heads-up and an Undo in the Inbox.
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
    const box = item.source === 'email' && !item.details?.mailbox ? boxOfEvidence(evidence) : undefined; // 👥 an older bill learns its mailbox
    const details = { ...item.details, ...(box ? { mailbox: box } : {}), ...(x.policyNumber ? { policyNumber: x.policyNumber } : {}), ...(x.coverage ? { coverage: x.coverage } : {}), ...(x.deductible ? { deductible: x.deductible } : {}), ...(x.balance ? { balance: x.balance } : {}), ...(x.rate ? { rate: x.rate } : {}) };
    if (JSON.stringify(details) !== JSON.stringify(item.details)) patch.details = details;
    if (Object.keys(patch).length) await db.from('items').update(patch).eq('id', item.id);
    for (const w of x.warnings.slice(0, 2)) alerts.push({ user_id: userId, kind: 'renewal', key: `${item.id}:${w.slice(0, 60)}`, item_id: item.id, title: `${item.name}: ${w}`.slice(0, 200), body: null });
    return { itemId: item.id };
  }
  const r = await autoAddBill(db, userId, {
    source, key, name: x.name || x.merchant, category: x.category, amount: x.amount, currency: x.currency || 'USD', cycle: x.cycle,
    next_due: x.nextDue, ends_on: x.endsOn, trial_ends: x.trialEnds, merchant: merchantKey(x.merchant || x.name),
    details: { policyNumber: x.policyNumber || undefined, coverage: x.coverage || undefined, deductible: x.deductible ?? undefined, balance: x.balance ?? undefined, rate: x.rate ?? undefined, last4: x.last4 || undefined, ...(typeof evidence.documentId === 'string' ? { documentId: evidence.documentId } : {}) },
    evidence: { ...evidence, note: [x.summary, ...x.warnings].filter(Boolean).join(' ') },
  }, alerts, items);
  return { itemId: r.itemId, suggestionId: r.suggestionId };
}

const CYCLE_WORD: Record<string, string> = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', quarterly: 'every 3 months', semiannual: 'every 6 months', yearly: 'yearly', once: 'one time' };
const FROM: Record<string, string> = { bank: 'from your bank', email: 'from your email', document: 'from a document' };
/** 👥 "from Roza’s email": the person's name, never the address. */
const fromText = (b: Pick<FoundBill, 'source' | 'evidence'>) => {
  if (b.source !== 'email') return FROM[b.source];
  const box = typeof b.evidence.box === 'string' ? b.evidence.box : typeof b.evidence.mailbox === 'string' ? b.evidence.mailbox : '';
  const who = typeof b.evidence.who === 'string' && b.evidence.who ? b.evidence.who : box ? personOf(box, false).name : '';
  return who ? `from ${who}’s email` : FROM.email;
};
/** 👥 The mailbox (address) a find came from, kept on the bill itself (`details.mailbox`) so its chip never depends on old finds. */
const boxOfEvidence = (e: Record<string, unknown>) => (typeof e.box === 'string' && e.box ? e.box.toLowerCase() : typeof e.mailbox === 'string' && e.mailbox.includes('@') ? e.mailbox.toLowerCase() : undefined);

/**
 * 🆕 A bill found automatically (bank rhythm, a bill email, an uploaded or emailed bill document) goes straight into
 * Bills (owner's choice: fully automatic, no OK needed), with a heads-up "Added: Netflix $17.99 monthly — from your
 * bank". The `suggestions` row is the memory of what was added: status 'accepted' + item_id; Undo in the Inbox sets it
 * to 'ignored' and deletes the bill, so the same find never comes back. A bill the owner deleted (item_id gone) is not
 * added again either. Never pays, cancels or moves anything.
 */
export interface FoundBill {
  source: 'bank' | 'email' | 'document'; key: string; name: string; category: string | null; amount: number | null; currency?: string; cycle: string | null;
  next_due: string | null; ends_on?: string | null; trial_ends?: string | null; merchant: string | null; details?: Record<string, unknown>; evidence: Record<string, unknown>;
}
export async function autoAddBill(db: SupabaseClient, userId: string, b: FoundBill, alerts: NewAlert[], items?: Item[]): Promise<{ itemId?: string; suggestionId?: string; added: boolean }> {
  const { data: prev } = await db.from('suggestions').select('id, status, item_id').eq('user_id', userId).eq('source', b.source).eq('key', b.key).maybeSingle();
  if (prev && prev.status !== 'new') return { suggestionId: prev.id, itemId: prev.item_id ?? undefined, added: false }; // added before, or undone: never again
  const name = (b.name || b.merchant || 'Bill').trim().slice(0, 120) || 'Bill';
  const cycle = b.cycle && b.cycle in CYCLE_WORD ? b.cycle : 'monthly';
  const amount = Number(b.amount ?? 0) || 0;
  const details = Object.fromEntries(Object.entries({ ...b.details, ...(b.source === 'email' ? { mailbox: boxOfEvidence(b.evidence) } : {}) }).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const { data: item, error } = await db.from('items').insert({
    user_id: userId, name, category: b.category || 'other', amount, currency: b.currency || 'USD', cycle, next_due: b.next_due, ends_on: b.ends_on ?? null,
    trial_ends: b.trial_ends ?? null, merchant: b.merchant, details, source: b.source, autopay: b.source === 'bank',
  }).select('*').single();
  if (error || !item) throw new Error(`adding ${name}: ${error?.message ?? 'no row'}`);
  items?.push(item as Item);
  const { data: sug } = await db.from('suggestions').upsert({
    user_id: userId, key: b.key, source: b.source, name, category: b.category, amount: b.amount, currency: b.currency || 'USD', cycle, next_due: b.next_due,
    ends_on: b.ends_on ?? null, trial_ends: b.trial_ends ?? null, merchant: b.merchant, details, evidence: { ...b.evidence, auto: true }, status: 'accepted', item_id: item.id,
  }, { onConflict: 'user_id,source,key' }).select('id').single();
  await logMoney(db, userId, [{ kind: 'bill', ref: item.id, data: { item: item.id, source: b.source }, text: `bill ${name}${amount ? ` ${money(amount)}` : ''} ${CYCLE_WORD[cycle]} auto-added — ${fromText(b)}` }]);
  alerts.push({ user_id: userId, kind: 'found', key: `${b.source}:${b.key}`, item_id: item.id, title: `Added: ${name}${amount ? ` ${money(amount)}` : ''} ${CYCLE_WORD[cycle]} — ${fromText(b)}`.slice(0, 200), body: 'Added to your bills by itself. Not a bill, or wrong? Tap Undo in the 🔔 Inbox (it won’t come back), or open it in Money → Bills to change it.' });
  return { itemId: item.id, suggestionId: sug?.id, added: true };
}


// ---------- 📆 due dates roll forward ----------
async function rollStep(db: SupabaseClient, userId: string): Promise<string | void> {
  const { data } = await db.from('items').select('id, next_due, cycle, details').eq('user_id', userId).eq('status', 'active').lt('next_due', today()).neq('cycle', 'once');
  for (const i of (data as Item[]) ?? []) {
    // Keep the real day of a bill due on the 29th–31st, so a short month doesn't move it for good.
    const want = dueDayOf(i);
    const details = want && want >= 29 && i.details?.dueDay !== want ? { ...i.details, dueDay: want } : i.details;
    await db.from('items').update({ next_due: nextDue(i), details }).eq('id', i.id);
  }
  if (data?.length) return `${data.length} due date(s) moved to the next one`;
}

// ---------- 📅 Google Calendar ----------
export async function calendarStep(db: SupabaseClient, userId: string, s: Settings): Promise<string | void> {
  const c = await connection(db, userId, 'google');
  if (!c || !s.calendar.on || !has(c.meta.scope as string, 'calendar')) return;
  const at = await refresh(await open(c.secret));
  const calendarId = await ensureCalendar(at, c.meta.calendarId as string | undefined);
  if (calendarId !== c.meta.calendarId) await saveConnection(db, userId, 'google', null, { calendarId });
  const { data: items } = await db.from('items').select('*').eq('user_id', userId);
  const { data: papers } = s.papers.on ? await db.from('papers').select('*').eq('user_id', userId) : { data: [] };
  const { data: dates } = await db.from('life_dates').select('*').eq('user_id', userId);
  const { data: appts } = await db.from('appointments').select('*').eq('user_id', userId).eq('status', 'booked').gte('day', iso(new Date(Date.now() - 400 * 86400_000))).limit(3000);
  const r = await syncCalendar(at, calendarId, (items as Item[]) ?? [], s, env('SITE_URL'), (papers as Paper[]) ?? [], (dates as LifeDate[]) ?? [], (appts as Appointment[]) ?? []);
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
      if (p.remind === false) continue;
      const left = daysBetween(t, p.expires!);
      const due = p.due_kind === 'due'; // 📁 a next vaccine, a check-up: heads-ups from 30 days before, not 90
      const who = p.holder ? ` (${p.holder})` : '';
      const at = [...s.papers.remind].filter((d) => !due || d <= 30).sort((a, b) => a - b).find((d) => left <= d);
      if (left < 0) {
        if (left >= -60) { alerts.push({ user_id: userId, kind: 'paper', key: `${p.id}:${p.expires}:expired`, item_id: null, title: `${docIcon(p)} ${p.name}${who} ${due ? 'was due' : 'has expired'} (${p.expires})`, body: due ? 'Done already? Put the next date on it in Vault.' : 'Renew it, or update it in Vault if you already did.' }); n++; }
      } else if (at != null) { alerts.push({ user_id: userId, kind: 'paper', key: `${p.id}:${p.expires}:${at}`, item_id: null, title: `${docIcon(p)} ${p.name}${who} ${due ? 'is due' : 'expires'} ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`} (${p.expires})`, body: due ? 'Book it now. The record is in your Vault.' : paperKind(p.kind).renew ? `Renew: ${paperKind(p.kind).renew}` : 'Time to renew it.' }); n++; }
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

// ---------- 🎂 important dates, 🧾 returns & warranties, 💸 budgets ----------
async function lifeStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[]): Promise<string | void> {
  const t = today();
  let n = 0;
  // Dates that passed move to their next time (every year, every 6 months…); one-time ones stay as they are.
  const { data: dates } = await db.from('life_dates').select('*').eq('user_id', userId);
  for (const d of (dates as LifeDate[]) ?? []) {
    let next = d.next_date;
    if (next < t && d.every_months) {
      for (let k = 1; k <= 500 && next < t; k++) next = addCycle(d.next_date, 'monthly', d.every_months * k); // from the original day: the 31st stays the 31st
      await db.from('life_dates').update({ next_date: next }).eq('id', d.id);
    }
    const left = daysBetween(t, next);
    if (left >= 0 && left <= d.remind_days) { alerts.push({ user_id: userId, kind: 'date', key: `${d.id}:${next}`, item_id: null, title: `${dateKind(d.kind).icon} ${d.title}: ${left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days (${next})`}`, body: d.notes }); n++; }
  }
  n += await purchaseAlerts(db, userId, alerts);
  // Budgets: a heads-up at the warning level (80% by default) and when it's used up.
  if (Object.keys(s.spend.budgets).length) {
    const month = t.slice(0, 7);
    const tx = await allRows<SpendTx>((a, b) => db.from('transactions').select('posted, amount, description, merchant, item_id').eq('user_id', userId).gte('posted', `${month}-01`).order('posted', { ascending: false }).order('external_id').range(a, b), 5000);
    const r = spendReport((tx as SpendTx[]) ?? [], s.spend.rules, month);
    for (const [cat, budget] of Object.entries(s.spend.budgets)) {
      if (!(budget > 0)) continue;
      const spent = r.byCat.find((c) => c.id === cat)?.amount ?? 0;
      const level = spent >= budget ? 100 : spent >= budget * s.spend.alertAt ? Math.round(s.spend.alertAt * 100) : 0;
      if (level) { alerts.push({ user_id: userId, kind: 'budget', key: `${cat}:${month}:${level}`, item_id: null, title: `${spendCat(cat).icon} ${spendCat(cat).label}: ${money(spent)} of your ${money(budget)} budget${level === 100 ? ' (used up)' : ''}`, body: `${daysBetween(t, iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1))))} days left this month.` }); n++; }
    }
  }
  if (n) return `${n} heads-up(s)`;
}

// ---------- 🎉 This weekend (Friday morning, your time zone; Saturday too if Friday's run missed it) ----------
async function weekendStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[], force?: boolean): Promise<string | void> {
  if (!s.place.weekend && !force) return;
  const t = todayIn(s.appts.timeZone || 'America/New_York');
  const dow = new Date(`${t}T12:00:00Z`).getUTCDay();
  if (!force && dow !== 5 && dow !== 6) return;
  const { w, made } = await weekendFor(db, userId, s, fridayOf(t));
  if (!made) return force ? 'this weekend’s list is already made' : undefined;
  const all = [...w.events, ...w.near, ...w.far];
  if (!all.length) return 'nothing found near your zip this time';
  // The heads-up (on Home, and in the morning email): every idea with its miles and drive time.
  const line = (x: Spot) => `• ${x.name}${x.when ? ` (${x.when})` : ''}: ${milesText(x.miles)}, ${driveText(x)}`;
  const body = [
    w.events.length && `Events:\n${w.events.map(line).join('\n')}`,
    w.near.length && `Close by:\n${w.near.map(line).join('\n')}`,
    w.far.length && `A bit farther:\n${w.far.map(line).join('\n')}`,
  ].filter(Boolean).join('\n');
  alerts.push({ user_id: userId, kind: 'nearby', key: `weekend:${w.home.zip}:${w.friday}`, item_id: null, title: `🎉 This weekend near ${w.home.town}: ${all.length} ideas`, body: body.slice(0, 3000) });
  return `${all.length} ideas for this weekend`;
}

// ---------- 📊 My week (the same summary as on Home) ----------
async function weekLines(db: SupabaseClient, userId: string, s: Settings): Promise<{ icon: string; text: string }[]> {
  const t = today();
  const since = iso(new Date(Date.now() - 63 * 86400_000));
  const [items, findings, senders, papers, tx, dates, purchases] = await Promise.all([
    db.from('items').select('*').eq('user_id', userId),
    db.from('findings').select('*').eq('user_id', userId).neq('status', 'unknown'),
    db.from('senders').select('*').eq('user_id', userId).eq('status', 'unsubscribed'),
    db.from('papers').select('*').eq('user_id', userId),
    allRows<{ posted: string; amount: number; description: string | null; merchant: string | null; item_id: string | null }>((a, b) => db.from('transactions').select('posted, amount, description, merchant, item_id').eq('user_id', userId).gte('posted', since).order('posted', { ascending: false }).order('external_id').range(a, b)).then((data) => ({ data })),
    db.from('life_dates').select('*').eq('user_id', userId),
    db.from('purchases').select('*').eq('user_id', userId).eq('status', 'keep'),
  ]);
  return weekSummary({ items: (items.data as Item[]) ?? [], findings: (findings.data as Finding[]) ?? [], senders: (senders.data as Sender[]) ?? [], papers: s.papers.on ? (papers.data as Paper[]) ?? [] : [], settings: s, spent: spentOf(tx.data ?? [], t, s.spend.rules), dates: (dates.data as LifeDate[]) ?? [], purchases: (purchases.data ?? []) as WeekInput['purchases'] }, t);
}

/** "✉️ Send my week now": right away (the owner asked for it). */
async function weekStep(db: SupabaseClient, userId: string, email: string, s: Settings): Promise<string | void> {
  const t = today();
  const lines = await weekLines(db, userId, s);
  const r = await sendEmail(email, `LifeTracker: your week (${t})`, ['Your week, in short:', '', ...lines.map((l) => `${l.icon} ${l.text}`)].join('\n'));
  if (r.startsWith('sent')) await saveConnection(db, userId, 'me', null, { weekSent: t });
  return r;
}

/**
 * ✉️ The one automatic email (Resend: RESEND_API_KEY, RESEND_FROM): `planEmail` decides if one may go now (on/off,
 * a day / a week / only important / never, max 1 a day), then the unseen heads-ups of the kinds switched on since the
 * last email, plus "My week" on its day. Last sent kept in the `emails` connection row (server only).
 */
async function emailStep(db: SupabaseClient, userId: string, email: string, s: Settings, full: boolean): Promise<string | void> {
  const meta = (await connection(db, userId, 'emails'))?.meta ?? {};
  const plan = planEmail(s, { now: Date.now(), tz: s.appts.timeZone || 'America/New_York', lastSent: (meta.lastSent as string | undefined) ?? null, full });
  if (!plan.send) return;
  const { data } = await db.from('alerts').select('kind, title, body, seen, mailbox').eq('user_id', userId).eq('seen', false).gt('created_at', plan.since).order('created_at').limit(300);
  const people = boxPeople(await allBoxes(db, userId).catch(() => [] as Box[]));
  // 👥 "Roza: …" / "Anis: …" on lines found in a mailbox; never an address.
  const list = pickAlerts(s, plan, (data ?? []) as { kind: Alert['kind']; title: string; body: string | null; seen: boolean; mailbox?: string | null }[]).slice(0, 40)
    .map((a) => ({ ...a, title: `${a.mailbox ? `${personOfBox(a.mailbox, people)?.name}: ` : ''}${nameAddresses(a.title, people)}`, body: a.body ? nameAddresses(a.body, people) : a.body }));
  const week = plan.week ? await weekLines(db, userId, s) : [];
  if (!list.length && !week.length) return;
  const m = emailText(list, week, plan, env('SITE_URL'));
  const r = await sendEmail(email, m.subject, m.body);
  if (r.startsWith('sent')) {
    const now = new Date().toISOString();
    await saveConnection(db, userId, 'emails', null, { lastSent: now, lastSubject: m.subject, lastCount: list.length });
    if (week.length) await saveConnection(db, userId, 'me', null, { weekSent: today() });
  }
  return r;
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

