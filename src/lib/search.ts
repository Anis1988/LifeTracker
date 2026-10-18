import { categorize, spendCat, type SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { money } from '../../supabase/functions/_shared/money.ts';
import { docIcon } from '../../supabase/functions/_shared/vaultText.ts';
import { paperKind } from '../../supabase/functions/_shared/people.ts';
import type { ListPlace } from '../../supabase/functions/_shared/myList.ts';
import type { Weekend } from '../../supabase/functions/_shared/place.ts';
import {
  CYCLES, apptKind, catOf, contactKind, dateKind, folderOf,
  type Appointment, type Contact, type Finding, type Item, type LifeDate, type Paper, type Purchase, type Sender, type Settings, type Suggestion,
} from '../../supabase/functions/_shared/model.ts';
import { SETTINGS_INDEX } from '../components/SettingsGrid';
import { addedFeed } from './added';
import { hrefTo, slug } from './nav';

/**
 * 🔎 One search over everything already on this phone (no AI, nothing sent): bills, spending (receipts and their lines),
 * returns, the money log, what was added, contacts, Nearby's weekend list, My list, Vault documents (only while the Vault
 * is open), appointments, privacy (your name online, people-search sites, breaches, mailing lists, dates, credit),
 * Settings and the Guide. Built once into a folded (lower-case, no accents) index when the search opens, then each
 * keystroke only scans that index.
 */
export type HitKind = 'bill' | 'spend' | 'return' | 'log' | 'added' | 'contact' | 'nearby' | 'place' | 'doc' | 'appt' | 'privacy' | 'setting' | 'guide';
export interface Hit {
  kind: HitKind; id: string; icon: string; title: string; sub: string; href: string;
  snippet?: string; // a short piece of text around the match (when the title alone doesn't show why it matched)
  amount?: string; date?: string; // right side, in mono
  locked?: boolean; // 🔒 "Vault is locked" row
}
export interface HitGroup { kind: HitKind; label: string; icon: string; hits: Hit[]; more: number }
export interface LogLine { id: string; at: string; kind: string; text: string; data: { tx?: string; item?: string } | null }
export interface SearchData {
  items: Item[]; tx: SpendTx[]; contacts: Contact[]; places: ListPlace[]; papers: Paper[]; appts: Appointment[];
  rules: Record<string, string>;
  purchases?: Purchase[]; log?: LogLine[]; added?: Suggestion[]; findings?: Finding[]; senders?: Sender[]; dates?: LifeDate[];
  weekend?: Weekend | null; settings?: Settings;
}

export const KINDS: { kind: HitKind; icon: string; label: string }[] = [
  { kind: 'bill', icon: '📋', label: 'Bills' }, { kind: 'spend', icon: '💸', label: 'Spending' }, { kind: 'return', icon: '🧾', label: 'Returns' },
  { kind: 'log', icon: '📜', label: 'Money log' }, { kind: 'added', icon: '🆕', label: 'What was added' }, { kind: 'contact', icon: '📇', label: 'Contacts' },
  { kind: 'nearby', icon: '🔎', label: 'Nearby' }, { kind: 'place', icon: '📌', label: 'My list' }, { kind: 'doc', icon: '📁', label: 'Vault' },
  { kind: 'appt', icon: '📅', label: 'Appointments' }, { kind: 'privacy', icon: '🛡️', label: 'Privacy' }, { kind: 'setting', icon: '⚙️', label: 'Settings' },
  { kind: 'guide', icon: '❓', label: 'Guide' },
];
const KIND_OF = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<HitKind, (typeof KINDS)[number]>;
/** "📇 Contacts" (Ask's "in Contacts" line uses the words after the icon). */
export const HIT_LABELS = Object.fromEntries(KINDS.map((k) => [k.kind, `${k.icon} ${k.label}`])) as Record<HitKind, string>;

/** The Guide's topics (title = the Guide's section, words = what it talks about). Opens that section: #/guide?t=<slug>. */
export const GUIDE_TOPICS: { icon: string; title: string; words: string }[] = [
  { icon: '✨', title: 'What it does', words: 'automatic undo bills receipts documents' },
  { icon: '🧭', title: 'Finding your way (tabs, search, ＋)', words: 'tabs search find magnifier add where did it go keyboard shortcut' },
  { icon: '🫧', title: 'How it looks and feels', words: 'look glass light dark reduce motion' },
  { icon: '⚙️', title: 'Settings', words: 'settings squares' },
  { icon: '💬', title: 'Ask LifeTracker', words: 'ask question chat open show where' },
  { icon: '💸', title: 'Spending and budgets', words: 'spending budget category receipt photo items card' },
  { icon: '📜', title: 'Money log', words: 'log history lines' },
  { icon: '🧾', title: 'Returns and warranties', words: 'returns warranty order return window' },
  { icon: '📆', title: 'Appointments (emails and texts)', words: 'appointments doctor dentist calendar texts sms' },
  { icon: '📇', title: 'Contacts (your dentist, garage, insurer…)', words: 'contacts phone email address not a contact merge' },
  { icon: '📍', title: 'Nearby (places, things to do, this weekend)', words: 'nearby places things to do weekend events zip' },
  { icon: '📁', title: 'Vault (your documents)', words: 'vault documents scan lock pin passport' },
  { icon: '💬', title: 'Get a lower price on a bill', words: 'negotiate lower price call script' },
  { icon: '📱', title: 'My apps (all your apps on one page)', words: 'my apps cost' },
  { icon: '🎂', title: 'Important dates and car care', words: 'birthday anniversary dates car oil' },
  { icon: '📋', title: 'Your bills', words: 'bills subscriptions due autopay' },
  { icon: '🆕', title: 'What was added (Inbox)', words: 'inbox added undo bell' },
  { icon: '🔔', title: 'Heads-ups', words: 'heads-ups alerts notifications email' },
  { icon: '🏦', title: 'Your bank (free, by email)', words: 'bank alerts csv simplefin' },
  { icon: '📊', title: 'My week', words: 'week summary email' },
  { icon: '🕵️', title: 'Your name online', words: 'name online google search' },
  { icon: '🧹', title: 'People-search sites', words: 'people search brokers removal' },
  { icon: '🔓', title: 'Data breaches and passwords', words: 'breach password leaked pwned' },
  { icon: '📭', title: 'Mailing lists (unsubscribe)', words: 'mailing lists newsletters unsubscribe block' },
  { icon: '🪪', title: 'Documents that expire', words: 'passport licence expire' },
  { icon: '🔒', title: 'Credit freeze and reports', words: 'credit freeze equifax experian transunion report' },
  { icon: '📅', title: 'Google Calendar', words: 'calendar events google' },
  { icon: '✉️', title: 'Gmail receipts and forwarding', words: 'gmail forward receipts another google account second email work mailbox add' },
  { icon: '📄', title: 'Documents (bills, policies, statements)', words: 'documents upload pdf photo' },
  { icon: '🏠', title: 'Mortgage and loans', words: 'mortgage loan escrow rate payoff' },
  { icon: '🤖', title: 'The AI and what it costs', words: 'ai gemini claude cost free paid limit' },
  { icon: '🔐', title: 'Privacy', words: 'privacy data security' },
  { icon: '🛠️', title: 'Setting it up (one time)', words: 'setup setting up keys connect' },
];

// ---------- folding (lower case, no accents) with a map back to the original letters, for highlighting ----------
const ACCENTS = /[̀-ͯ]/g;
export const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(ACCENTS, '');
function foldMap(s: string): { f: string; at: number[] } {
  let f = '';
  const at: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = fold(s[i]);
    for (let j = 0; j < c.length; j++) at.push(i);
    f += c;
  }
  at.push(s.length);
  return { f, at };
}
const isNum = (w: string) => /^\d+(?:\.\d+)?$/.test(w);
const wordStart = (h: string, i: number) => i === 0 || !/[\p{L}\p{N}]/u.test(h[i - 1]);
/** Where a word is in a folded text: numbers only at the start of a number ("25" finds $25.00 and 25.49, not 125). */
function find(h: string, w: string, from = 0): number {
  let i = h.indexOf(w, from);
  if (!isNum(w)) return i;
  while (i >= 0 && i > 0 && /[\d.,]/.test(h[i - 1])) i = h.indexOf(w, i + 1);
  return i;
}

