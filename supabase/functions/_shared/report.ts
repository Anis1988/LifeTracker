import { SPEND_CATS, categorize, shopKey, spendCat, type SpendTx } from './spend.ts';
import { personFor, type MailPerson } from './mailPeople.ts';

/**
 * 📊 Money → Reports: one filter (period, categories, person, shop or item, source, smallest amount) → a report, all
 * worked out ON THE DEVICE from purchases already loaded (no AI). The 💬 question box turns plain words into the same
 * filter with free rules (`parseQuestion`); only when it understands nothing does the app ask the free AI (Claude last)
 * for a filter (api `report-filter`, names only, never amounts). Plain TS shared by the app and the server.
 */
export const PERIODS = ['this-month', 'last-month', 'last-3', 'last-6', 'last-12', 'this-year', 'last-year', 'this-week', 'last-week', 'yesterday', 'today', 'month', 'custom'] as const;
export type PeriodKind = (typeof PERIODS)[number];
export interface Period { kind: PeriodKind; month?: string; from?: string; to?: string } // month = YYYY-MM; from/to = YYYY-MM-DD (custom)
export const SOURCES = ['alert', 'receipt', 'csv', 'bank'] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = { alert: '📧 Bank alert', receipt: '🧾 Receipt', csv: '📄 CSV', bank: '🏦 Bank link' };
export type Focus = 'total' | 'top' | 'average' | 'compare';
export interface ReportFilter {
  period: Period;
  vs?: Period | null; // compare with this instead of the period just before
  cats: string[]; // [] = every category (transfers left out)
  person: string; // 'all' or a mailbox address
  shop: string; // '' = any; words in the shop name or an item on the receipt
  sources: Source[]; // [] = all
  min: number | null;
}
export const NO_FILTER: ReportFilter = { period: { kind: 'this-month' }, vs: null, cats: [], person: 'all', shop: '', sources: [], min: null };
export interface Range { from: string; to: string; label: string; short: string }

