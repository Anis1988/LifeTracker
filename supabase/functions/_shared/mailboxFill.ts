import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { Alert } from './model.ts';
import { boxPeople, type Box } from './mailbox.ts';
import { mailboxOf, nameAddresses, type MailSrc } from './mailPeople.ts';
import { sameName } from './contacts.ts';

/**
 * 👥 Whose mailbox (owner's request: "label EVERYTHING with Roza or Anis, everywhere"). Every row found in email keeps
 * the Gmail address it came from on itself: bills and Spending lines in `details.mailbox`, appointments, Vault
 * documents, Returns, contacts and heads-ups in their `mailbox` column. New rows get it when they are added; older ones
 * get it here, once (only rows still without one are looked at, so running it again changes nothing). An email find
 * that names no mailbox came from the main Google account (the only one there was before extra mailboxes).
 * Server writes only; Row Level Security unchanged.
 */
type NewAlert = Omit<Alert, 'id' | 'seen' | 'created_at'> & { user_id: string };
const LIMIT = 1000;

const mainOf = (boxes: Box[]) => boxes.find((b) => b.main)?.email?.toLowerCase() ?? null;
/** An address, or the main mailbox's address for 'main', or null (not from email / unknown). */
const resolve = (r: MailSrc, main: string | null) => { const b = mailboxOf(r); return b === 'main' ? main : b; };

/** Heads-ups about email finds: names instead of addresses in the words, and the mailbox they're about. */
export async function labelAlerts(db: SupabaseClient, userId: string, alerts: NewAlert[], boxes: Box[]): Promise<void> {
  const people = boxPeople(boxes), main = mainOf(boxes);
  for (const a of alerts) { a.title = nameAddresses(a.title, people).slice(0, 200); if (a.body) a.body = nameAddresses(a.body, people); }
  const ids = (k: (a: NewAlert) => string | null) => [...new Set(alerts.map(k).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/.test(x)))];
  const head = (a: NewAlert) => a.key.split(':')[0];
  const itemIds = ids((a) => a.item_id);
  const apptIds = ids((a) => (a.kind === 'appt' ? head(a) : null));
  const paperIds = ids((a) => (a.kind === 'paper' ? head(a) : null));
  const buyIds = ids((a) => (a.kind === 'return' || a.kind === 'warranty' ? head(a) : null));
  const [items, appts, papers, buys] = await Promise.all([
    itemIds.length ? db.from('items').select('id, source, details').eq('user_id', userId).in('id', itemIds) : { data: [] },
    apptIds.length ? db.from('appointments').select('id, source, source_from, mailbox').eq('user_id', userId).in('id', apptIds) : { data: [] },
    paperIds.length ? db.from('papers').select('id, source, notes, mailbox').eq('user_id', userId).in('id', paperIds) : { data: [] },
    buyIds.length ? db.from('purchases').select('id, key, notes, mailbox').eq('user_id', userId).in('id', buyIds) : { data: [] },
  ]);
  const by = (rows: unknown) => new Map(((rows ?? []) as (MailSrc & { id: string })[]).map((r) => [r.id, r]));
  const mItems = by(items.data), mAppts = by(appts.data), mPapers = by(papers.data), mBuys = by(buys.data);
  for (const a of alerts) {
    let r: MailSrc | undefined;
    if (a.item_id) r = mItems.get(a.item_id);
    else if (a.kind === 'appt') r = mAppts.get(head(a));
    else if (a.kind === 'paper') r = mPapers.get(head(a));
    else if (a.kind === 'return' || a.kind === 'warranty') r = mBuys.get(head(a));
    else if (a.kind === 'vault' && a.key.startsWith('mail:')) {
      const { data } = await db.from('papers').select('source, notes, mailbox').eq('user_id', userId).like('source_key', `mail:${a.key.split(':')[1]}:%`).limit(1);
      r = (data?.[0] as MailSrc | undefined) ?? { source: 'email' };
    }
    const box = r ? resolve(r, main) : null;
    if (box) a.mailbox = box;
  }
}