/** The typed words (folded): "$25" → "25", "1,250.00" → "1250.00"; a phone number typed with dashes or brackets = its digits. */
export function queryWords(q: string): { words: string[]; phone: string | null } {
  const t = q.trim();
  const digits = t.replace(/\D/g, '');
  if (/^\+?[\d\s().-]+$/.test(t) && /[\s().-]/.test(t) && digits.length >= 5 && !/^\d+\.\d{1,2}$/.test(t)) return { words: [digits], phone: digits };
  const words = fold(t).split(/\s+/).map((w) => w.replace(/^\$/, '').replace(/[,;:!?]+$/, ''))
    .map((w) => (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(w) ? w.replace(/,/g, '') : w)).filter(Boolean);
  return { words, phone: null };
}

/** Pieces of `text` to highlight for these (folded) words: [start, end) in the original text. */
export function marks(text: string, words: string[]): [number, number][] {
  if (!text || !words.length) return [];
  const { f, at } = foldMap(text);
  const out: [number, number][] = [];
  for (const w of words) {
    if (!w) continue;
    for (let i = find(f, w); i >= 0; i = find(f, w, i + w.length)) out.push([at[i], at[i + w.length]]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of out) { const l = merged[merged.length - 1]; if (l && m[0] <= l[1]) l[1] = Math.max(l[1], m[1]); else merged.push([...m]); }
  return merged;
}

// ---------- the index ----------
interface Entry { hit: Hit; t: string; h: string; ctx: string[]; fctx: string[]; digits: string; at: string; always?: boolean }
export interface SearchIndex { entries: Entry[] }

const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthName = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
const amountWords = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? [] : [money(Math.abs(Number(n))), Math.abs(Number(n)).toFixed(2)]);
const clean = (xs: (string | null | undefined | false)[]) => xs.filter((x): x is string => !!x && !!String(x).trim()).map(String);
const cycleLabel = (c: string) => CYCLES.find((x) => x.id === c)?.label.toLowerCase() ?? c;

