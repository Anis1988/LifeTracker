import { matchContact } from '../../supabase/functions/_shared/contacts.ts';
import { matchDoc } from '../../supabase/functions/_shared/vaultText.ts';
import { matchSpend } from '../../supabase/functions/_shared/receiptText.ts';
import { categorize, spendCat, type SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { money } from '../../supabase/functions/_shared/money.ts';
import type { ListPlace } from '../../supabase/functions/_shared/myList.ts';
import type { Appointment, Contact, Item, Paper } from '../../supabase/functions/_shared/model.ts';
import { SETTINGS_INDEX } from '../components/SettingsGrid';
import { hrefTo } from './nav';

/**
 * 🔎 One search over everything already on this phone (no AI, no server): bills, spending, contacts, My list,
 * Vault documents (only while the Vault is open), appointments and the Settings sections.
 */
export type HitKind = 'bill' | 'spend' | 'contact' | 'place' | 'doc' | 'appt' | 'setting';
export interface Hit { kind: HitKind; id: string; icon: string; title: string; sub: string; href: string }
export interface HitGroup { kind: HitKind; label: string; hits: Hit[]; more: number }
export interface SearchData {
  items: Item[]; tx: SpendTx[]; contacts: Contact[]; places: ListPlace[]; papers: Paper[]; appts: Appointment[];
  rules: Record<string, string>;
}

export const HIT_LABELS: Record<HitKind, string> = {
  bill: '📋 Bills', spend: '💸 Spending', contact: '📇 Contacts', place: '📌 My list', doc: '📁 Vault', appt: '📅 Appointments', setting: '⚙️ Settings',
};

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const has = (hay: (string | null | undefined)[], q: string) => {
  const h = fold(hay.filter(Boolean).join(' '));
  return fold(q).split(/\s+/).filter(Boolean).every((w) => h.includes(w));
};
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function searchAll(d: SearchData, q: string, o: { vaultOpen: boolean; max?: number } = { vaultOpen: true }): HitGroup[] {
  const query = q.trim();
  if (query.length < 2) return [];
  const max = o.max ?? 5;
  const all: Hit[][] = [
    d.items.filter((i) => has([i.name, i.merchant, i.notes, i.category, i.account], query)).map((i) => ({
      kind: 'bill', id: i.id, icon: i.status === 'cancelled' ? '✂️' : '📋', title: i.name,
      sub: `${money(Number(i.amount))} ${i.cycle}${i.status === 'cancelled' ? ' · cancelled' : i.next_due ? ` · next ${day(i.next_due)}` : ''}`,
      href: hrefTo('money', 'bills', `?item=${i.id}`),
    })),
    d.tx.filter((t) => t.id && Number(t.amount) < 0 && matchSpend(t, query, spendCat(categorize(t, d.rules)).label)).sort((a, b) => b.posted.localeCompare(a.posted)).map((t) => ({
      kind: 'spend', id: t.id!, icon: t.receipt_path ? '🧾' : '💳', title: t.details?.store || t.description || t.merchant || 'Purchase',
      sub: `${money(-Number(t.amount))} · ${day(t.posted)}${t.receipt_path ? ' · receipt' : ''}`,
      href: hrefTo('money', 'spending', `?tx=${t.id}`),
    })),
    d.contacts.filter((c) => c.status === 'active' && matchContact(c, query)).map((c) => ({
      kind: 'contact', id: c.id, icon: c.favorite ? '★' : '📇', title: c.name,
      sub: [c.person, c.phones?.[0], c.address].filter(Boolean).join(' · ') || c.description || c.kind,
      href: hrefTo('places', 'contacts', `?c=${c.id}`),
    })),
    d.places.filter((p) => has([p.name, p.address, p.note, p.kind, p.about, p.when_text], query)).map((p) => ({
      kind: 'place', id: p.id, icon: p.done ? '✓' : '📌', title: p.name,
      sub: [p.address, p.miles != null ? `${p.miles.toFixed(1)} mi` : '', p.done ? 'been there' : ''].filter(Boolean).join(' · '),
      href: hrefTo('places', 'list', `?p=${p.id}`),
    })),
    o.vaultOpen ? d.papers.filter((p) => matchDoc(p, query)).map((p) => ({
      kind: 'doc', id: p.id, icon: '📁', title: p.name,
      sub: [p.holder, p.expires ? `${p.due_kind === 'due' ? 'due' : 'expires'} ${day(p.expires)}` : ''].filter(Boolean).join(' · ') || p.folder,
      href: hrefTo('me', 'vault', `?doc=${p.id}`),
    })) : [],
    d.appts.filter((a) => a.status === 'booked' && has([a.title, a.place, a.with_who, a.notes, a.kind], query)).map((a) => ({
      kind: 'appt', id: a.id, icon: '📅', title: a.title,
      sub: [`${day(a.day)}${a.time ? `, ${a.time}` : ''}`, a.place ?? a.with_who].filter(Boolean).join(' · '),
      href: `#/home?appt=${a.id}`,
    })),
    Object.values(SETTINGS_INDEX).filter((x) => has([x.title, x.words], query)).map((x) => ({
      kind: 'setting', id: x.id, icon: x.icon, title: x.title, sub: 'Settings',
      href: x.id === 'guide' ? '#/guide' : x.id === 'apps' ? './apps.html' : hrefTo('me', 'settings', `/${x.id}`),
    })),
  ] as Hit[][];
  return all.filter((h) => h.length).map((h) => ({ kind: h[0].kind, label: HIT_LABELS[h[0].kind], hits: h.slice(0, max), more: Math.max(0, h.length - max) }));
}

/**
 * 💬 Ask can open things: "open my lease", "show Example Dental", "where is my passport?" → the best local match
 * (same search, nothing sent anywhere). Null when the question isn't a "show me" one or nothing matches.
 */
export function navTarget(d: SearchData, question: string, vaultOpen: boolean): Hit | null {
  const m = question.trim().match(/^(?:please\s+)?(?:show(?:\s+me)?|open|go to|take me to|where(?:'s|’s| is| are| did i (?:put|save))|pull up)\s+(.+?)[?.!\s]*$/i);
  if (!m) return null;
  const what = m[1].replace(/^(?:my|the|our|a|an)\s+/i, '').replace(/\s+(?:card|contact|document|doc|file|bill|page)$/i, '').trim();
  if (what.length < 2) return null;
  // "how much…" style questions never start with these verbs, so anything here is a "show me" ask.
  const groups = searchAll(d, what, { vaultOpen, max: 1 }).filter((g) => g.kind !== 'setting' && g.kind !== 'spend');
  const order: HitKind[] = ['contact', 'doc', 'place', 'bill', 'appt'];
  for (const k of order) { const g = groups.find((x) => x.kind === k); if (g) return g.hits[0]; }
  return null;
}
