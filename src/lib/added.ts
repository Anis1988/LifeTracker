import { CYCLES, apptKind, catOf, contactKind, folderOf, type Appointment, type Contact, type Item, type Paper, type Suggestion } from '../../supabase/functions/_shared/model.ts';
import type { SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { money } from '../../supabase/functions/_shared/money.ts';
import { docIcon } from '../../supabase/functions/_shared/vaultText.ts';

/**
 * 🆕 "What was added" (the 🔔 Inbox): everything LifeTracker added by itself lately (owner's choice: fully automatic,
 * nothing waits for an OK), newest first, each with an Undo: bills (bank, bill emails, bill documents), receipts from
 * emails, Vault documents from emails, contacts and appointments. Built on the device from data already loaded.
 */
export type AddedKind = 'bill' | 'receipt' | 'doc' | 'contact' | 'appt';
export interface AddedEntry { key: string; kind: AddedKind; id: string; icon: string; title: string; sub: string; where: string; at: string }
export interface AddedInput { items: Item[]; added: Suggestion[]; tx: SpendTx[]; papers: Paper[]; contacts: Contact[]; appts: Appointment[] }

const FROM: Record<string, string> = { bank: 'from your bank', email: 'from an email', document: 'from a document' };
const CONTACT_FROM: Record<string, string> = { email: 'from your emails', appt: 'from an appointment', bill: 'from a bill', purchase: 'from a purchase' };
const cycleWord = (c: string) => CYCLES.find((x) => x.id === c)?.label.toLowerCase() ?? '';

export function addedFeed(d: AddedInput, days = 30, now = Date.now()): AddedEntry[] {
  const since = now - days * 86400_000;
  const recent = (at: string | null | undefined) => !!at && Date.parse(at) >= since;
  const out: AddedEntry[] = [];
  for (const s of d.added) {
    const i = d.items.find((x) => x.id === s.item_id);
    const at = s.updated_at ?? s.created_at;
    if (!i || !recent(at)) continue;
    out.push({ key: `bill:${s.id}`, kind: 'bill', id: s.id, icon: catOf(i.category).icon, title: i.name, sub: `${money(Number(i.amount))} ${cycleWord(i.cycle)} · ${FROM[s.source] ?? 'found for you'}`, where: 'Money → Bills', at });
  }
  for (const t of d.tx) {
    if (!t.id || !t.receipt_path || !t.note?.startsWith('From email')) continue;
    const at = t.created_at ?? `${t.posted}T12:00:00Z`;
    if (!recent(at)) continue;
    out.push({ key: `receipt:${t.id}`, kind: 'receipt', id: t.id, icon: '🧾', title: t.details?.store || t.description || 'Receipt', sub: `${money(Math.abs(Number(t.amount)))} · receipt from an email${t.source !== 'receipt' ? ' · matched to your bank' : ''}`, where: 'Money → Spending', at });
  }
  for (const p of d.papers) {
    if (p.source !== 'email' || !recent(p.created_at)) continue;
    out.push({ key: `doc:${p.id}`, kind: 'doc', id: p.id, icon: docIcon(p), title: p.name, sub: `${folderOf(p.folder).label}${p.holder ? ` · ${p.holder}` : ''} · from an email`, where: 'Vault', at: p.created_at! });
  }
  for (const c of d.contacts) {
    if (c.status !== 'active' || c.sources.includes('hand') || !recent(c.created_at)) continue;
    const k = contactKind(c.kind);
    out.push({ key: `contact:${c.id}`, kind: 'contact', id: c.id, icon: k.icon, title: c.name, sub: `${k.label} · ${CONTACT_FROM[c.sources[0]] ?? 'found for you'}`, where: 'Contacts', at: c.created_at! });
  }
  for (const a of d.appts) {
    if (a.source === 'hand' || a.status !== 'booked' || !recent(a.created_at)) continue;
    const when = new Date(`${a.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    out.push({ key: `appt:${a.id}`, kind: 'appt', id: a.id, icon: apptKind(a.kind).icon, title: a.title, sub: `${when}${a.time ? `, ${fmtTime(a.time)}` : ''} · from ${a.source === 'text' ? 'a text' : 'an email'}`, where: 'Calendar', at: a.created_at! });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

/** "Today", "This week", "Earlier": the feed's groups. */
export function feedGroups(list: AddedEntry[], now = Date.now()): { title: string; list: AddedEntry[] }[] {
  const day = new Date(now).toLocaleDateString('en-CA');
  const week = now - 7 * 86400_000;
  const g = [
    { title: 'Today', list: list.filter((e) => new Date(e.at).toLocaleDateString('en-CA') === day) },
    { title: 'This week', list: list.filter((e) => new Date(e.at).toLocaleDateString('en-CA') !== day && Date.parse(e.at) >= week) },
    { title: 'Earlier', list: list.filter((e) => Date.parse(e.at) < week) },
  ];
  return g.filter((x) => x.list.length);
}

/** The bell's number: what was added since the Inbox was last opened on this device (first time: the last 2 days). */
const SEEN = 'lt.inboxSeen';
export function seenAt(): number {
  try { const v = Number(localStorage.getItem(SEEN)); return v > 0 ? v : Date.now() - 2 * 86400_000; } catch { return Date.now() - 2 * 86400_000; }
}
export function markSeen() { try { localStorage.setItem(SEEN, String(Date.now())); } catch { /* private mode */ } }
export const unseen = (list: AddedEntry[], since = seenAt()) => list.filter((e) => Date.parse(e.at) > since).length;