function entry(hit: Hit, ctx: (string | null | undefined | false)[], at: string | null | undefined, phones: string[] = [], hidden: (string | null | undefined | false)[] = []): Entry {
  const c = clean(ctx);
  const t = fold(hit.title);
  const fctx = c.map(fold);
  return { hit, t, h: [t, fold(hit.sub), ...fctx, ...clean(hidden).map(fold)].join(' \u0001 '), ctx: c, fctx, digits: phones.map((p) => p.replace(/\D/g, '')).join(' '), at: at ?? '' };
}

/** Everything searchable, from data already on this phone (Vault documents only while the Vault is open). */
export function buildIndex(d: SearchData, o: { vaultOpen: boolean }): SearchIndex {
  const e: Entry[] = [];
  for (const i of d.items) {
    const cat = catOf(i.category);
    e.push(entry({
      kind: 'bill', id: i.id, icon: i.status === 'cancelled' ? '✂️' : cat.icon, title: i.name,
      sub: `${cycleLabel(i.cycle)}${i.status === 'cancelled' ? ' · cancelled' : i.next_due ? ` · next ${day(i.next_due)}` : ''}`,
      amount: money(Number(i.amount)), date: i.next_due && i.status !== 'cancelled' ? day(i.next_due) : undefined,
      href: hrefTo('money', 'bills', `?item=${i.id}`),
    }, [i.merchant, i.notes, i.account, i.website, cat.label, ...amountWords(i.amount)], i.next_due ?? i.updated_at, [], [i.status, i.category, i.cycle]));
  }
  for (const t of d.tx) {
    if (!t.id || Number(t.amount) >= 0) continue;
    const det = t.details;
    const title = det?.store || t.description || t.merchant || 'Purchase';
    const cat = spendCat(categorize(t, d.rules));
    e.push(entry({
      kind: 'spend', id: t.id, icon: t.receipt_path ? '🧾' : '💳', title,
      sub: `${cat.label}${t.receipt_path ? ' · receipt' : ''}`, amount: money(-Number(t.amount)), date: day(t.posted),
      href: hrefTo('money', 'spending', `?tx=${t.id}`),
    }, [
      t.description !== title && t.description, t.merchant !== title && t.merchant, t.note, cat.label, t.account,
      det?.card && `card ···${det.card}`, ...(det?.items ?? []).map((x) => `${x.name}${x.price != null ? ` ${money(x.price)}` : ''}`), ...amountWords(t.amount),
    ], t.posted, [], [t.posted, monthName(t.posted), t.source]));
  }
  for (const p of d.purchases ?? []) {
    const status = { keep: 'can return', kept: 'kept', returning: 'returning', returned: 'returned', ignored: '' }[p.status];
    e.push(entry({
      kind: 'return', id: p.id, icon: p.status === 'returned' ? '↩️' : '🧾', title: p.store,
      sub: clean([p.item, status, p.return_by && `return by ${day(p.return_by)}`]).join(' · '),
      amount: p.amount != null ? money(Number(p.amount)) : undefined, date: day(p.bought), href: hrefTo('money', 'returns'),
    }, [p.item, p.notes, status, p.warranty_ends && `warranty until ${day(p.warranty_ends)}`, ...amountWords(p.amount)], p.bought, [], [p.bought]));
  }
  for (const l of d.log ?? []) {
    const tx = l.data?.tx, item = l.data?.item;
    e.push(entry({
      kind: 'log', id: l.id, icon: { purchase: '💳', receipt: '🧾', bill: '📋', change: '✎' }[l.kind] ?? '📜', title: l.text,
      sub: 'Money log', date: day(l.at.slice(0, 10)),
      href: tx && d.tx.some((x) => x.id === tx) ? hrefTo('money', 'spending', `?tx=${tx}`) : item && d.items.some((x) => x.id === item) ? hrefTo('money', 'bills', `?item=${item}`) : hrefTo('money', 'log'),
    }, [], l.at, [], [l.at.slice(0, 10), monthName(l.at)]));
  }
  if (d.added) {
    for (const a of addedFeed({ items: d.items, added: d.added, tx: d.tx, papers: o.vaultOpen ? d.papers : [], contacts: d.contacts, appts: d.appts })) {
      e.push(entry({ kind: 'added', id: a.key, icon: a.icon, title: a.title, sub: a.sub, date: day(a.at.slice(0, 10)), href: '#/inbox' }, [a.where], a.at));
    }
  }
  for (const c of d.contacts) {
    if (c.status !== 'active') continue;
    const k = contactKind(c.kind);
    e.push(entry({
      kind: 'contact', id: c.id, icon: c.favorite ? '★' : k.icon, title: c.name,
      sub: clean([c.person, c.phones?.[0], c.address]).join(' · ') || c.description || k.label,
      href: hrefTo('places', 'contacts', `?c=${c.id}`),
    }, [c.person, k.label, ...(c.phones ?? []), ...(c.emails ?? []), c.website, c.address, c.description, c.notes], c.last_seen ?? c.updated_at, c.phones ?? []));
  }
  if (d.weekend) {
    const w = d.weekend;
    for (const [i, s] of [...w.near, ...w.events, ...w.far].entries()) {
      e.push(entry({
        kind: 'nearby', id: `w${i}`, icon: s.kind === 'food' ? '🍽️' : s.kind === 'event' ? '🎉' : s.kind === 'trip' ? '🚗' : '🌳', title: s.name,
        sub: clean([s.about, s.when, 'this weekend']).join(' · '), amount: `${s.miles.toFixed(1)} mi`, href: hrefTo('places', 'nearby'),
      }, [s.address, s.about, s.when, s.phone, s.website], w.at, s.phone ? [s.phone] : [], [s.kind]));
    }
  }
  for (const p of d.places) {
    e.push(entry({
      kind: 'place', id: p.id, icon: p.done ? '✓' : '📌', title: p.name,
      sub: clean([p.address, p.done ? 'been there' : '']).join(' · ') || p.kind,
      amount: p.miles != null ? `${p.miles.toFixed(1)} mi` : undefined, href: hrefTo('places', 'list', `?p=${p.id}`),
    }, [p.note, p.address, p.about, p.when_text], p.created_at, [], [p.kind]));
  }
  if (o.vaultOpen) {
    for (const p of d.papers) {
      e.push(entry({
        kind: 'doc', id: p.id, icon: docIcon(p), title: p.name,
        sub: clean([p.holder, folderOf(p.folder).label]).join(' · '), date: p.expires ? `${p.due_kind === 'due' ? 'due' : 'exp.'} ${day(p.expires)}` : undefined,
        href: hrefTo('me', 'vault', `?doc=${p.id}`),
      }, [p.summary, ...(p.tags ?? []).map((t) => `#${t}`), p.notes, p.body, p.number_end && `ends in ${p.number_end}`, paperKind(p.kind).label], p.doc_date ?? p.created_at, [], [p.folder, p.expires, p.doc_date]));
    }
  } else {
    const row = entry({ kind: 'doc', id: 'locked', icon: '🔒', title: 'Vault is locked', sub: 'Unlock it to search your documents too', href: hrefTo('me', 'vault'), locked: true }, [], '');
    row.always = true;
    e.push(row);
  }
  for (const a of d.appts) {
    if (a.status !== 'booked') continue;
    const k = apptKind(a.kind);
    e.push(entry({
      kind: 'appt', id: a.id, icon: k.icon, title: a.title, sub: clean([a.time, a.place ?? a.with_who]).join(' · ') || k.label, date: day(a.day), href: `#/home?appt=${a.id}`,
    }, [a.place, a.with_who, a.notes, k.label, a.source_from], a.day, [], [a.day, monthName(a.day)]));
  }
  const privacy = hrefTo('me', 'privacy');
  for (const f of d.findings ?? []) {
    const icon = f.kind === 'breach' ? '🔓' : f.kind === 'broker' ? '🧹' : '🕵️';
    const where = f.kind === 'breach' ? 'Data breach' : f.kind === 'broker' ? 'People-search site' : 'Your name online';
    e.push(entry({ kind: 'privacy', id: f.id, icon, title: f.title, sub: clean([where, f.site, f.status]).join(' · '), href: privacy }, [f.snippet, f.why, f.url, f.verdict], f.found_at ?? f.created_at));
  }
  for (const s of d.senders ?? []) {
    e.push(entry({
      kind: 'privacy', id: s.id, icon: '📭', title: s.name || s.address, sub: `Mailing list · ${s.status}${s.spam ? ' · spam' : ''}`,
      amount: `${s.emails} emails`, href: privacy,
    }, [s.address, s.sample], s.last_seen));
  }
  for (const x of d.dates ?? []) {
    const k = dateKind(x.kind);
    e.push(entry({ kind: 'privacy', id: x.id, icon: k.icon, title: x.title, sub: `Important date · ${k.label}`, date: day(x.next_date), href: privacy }, [x.notes], x.next_date, [], [x.next_date, monthName(x.next_date)]));
  }
  if (d.settings) {
    const c = d.settings.credit;
    const word = (f: string) => ({ frozen: 'frozen', not: 'not frozen', unknown: 'not set yet' } as Record<string, string>)[f] ?? f;
    for (const b of ['equifax', 'experian', 'transunion'] as const) {
      e.push(entry({ kind: 'privacy', id: `credit-${b}`, icon: '🔒', title: `${b === 'transunion' ? 'TransUnion' : b[0].toUpperCase() + b.slice(1)} credit freeze`, sub: `Credit · ${word(c[b])}`, href: privacy }, ['credit freeze checklist'], ''));
    }
    if (c.lastReport) e.push(entry({ kind: 'privacy', id: 'credit-report', icon: '📄', title: 'Free credit report', sub: `Last looked ${day(c.lastReport)}`, href: privacy }, ['credit report annualcreditreport'], c.lastReport));
  }
  const s = d.settings;
  const live: Record<string, (string | null | undefined)[]> = s ? {
    about: [...s.me.names, ...s.me.places, ...s.me.emails, ...s.me.phones, ...s.me.usernames],
    nearby: [s.place.zip && `zip ${s.place.zip}`],
    appts: [s.appts.timeZone],
    spending: [...Object.keys(s.spend.budgets).map((k) => `budget ${spendCat(k).label}`), ...Object.keys(s.spend.rules)],
    vault: s.vault.people.map((p) => p.name),
    google: [s.gmail.plusTag && `+${s.gmail.plusTag}`],
  } : {};
  for (const x of Object.values(SETTINGS_INDEX)) {
    e.push(entry({
      kind: 'setting', id: x.id, icon: x.icon, title: x.title, sub: 'Settings',
      href: x.id === 'guide' ? '#/guide' : x.id === 'apps' ? './apps.html' : hrefTo('me', 'settings', `/${x.id}`),
    }, live[x.id] ?? [], '', s?.me.phones ?? [], [x.words]));
  }
  for (const g of GUIDE_TOPICS) {
    e.push(entry({ kind: 'guide', id: slug(g.title), icon: g.icon, title: g.title, sub: 'Guide', href: `#/guide?t=${slug(g.title)}` }, [], '', [], [g.words]));
  }
  return { entries: e };
}