// ---------- dates (YYYY-MM-DD, UTC maths) ----------
const DAY = 86400_000;
const ms = (d: string) => Date.parse(`${d}T12:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(ms(d) + n * DAY);
const monthStart = (d: string, back = 0) => { const x = new Date(ms(d)); return iso(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - back, 1, 12)); };
const monthEnd = (m: string) => { const x = new Date(ms(`${m}-01`)); return iso(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0, 12)); };
/** Same day n months away (clamped to the month's last day). */
const shiftMonths = (d: string, n: number) => { const x = new Date(ms(d)); const t = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1, 12)); const last = Number(monthEnd(iso(t.getTime()).slice(0, 7)).slice(8)); return `${iso(t.getTime()).slice(0, 8)}${String(Math.min(x.getUTCDate(), last)).padStart(2, '0')}`; };
export const daysIn = (r: { from: string; to: string }) => Math.round((ms(r.to) - ms(r.from)) / DAY) + 1;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Oct 3" / "Oct 3, 2025" (year when not this one). */
export const dayText = (d: string, t: string) => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8))}${d.slice(0, 4) !== t.slice(0, 4) ? `, ${d.slice(0, 4)}` : ''}`;
export const monthText = (m: string, t?: string) => `${MONTH_LONG[Number(m.slice(5, 7)) - 1]}${!t || m.slice(0, 4) !== t.slice(0, 4) ? ` ${m.slice(0, 4)}` : ''}`;
const span = (from: string, to: string, t: string) => (from === to ? dayText(from, t) : `${dayText(from, t)} – ${dayText(to, t)}`);
const mondayOf = (d: string) => addDays(d, -((new Date(ms(d)).getUTCDay() + 6) % 7));

/** The days a period covers (up to today), with words for it. */
export function rangeOf(p: Period, t: string): Range {
  const mk = (from: string, to: string, label: string): Range => ({ from, to: to > t && from <= t ? t : to, label, short: span(from, to > t && from <= t ? t : to, t) });
  switch (p.kind) {
    case 'this-month': return mk(monthStart(t), t, 'This month');
    case 'last-month': { const f = monthStart(t, 1); return mk(f, monthEnd(f.slice(0, 7)), 'Last month'); }
    case 'last-3': case 'last-6': case 'last-12': { const n = Number(p.kind.slice(5)); return mk(monthStart(t, n - 1), t, `Last ${n} months`); }
    case 'this-year': return mk(`${t.slice(0, 4)}-01-01`, t, 'This year');
    case 'last-year': { const y = Number(t.slice(0, 4)) - 1; return mk(`${y}-01-01`, `${y}-12-31`, `Last year (${y})`); }
    case 'this-week': return mk(mondayOf(t), t, 'This week');
    case 'last-week': { const f = addDays(mondayOf(t), -7); return mk(f, addDays(f, 6), 'Last week'); }
    case 'yesterday': { const y = addDays(t, -1); return mk(y, y, 'Yesterday'); }
    case 'today': return mk(t, t, 'Today');
    case 'month': { const m = /^\d{4}-\d{2}$/.test(p.month ?? '') ? p.month! : t.slice(0, 7); return mk(`${m}-01`, monthEnd(m), monthText(m, t)); }
    case 'custom': {
      let from = /^\d{4}-\d{2}-\d{2}$/.test(p.from ?? '') ? p.from! : monthStart(t);
      let to = /^\d{4}-\d{2}-\d{2}$/.test(p.to ?? '') ? p.to! : t;
      if (from > to) [from, to] = [to, from];
      return mk(from, to, span(from, to, t));
    }
  }
}

/** The period to compare with: the same stretch just before (months move by whole months), with words for it. */
export function prevRangeOf(p: Period, t: string, vs?: Period | null): Range {
  if (vs) { const r = rangeOf(vs, t); return { ...r, label: r.label.charAt(0).toLowerCase() + r.label.slice(1) }; }
  const r = rangeOf(p, t);
  const months = p.kind === 'this-month' || p.kind === 'last-month' || p.kind === 'month' ? 1 : p.kind.startsWith('last-') && /\d/.test(p.kind) ? Number(p.kind.slice(5)) : p.kind === 'this-year' || p.kind === 'last-year' ? 12 : 0;
  if (months) {
    const from = shiftMonths(r.from, -months);
    // a whole month before → its whole length; a month still running → up to the same day
    const to = r.to === monthEnd(r.to.slice(0, 7)) ? monthEnd(shiftMonths(r.to, -months).slice(0, 7)) : shiftMonths(r.to, -months);
    const label = p.kind === 'this-month' ? 'last month' : p.kind === 'last-month' ? 'the month before' : p.kind === 'month' ? monthText(from.slice(0, 7), t) : p.kind === 'this-year' ? 'the same days last year' : p.kind === 'last-year' ? 'the year before' : `the ${months} months before`;
    return { from, to, label, short: span(from, to, t) };
  }
  const n = daysIn(r);
  const week = p.kind === 'this-week' || p.kind === 'last-week';
  const from = addDays(r.from, week ? -7 : -n), to = week ? addDays(r.to, -7) : addDays(r.from, -1);
  const label = week ? 'the week before' : n === 1 ? 'the day before' : `the ${n} days before`;
  return { from, to, label, short: span(from, to, t) };
}

// ---------- the report ----------
export interface ReportCtx { rules: Record<string, string>; people: MailPerson[]; today: string }
export interface ShopTotal { key: string; name: string; amount: number; count: number }
export interface Bucket { key: string; label: string; from: string; amount: number }
export interface PersonTotal { id: string; name: string; color: MailPerson['color'] | null; amount: number }
export interface Report {
  range: Range; prev: Range;
  total: number; prevTotal: number; count: number; prevCount: number;
  byCat: { id: string; amount: number; count: number }[];
  shops: ShopTotal[]; // top 8
  buckets: Bucket[]; step: 'day' | 'week' | 'month';
  people: PersonTotal[]; // when Person = All and there are 2+ mailboxes
  list: SpendTx[]; // newest first
  perMonth: number; perPurchase: number;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** The shop's name as shown: the receipt's store for a receipt line, else the bank's words. */
export const shopName = (x: SpendTx) => ((x.source === 'receipt' ? x.details?.store || x.description : x.description || x.details?.store) || 'Purchase').replace(/\s+/g, ' ').trim();
/** Does the purchase match "Shop or item" words (all of them, in the shop name or an item on its receipt)? */
export function shopMatch(x: SpendTx, q: string): boolean {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${x.description ?? ''} ${x.merchant ?? ''} ${x.details?.store ?? ''} ${(x.details?.items ?? []).map((i) => i.name).join(' ')}`);
  return words.every((w) => hay.includes(w));
}

/** Everything that matches the filter except the period (the period is applied by the caller). */
export function matcher(f: ReportFilter, ctx: ReportCtx): (x: SpendTx, cat: string) => boolean {
  const cats = new Set(f.cats);
  return (x, cat) => {
    if (cats.size ? !cats.has(cat) : cat === 'transfers') return false; // transfers count only when picked
    if (f.person !== 'all' && personFor(x, ctx.people)?.email !== f.person) return false;
    if (f.sources.length && !f.sources.includes((x.source ?? 'bank') as Source)) return false;
    if (f.min != null && -Number(x.amount) < f.min) return false;
    return !f.shop || shopMatch(x, f.shop);
  };
}

export function buildReport(tx: SpendTx[], f: ReportFilter, ctx: ReportCtx): Report {
  const t = ctx.today;
  const range = rangeOf(f.period, t), prev = prevRangeOf(f.period, t, f.vs);
  const ok = matcher(f, ctx);
  const cur: { x: SpendTx; cat: string }[] = [];
  let prevTotal = 0, prevCount = 0;
  for (const x of tx) {
    if (!(Number(x.amount) < 0)) continue;
    const inCur = x.posted >= range.from && x.posted <= range.to, inPrev = x.posted >= prev.from && x.posted <= prev.to;
    if (!inCur && !inPrev) continue;
    const cat = categorize(x, ctx.rules);
    if (!ok(x, cat)) continue;
    if (inCur) cur.push({ x, cat });
    if (inPrev) { prevTotal -= Number(x.amount); prevCount++; }
  }
  const total = r2(cur.reduce((a, { x }) => a - Number(x.amount), 0));
  const cats = new Map<string, { amount: number; count: number }>();
  const shops = new Map<string, ShopTotal>();
  for (const { x, cat } of cur) {
    const c = cats.get(cat) ?? { amount: 0, count: 0 }; c.amount -= Number(x.amount); c.count++; cats.set(cat, c);
    const key = shopKey(x);
    const s = shops.get(key) ?? { key, name: shopName(x).slice(0, 40), amount: 0, count: 0 }; s.amount -= Number(x.amount); s.count++; shops.set(key, s);
  }
  // over time: by day up to 5 weeks, by week up to ~4 months, else by month
  const n = daysIn(range);
  const step = n <= 35 ? 'day' : n <= 120 ? 'week' : 'month';
  const keyOf = (d: string) => (step === 'day' ? d : step === 'week' ? mondayOf(d) : d.slice(0, 7));
  const buckets: Bucket[] = [];
  for (let d = keyOf(range.from); ; ) {
    const from = step === 'month' ? `${d}-01` : d;
    if (from > range.to) break;
    buckets.push({ key: d, from, amount: 0, label: step === 'month' ? `${MON[Number(d.slice(5, 7)) - 1]}${d.slice(0, 4) !== t.slice(0, 4) ? ` ’${d.slice(2, 4)}` : ''}` : step === 'week' ? dayText(d, t) : String(Number(d.slice(8))) });
    d = step === 'day' ? addDays(d, 1) : step === 'week' ? addDays(d, 7) : shiftMonths(`${d}-01`, 1).slice(0, 7);
  }
  const at = new Map(buckets.map((b) => [b.key, b]));
  for (const { x } of cur) { const b = at.get(keyOf(x.posted)); if (b) b.amount -= Number(x.amount); }
  for (const b of buckets) b.amount = r2(b.amount);
  const people: PersonTotal[] = [];
  if (f.person === 'all' && ctx.people.length >= 2) {
    const m = new Map<string, PersonTotal>(ctx.people.map((p) => [p.email, { id: p.email, name: p.name, color: p.color, amount: 0 }]));
    const none: PersonTotal = { id: 'none', name: 'Bank / CSV', color: null, amount: 0 };
    for (const { x } of cur) { const p = personFor(x, ctx.people); (p ? m.get(p.email)! : none).amount -= Number(x.amount); }
    people.push(...[...m.values(), none].map((p) => ({ ...p, amount: r2(p.amount) })).filter((p) => p.amount > 0 || p.id !== 'none'));
  }
  const months = Math.max(1, n / 30.44);
  return {
    range, prev, total, prevTotal: r2(prevTotal), count: cur.length, prevCount,
    byCat: [...cats.entries()].map(([id, c]) => ({ id, amount: r2(c.amount), count: c.count })).sort((a, b) => b.amount - a.amount),
    shops: [...shops.values()].map((s) => ({ ...s, amount: r2(s.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 8),
    buckets, step, people,
    list: cur.map(({ x }) => x).sort((a, b) => b.posted.localeCompare(a.posted) || (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    perMonth: r2(total / months), perPurchase: cur.length ? r2(total / cur.length) : 0,
  };
}

// ---------- words ----------
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "Food (Groceries + Eating out)" style name for the picked categories. */
export function catsText(cats: string[]): string {
  if (!cats.length) return 'everything';
  const s = [...cats].sort().join(',');
  if (s === 'dining,groceries') return 'Food';
  return cats.map((c) => spendCat(c).label).join(' + ');
}
/** "▲ 18% more than last month" / "▼ 12% less …" / null when there's nothing to compare. */
export function changeOf(r: Report): { dir: 'up' | 'down' | 'same'; pct: number; text: string } | null {
  if (!r.prevTotal) return null;
  const pct = Math.round(((r.total - r.prevTotal) / r.prevTotal) * 100);
  if (pct === 0) return { dir: 'same', pct, text: `about the same as ${r.prev.label}` };
  return { dir: pct > 0 ? 'up' : 'down', pct: Math.abs(pct), text: `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${r.prev.label}` };
}
/** The one-line answer under a question: "You spent $412.30 on Food this month — 18% less than last month." */
export function answerOf(r: Report, f: ReportFilter, focus: Focus, people: MailPerson[]): string {
  const who = f.person === 'all' ? 'You' : people.find((p) => p.email === f.person)?.name ?? 'You';
  const what = f.cats.length ? ` on ${catsText(f.cats)}` : '';
  const at = f.shop ? ` at ${f.shop.replace(/\b\w/g, (c) => c.toUpperCase())}` : '';
  const k = f.period.kind;
  const when2 = k === 'custom' ? `from ${r.range.short.replace(' – ', ' to ')}` : /^last-\d/.test(k) ? `in the ${r.range.label.toLowerCase()}`
    : k === 'month' ? `in ${r.range.label}` : k === 'last-year' ? 'last year' : r.range.label.toLowerCase();
  if (!r.count) return `${who === 'You' ? 'You' : who} spent nothing${what}${at} ${when2}.`;
  if (focus === 'top' && r.shops.length) return `Top shops${what} ${when2}: ${r.shops.slice(0, 3).map((s) => `${s.name} ${usd(s.amount)}`).join(', ')}.`;
  if (focus === 'average') return `${who} spent ${usd(r.perMonth)} a month on average${what}${at} ${when2} (${r.count} purchase${r.count === 1 ? '' : 's'}, ${usd(r.perPurchase)} each).`;
  const ch = changeOf(r);
  const vs = focus === 'compare' && !ch ? ` — nothing ${r.prev.label} to compare with` : ch ? ` — ${ch.text}${focus === 'compare' ? ` (${usd(r.prevTotal)})` : ''}` : '';
  return `${who} spent ${usd(r.total)}${what}${at} ${when2}${vs}.`;
}

/** The filter as short chips: "Food · This month · Anis". */
export function filterChips(f: ReportFilter, people: MailPerson[], t: string): { key: keyof ReportFilter | 'vs'; text: string }[] {
  const out: { key: keyof ReportFilter | 'vs'; text: string }[] = [{ key: 'period', text: `📅 ${rangeOf(f.period, t).label}` }];
  if (f.vs) out.push({ key: 'vs', text: `⇄ vs ${rangeOf(f.vs, t).label}` });
  if (f.cats.length) out.push({ key: 'cats', text: catsText(f.cats) === 'Food' ? '🍽️ Food' : f.cats.length === 1 ? `${spendCat(f.cats[0]).icon} ${spendCat(f.cats[0]).label}` : `🏷️ ${catsText(f.cats)}` });
  if (f.person !== 'all') out.push({ key: 'person', text: `👤 ${people.find((p) => p.email === f.person)?.name ?? 'Someone'}` });
  if (f.shop) out.push({ key: 'shop', text: `🔎 ${f.shop}` });
  if (f.sources.length) out.push({ key: 'sources', text: f.sources.map((s) => SOURCE_LABEL[s]).join(' + ') });
  if (f.min != null) out.push({ key: 'min', text: `≥ ${usd(f.min)}` });
  return out;
}

// ---------- 💬 the free question reader ----------
/** Words for each category (besides its own name). "food" = Groceries + Eating out. */
export const CAT_WORDS: Record<string, string[]> = {
  groceries: ['grocery', 'groceries', 'supermarket', 'supermarkets', 'food shopping'],
  dining: ['eating out', 'restaurant', 'restaurants', 'takeout', 'take out', 'take-out', 'delivery', 'dining', 'coffee', 'lunch', 'lunches', 'dinner', 'dinners', 'fast food', 'cafe', 'cafes'],
  gas: ['gas', 'fuel', 'petrol', 'gasoline'],
  transport: ['rides', 'ride', 'parking', 'taxi', 'taxis', 'transit', 'tolls', 'toll', 'transport', 'transportation'],
  shopping: ['shopping', 'clothes', 'clothing', 'shoes', 'online shopping', 'electronics'],
  home: ['home', 'garden', 'hardware', 'furniture', 'house'],
  health: ['health', 'pharmacy', 'medical', 'doctor', 'doctors', 'medicine', 'dentist', 'prescriptions'],
  fun: ['fun', 'hobbies', 'hobby', 'entertainment', 'movies', 'games', 'concerts', 'tickets'],
  travel: ['travel', 'trip', 'trips', 'hotel', 'hotels', 'flight', 'flights', 'vacation', 'airbnb'],
  personal: ['personal care', 'haircut', 'haircuts', 'salon', 'beauty', 'gym', 'nails', 'spa'],
  bills: ['bills', 'bill', 'subscriptions', 'subscription', 'utilities', 'utility', 'insurance'],
  transfers: ['transfers', 'transfer', 'cash', 'zelle', 'venmo', 'atm'],
  other: ['other', 'misc', 'miscellaneous'],
};
const FOOD = ['food', 'foods', 'eating'];
const STOP = new Set(("how much did do does i me my we our us you spend spent spending cost costs paid pay buy bought on at in for the a an of to from with and or by "
  + "what whats what's which where when was were is are be been show tell give list total totals money purchases purchase all every "
  + "top biggest most largest highest average avg per typical usual compare comparison versus vs than against between "
  + "this last past previous month months week weeks year years day days today yesterday since so far it its them "
  + "over above under below more less least at least than about around much many shops shop stores store places where").split(' '));
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const MONTHS: [RegExp, number][] = [[/\bjan(uary)?\b/, 1], [/\bfeb(ruary)?\b/, 2], [/\bmar(ch)?\b/, 3], [/\bapr(il)?\b/, 4], [/\bmay\b/, 5], [/\bjune?\b/, 6], [/\bjuly?\b/, 7], [/\baug(ust)?\b/, 8], [/\bsep(t|tember)?\b/, 9], [/\boct(ober)?\b/, 10], [/\bnov(ember)?\b/, 11], [/\bdec(ember)?\b/, 12]];

/** What the AI sends back for a question the free reader didn't understand (a filter, never an answer). */
export interface AiPeriod { kind: PeriodKind; month: string; from: string; to: string }
export interface AiFilter { understood: boolean; period: AiPeriod; vs: AiPeriod | null; cats: string[]; person: string; shop: string; sources: Source[]; min: number | null; focus: Focus }

export interface Parsed { filter: ReportFilter; focus: Focus; understood: boolean; parts: string[] }
export interface ParseCtx { people: MailPerson[]; shops: string[]; items?: string[]; today: string }

/** A month name in the question → the latest such month that isn't in the future ("September" in October = this year's). */
function monthPeriod(m: number, year: string | undefined, t: string): Period {
  const y = year ? Number(year) : Number(t.slice(0, 4)) - (m > Number(t.slice(5, 7)) ? 1 : 0);
  return { kind: 'month', month: `${y}-${String(m).padStart(2, '0')}` };
}

/** Periods named in the text, in the order they appear (the first is the report's, a second one is "vs"). */
function periodsIn(q: string, t: string): { at: number; p: Period; len: number }[] {
  const out: { at: number; p: Period; len: number }[] = [];
  const add = (re: RegExp, f: (m: RegExpExecArray) => Period | null) => {
    for (const m of q.matchAll(new RegExp(re.source, 'g'))) {
      if (out.some((o) => m.index! >= o.at && m.index! < o.at + o.len)) continue;
      const p = f(m as RegExpExecArray);
      if (p) out.push({ at: m.index!, p, len: m[0].length });
    }
  };
  add(/\b(?:last|past|previous) (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) months?\b/, (m) => {
    const n = Number(m[1]) || NUM_WORDS[m[1]] || 0;
    return n === 1 ? { kind: 'last-month' } : n <= 3 ? { kind: 'last-3' } : n <= 6 ? { kind: 'last-6' } : n <= 12 ? { kind: 'last-12' } : null;
  });
  add(/\b(?:last|past|previous) (\d{1,3}) days?\b/, (m) => ({ kind: 'custom', from: addDays(t, -(Number(m[1]) - 1)), to: t }));
  add(/\b(?:last|past|previous) (?:12 months|year)\b|\bthis past year\b/, () => ({ kind: 'last-12' }));
  add(/\b(?:since|from) (jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?: (\d{4}))?\b(?! to| through| until| -)/, (m) => {
    const mo = MONTHS.find(([re]) => re.test(m[1]))![1];
    const p = monthPeriod(mo, m[2], t);
    return { kind: 'custom', from: `${p.month}-01`, to: t };
  });
  add(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?: (\d{4}))?\b/, (m) => {
    if (m[1] === 'may' && !/\b(in|of|for|during|since|vs|versus) may\b|\bmay \d{4}\b|\bmay vs\b|\bmay and\b/.test(q)) return null; // "may" the word
    if (/^(mar|dec|sep|jan|oct|nov|aug|feb|apr)$/.test(m[1]) && !/\b(in|of|for|during|vs|versus|and|since) /.test(q.slice(Math.max(0, m.index! - 9), m.index!)) && q.split(' ').length > 3 && !m[2]) {
      // short forms like "mar" only count next to "in/of/for/vs" (avoid shop names)
      return null;
    }
    return monthPeriod(MONTHS.find(([re]) => re.test(m[1]))![1], m[2], t);
  });
  add(/\bthis month\b|\bso far this month\b|\bmonth to date\b/, () => ({ kind: 'this-month' }));
  add(/\b(?:last|previous|past) month\b/, () => ({ kind: 'last-month' }));
  add(/\bthis year\b|\bso far this year\b|\byear to date\b|\bytd\b/, () => ({ kind: 'this-year' }));
  add(/\blast year\b/, () => ({ kind: 'last-year' }));
  add(/\bthis week\b/, () => ({ kind: 'this-week' }));
  add(/\b(?:last|previous|past) week\b/, () => ({ kind: 'last-week' }));
  add(/\byesterday\b/, () => ({ kind: 'yesterday' }));
  add(/\btoday\b/, () => ({ kind: 'today' }));
  add(/\b(20\d\d)\b/, (m) => (q.slice(Math.max(0, m.index! - 12), m.index!).match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* $/) ? null : { kind: 'custom', from: `${m[1]}-01-01`, to: `${m[1]}-12-31` }));
  // "vs last" / "vs the month before" right after a period = the period before (the default comparison)
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The free question reader: periods (this/last month, last N months, month names, this year, this/last week,
 * yesterday), categories (+ everyday words, "food" = Groceries + Eating out), people's names, shops and receipt
 * items you have, compare/vs, top, average, "over $50". `understood` = false → nothing it knows (then the AI may help).
 */
export function parseQuestion(question: string, ctx: ParseCtx): Parsed {
  const t = ctx.today;
  let q = ` ${norm(question).replace(/'s\b/g, '')} `;
  const parts: string[] = [];
  const f: ReportFilter = { ...NO_FILTER, period: { kind: 'this-month' }, cats: [], sources: [] };
  let focus: Focus = 'total';
  let known = false;
  const eat = (re: RegExp) => { q = q.replace(re, ' '); };

  // amounts: "over $50", "more than 100", "at least 20"
  const amt = q.match(/\b(?:over|above|more than|at least|bigger than|greater than|min(?:imum)?)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/) ?? question.match(/(?:>|≥)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (amt) { f.min = Number(amt[1]); known = true; parts.push('amount'); eat(/\b(over|above|more than|at least|bigger than|greater than|min(imum)?)\s*\$?\s*\d+(\.\d{1,2})?\b/); }

  // periods (first = the report's, a second = what to compare with)
  const ps = periodsIn(q, t);
  if (ps.length) { f.period = ps[0].p; known = true; parts.push('period'); }
  if (ps.length > 1) { f.vs = ps[1].p; focus = 'compare'; }
  for (const p of [...ps].sort((a, b) => b.at - a.at)) q = q.slice(0, p.at) + ' '.repeat(p.len) + q.slice(p.at + p.len);

  if (/\b(compare|comparison|vs|versus|against|than last|than the)\b/.test(q)) { focus = 'compare'; known = true; }
  if (/\b(top|biggest|most|largest|highest|where do i spend|where did i spend)\b/.test(q)) { focus = focus === 'compare' ? focus : 'top'; known = true; }
  if (/\b(average|avg|per month|a month on average|typical|usual)\b/.test(q)) { focus = 'average'; known = true; }

  // people: their names ("Roza", "Roza's"); "both"/"everyone"/"we" = all
  for (const p of ctx.people) {
    const re = new RegExp(`\\b${norm(p.name).replace(/[^a-z0-9 ]/g, '')}\\b`);
    if (p.name && re.test(q)) { f.person = p.email; known = true; parts.push('person'); eat(re); break; }
  }

  // shops and items you have (longest names first, so "whole foods" wins over "food")
  const shopWords = new Map<string, string>(); // a word or two from a shop name → that word
  for (const s of ctx.shops) {
    const w = norm(s).replace(/\b(sq|tst|pos|debit|purchase|card|www|com|inc|llc|the|\d+)\b/g, ' ').split(' ').filter((x) => x.length >= 3 && !STOP.has(x));
    if (w[0]) shopWords.set(w[0], w[0]);
    if (w[0] && w[1]) shopWords.set(`${w[0]} ${w[1]}`, `${w[0]} ${w[1]}`);
  }
  for (const it of ctx.items ?? []) { const w = norm(it).split(' ').filter((x) => x.length >= 4 && !STOP.has(x)); for (const x of w) if (!shopWords.has(x)) shopWords.set(x, x); }
  const singular = (w: string) => w.replace(/(?<=[a-z]{3})(es|s)$/, '');
  const known2 = [...shopWords.keys()].sort((a, b) => b.length - a.length);
  const words = q.split(' ').filter(Boolean);
  for (let i = 0; i < words.length && !f.shop; i++) {
    for (const k of known2) {
      const n = k.split(' ').length;
      const got = words.slice(i, i + n).join(' ');
      if (got === k || (n === 1 && got.length >= 4 && (singular(got) === singular(k) || got === `${k}s` || got === `${k}es`))) { f.shop = k; known = true; parts.push('shop'); eat(new RegExp(`\\b${got}\\b`)); break; }
    }
  }

  // categories: their names and everyday words
  const cats = new Set<string>();
  if (FOOD.some((w) => new RegExp(`\\b${w}\\b`).test(q)) && !/\beating out\b/.test(q)) { cats.add('groceries'); cats.add('dining'); eat(/\b(food|foods|eating)\b/g); }
  for (const c of SPEND_CATS) {
    for (const w of [norm(c.label), ...CAT_WORDS[c.id] ?? []].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b${norm(w)}\\b`, 'g');
      if (re.test(q)) { cats.add(c.id); eat(re); }
    }
  }
  if (cats.size) { f.cats = [...cats]; known = true; parts.push('category'); }

  // sources
  if (/\breceipts?\b/.test(q) && /\b(from|with|only)\b/.test(q)) { f.sources = ['receipt']; known = true; eat(/\breceipts?\b/g); }
  if (/\bcsv\b/.test(q)) { f.sources = ['csv']; known = true; eat(/\bcsv\b/g); }
  if (/\bbank alerts?\b/.test(q)) { f.sources = ['alert']; known = true; eat(/\bbank alerts?\b/g); }

  const spendWords = /\b(spend|spent|spending|cost|costs|paid|pay|bought|buy|purchases?|total)\b/.test(q);
  // words left that mean something (not small words): a thing it doesn't know, like "lattes"
  const left = q.split(' ').filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !NUM_WORDS[w] && !['both', 'everyone', 'everybody', 'together', 'family'].includes(w));
  const understood = known ? !(left.length && !f.cats.length && !f.shop && f.person === 'all') || focus !== 'total' : spendWords && !left.length;
  return { filter: f, focus, understood, parts };
}