/** The one-time fill for older rows (daily run). Returns a short line for the run log when something changed. */
export async function mailboxStep(db: SupabaseClient, userId: string, boxes: Box[]): Promise<string | void> {
  const main = mainOf(boxes);
  if (!boxes.length) return;
  let n = 0;

  // 🧾 Bills found in email: the bill email's own record (suggestions evidence) says which mailbox.
  const { data: items } = await db.from('items').select('id, source, details').eq('user_id', userId).eq('source', 'email').is('details->>mailbox', null).limit(LIMIT);
  if (items?.length) {
    const { data: sugs } = await db.from('suggestions').select('item_id, evidence').eq('user_id', userId).in('item_id', items.map((i) => i.id));
    for (const i of items as { id: string; details: Record<string, unknown> | null }[]) {
      const ev = ((sugs ?? []) as { item_id: string; evidence: object }[]).filter((x) => x.item_id === i.id).map((x) => resolve({ source: 'email', evidence: x.evidence }, null)).find((b) => b && b !== 'main');
      const box = ev ?? main;
      if (!box) continue;
      await db.from('items').update({ details: { ...(i.details ?? {}), mailbox: box } }).eq('id', i.id).eq('user_id', userId);
      n++;
    }
  }

  // 💸 Spending lines from email (receipts, bank alert emails).
  const { data: tx } = await db.from('transactions').select('id, source, note, receipt_path, details').eq('user_id', userId)
    .or('source.eq.alert,receipt_path.like.gmail:*,note.like.From email*').is('details->>mailbox', null).limit(LIMIT);
  for (const t of (tx ?? []) as (MailSrc & { id: string; details: Record<string, unknown> | null })[]) {
    const box = resolve(t, main);
    if (!box) continue;
    await db.from('transactions').update({ details: { ...(t.details ?? {}), mailbox: box } }).eq('id', t.id).eq('user_id', userId);
    n++;
  }

  // 📅 Appointments, 📁 Vault documents and 🧾 Returns found in email.
  const sets: { table: 'appointments' | 'papers' | 'purchases'; cols: string; where: [string, string] }[] = [
    { table: 'appointments', cols: 'id, source, source_from, mailbox', where: ['source', 'email'] },
    { table: 'papers', cols: 'id, source, notes, mailbox', where: ['source', 'email'] },
    { table: 'purchases', cols: 'id, key, notes, mailbox', where: ['key', 'mail:%'] },
  ];
  for (const s of sets) {
    const base = db.from(s.table).select(s.cols).eq('user_id', userId).is('mailbox', null);
    const { data } = await (s.where[1].endsWith('%') ? base.like(s.where[0], s.where[1]) : base.eq(s.where[0], s.where[1])).limit(LIMIT);
    for (const r of ((data ?? []) as unknown as (MailSrc & { id: string })[])) {
      const box = resolve(s.table === 'purchases' ? { ...r, source: 'email' } : r, main);
      if (!box) continue;
      await db.from(s.table).update({ mailbox: box }).eq('id', r.id).eq('user_id', userId);
      n++;
    }
  }

  // 📇 Contacts found automatically: the appointment / bill / purchase they came from, else (an email) the main mailbox.
  const { data: cs } = await db.from('contacts').select('id, name, sources').eq('user_id', userId).is('mailbox', null).not('sources', 'cs', '{hand}').limit(LIMIT);
  const auto = ((cs ?? []) as { id: string; name: string; sources: string[] }[]).filter((c) => c.sources.some((x) => x !== 'hand'));
  if (auto.length) {
    const [{ data: ap }, { data: it }, { data: pu }] = await Promise.all([
      db.from('appointments').select('with_who, mailbox').eq('user_id', userId).not('mailbox', 'is', null).limit(3000),
      db.from('items').select('name, details').eq('user_id', userId).not('details->>mailbox', 'is', null).limit(3000),
      db.from('purchases').select('store, mailbox').eq('user_id', userId).not('mailbox', 'is', null).limit(3000),
    ]);
    for (const c of auto) {
      const box = (c.sources.includes('appt') ? ((ap ?? []) as { with_who: string | null; mailbox: string }[]).find((a) => sameName(a.with_who, c.name))?.mailbox : undefined)
        ?? (c.sources.includes('bill') ? (((it ?? []) as { name: string; details: { mailbox?: string } }[]).find((i) => sameName(i.name, c.name))?.details.mailbox) : undefined)
        ?? (c.sources.includes('purchase') ? ((pu ?? []) as { store: string; mailbox: string }[]).find((p) => sameName(p.store, c.name))?.mailbox : undefined)
        ?? (c.sources.includes('email') ? main : null);
      if (!box) continue;
      await db.from('contacts').update({ mailbox: box }).eq('id', c.id).eq('user_id', userId);
      n++;
    }
  }
  if (n) return `${n} older email find(s) now say whose mailbox`;
}