/** A short line around the first match that isn't already in the title (about 70 letters). */
function snippetOf(x: Entry, words: string[]): string | undefined {
  const rest = words.filter((w) => find(x.t, w) < 0);
  if (!rest.length) return undefined;
  let best = -1, bestN = 0;
  x.fctx.forEach((f, i) => { const n = rest.filter((w) => find(f, w) >= 0).length; if (n > bestN) { best = i; bestN = n; } });
  if (best < 0) return undefined;
  const text = x.ctx[best].replace(/\s+/g, ' ');
  if (text.length <= 80) return text;
  const { f, at } = foldMap(text);
  const hit = at[Math.max(0, find(f, rest.find((w) => find(f, w) >= 0) ?? rest[0]))];
  let a = Math.max(0, hit - 28);
  if (a > 0) { const sp = text.indexOf(' ', a); a = sp >= 0 && sp < hit ? sp + 1 : a; }
  let b = Math.min(text.length, a + 80);
  if (b < text.length) { const sp = text.lastIndexOf(' ', b); if (sp > hit) b = sp; }
  return `${a > 0 ? '…' : ''}${text.slice(a, b)}${b < text.length ? '…' : ''}`;
}

/**
 * The search: every word typed must be somewhere in the item (case and accents ignored; numbers match amounts, a
 * phone number matches by its digits). Best first: in the title > at the start of a word > anywhere, then newest.
 * With a section picked and nothing typed: that section's newest.
 */
export function searchIndex(ix: SearchIndex, q: string, o: { max?: number; kind?: HitKind | 'all' } = {}): HitGroup[] {
  const { words, phone } = queryWords(q);
  const kind = o.kind ?? 'all';
  const max = o.max ?? 5;
  if (!words.length && kind === 'all') return [];
  if (words.length && words.join('').length < 2) return [];
  const found: { x: Entry; score: number }[] = [];
  for (const x of ix.entries) {
    if (kind !== 'all' && x.hit.kind !== kind) continue;
    if (x.always) { found.push({ x, score: -1 }); continue; }
    let score = 0, ok = true;
    for (const w of words) {
      if (phone || (isNum(w) && w.length >= 3)) {
        if (x.digits && x.digits.includes(w)) { score += 1; continue; }
        if (phone) { ok = false; break; }
      }
      const ti = find(x.t, w);
      if (ti >= 0) { score += wordStart(x.t, ti) ? (ti === 0 ? 4 : 3) : 2; continue; }
      const hi = find(x.h, w);
      if (hi < 0) { ok = false; break; }
      score += wordStart(x.h, hi) ? 1 : 0;
    }
    if (ok) found.push({ x, score });
  }
  found.sort((a, b) => b.score - a.score || b.x.at.localeCompare(a.x.at));
  const by = new Map<HitKind, { x: Entry; score: number }[]>();
  for (const f of found) { const l = by.get(f.x.hit.kind) ?? []; l.push(f); by.set(f.x.hit.kind, l); }
  const order = KINDS.map((k) => k.kind);
  return [...by.entries()]
    // The 🔒 locked-Vault line goes first (a notice, not a result), then the sections by their best match.
    .sort((a, b) => Number(!!b[1][0].x.always) - Number(!!a[1][0].x.always) || b[1][0].score - a[1][0].score || order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([k, l]) => ({
      kind: k, label: KIND_OF[k].label, icon: KIND_OF[k].icon, more: Math.max(0, l.length - (kind === 'all' ? max : 60)),
      hits: l.slice(0, kind === 'all' ? max : 60).map(({ x }) => ({ ...x.hit, snippet: words.length ? snippetOf(x, words) : undefined })),
    }));
}

export function searchAll(d: SearchData, q: string, o: { vaultOpen: boolean; max?: number; kind?: HitKind | 'all' } = { vaultOpen: true }): HitGroup[] {
  return searchIndex(buildIndex(d, o), q, o);
}

/** The search data from the store (rules from Settings). */
export function dataOf(st: Omit<SearchData, 'rules'> & { settings: Settings }, log?: LogLine[]): SearchData {
  return { ...st, rules: st.settings.spend.rules, log };
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
  const groups = searchAll(d, what, { vaultOpen, max: 1 });
  const order: HitKind[] = ['contact', 'doc', 'place', 'bill', 'appt'];
  for (const k of order) { const g = groups.find((x) => x.kind === k); const h = g?.hits.find((x) => !x.locked); if (h) return h; }
  return null;
}
