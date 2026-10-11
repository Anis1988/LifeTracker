import type { Category, Cycle, Item } from './model.ts';
import { addCycle, daysBetween } from './money.ts';

/**
 * 🔁 Finding bills in bank transactions, with free rules (no AI): the same company charging a similar amount at a
 * steady rhythm (every week, month, quarter, year…) is a recurring payment.
 */
export interface Tx { id?: string; posted: string; amount: number; description: string; merchant?: string | null }

const NOISE = /\b(pos|ach|debit|credit|purchase|payment|pmt|recurring|autopay|auto pay|online|web|www|com|inc|llc|ltd|co|corp|card|visa|mastercard|checkcard|chk|ppd|id|ref|des|indn|sq|tst|pp|paypal|ext|withdrawal|bill pay|billpay|transfer to)\b/g;
/** "NETFLIX.COM 866-579-7172 CA" -> "netflix"; "SQ *BLUE BOTTLE 1234" -> "blue bottle". */
export function merchantKey(description: string): string {
  const s = description.toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*#]/g, ' ')
    .replace(/\.(com|net|org|co|io|tv)\b/g, ' ')
    .replace(/\d[\d\-/ ]{3,}/g, ' ') // phone numbers, dates, card digits, store numbers
    .replace(/\b[a-z]{2}\s*$/g, ' ') // trailing state code
    .replace(NOISE, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.split(' ').filter((w) => w.length > 1).slice(0, 3).join(' ') || description.toLowerCase().trim().slice(0, 30);
}

const RHYTHMS: { cycle: Cycle; days: number; slack: number }[] = [
  { cycle: 'weekly', days: 7, slack: 2 },
  { cycle: 'biweekly', days: 14, slack: 3 },
  { cycle: 'monthly', days: 30.4, slack: 5 },
  { cycle: 'quarterly', days: 91, slack: 10 },
  { cycle: 'semiannual', days: 182, slack: 15 },
  { cycle: 'yearly', days: 365, slack: 20 },
];

export interface Recurring {
  key: string; name: string; cycle: Cycle; amount: number; lastDate: string; nextDue: string; count: number;
  charges: { date: string; amount: number }[]; category: Category; priceChange?: { from: number; to: number; date: string };
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** Known names → category (free guess; you can change it). */
const KNOWN: [RegExp, Category][] = [
  [/netflix|spotify|hulu|disney|hbo|max\b|youtube|apple|icloud|google (one|storage)|amazon prime|prime video|paramount|peacock|audible|kindle|dropbox|adobe|microsoft|office|chatgpt|openai|claude|anthropic|patreon|nyt|new york times|wsj|substack|duolingo|playstation|xbox|nintendo|steam|crunchyroll|siriusxm/, 'subscription'],
  [/mortgage|home loan|rocket|mr cooper|wells fargo home|chase home|loancare|newrez|freedom mortgage/, 'mortgage'],
  [/geico|state farm|progressive|allstate|liberty mutual|usaa|farmers|nationwide|insurance|lemonade|metlife|aflac|travelers/, 'insurance'],
  [/electric|energy|power|gas co|water|sewer|utility|duke|pg e|con ed|edison|national grid|xcel|dominion|trash|waste/, 'utility'],
  [/verizon|t mobile|tmobile|at t|att|mint mobile|visible|cricket|google fi|boost/, 'phone'],
  [/comcast|xfinity|spectrum|cox|frontier|fios|centurylink|starlink|optimum|internet/, 'internet'],
  [/gym|fitness|planet|equinox|peloton|ymca|costco|sam s club|membership|aaa/, 'membership'],
  [/loan|sallie|navient|nelnet|sofi|lending|toyota financial|honda financial|ally|auto finance/, 'loan'],
  [/rent|apartment|property|leasing/, 'rent'],
];
export function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  return KNOWN.find(([re]) => re.test(n))?.[1] ?? 'other';
}
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Groups money-out transactions by company and keeps the ones that repeat at a steady rhythm. */
export function findRecurring(txs: Tx[], minCharges = 2): Recurring[] {
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (!(t.amount < 0)) continue; // only money going out
    const k = t.merchant || merchantKey(t.description);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.posted.localeCompare(b.posted));
    // The same amount band: most charges within 25% of the typical one (a price change is fine).
    const amounts = sorted.map((t) => -t.amount);
    const typical = median(amounts);
    const steady = sorted.filter((t) => Math.abs(-t.amount - typical) <= Math.max(1, typical * 0.25));
    if (steady.length < minCharges) continue;
    const gaps = steady.slice(1).map((t, i) => daysBetween(steady[i].posted, t.posted)).filter((g) => g > 0);
    if (!gaps.length) continue;
    const gap = median(gaps);
    const rhythm = RHYTHMS.find((r) => Math.abs(gap - r.days) <= r.slack);
    if (!rhythm) continue;
    // Most gaps must fit the rhythm (a coffee shop visited "about monthly" by chance doesn't count).
    const fits = gaps.filter((g) => Math.abs(g - rhythm.days) <= rhythm.slack * 1.5).length;
    if (fits / gaps.length < 0.7) continue;
    const last = steady[steady.length - 1];
    // Stopped: no charge for more than 2 rhythms → probably cancelled.
    if (daysBetween(last.posted, new Date().toISOString().slice(0, 10)) > rhythm.days * 2 + rhythm.slack) continue;
    const lastAmount = -last.amount;
    const prev = steady.length >= 2 ? -steady[steady.length - 2].amount : lastAmount;
    out.push({
      key, name: titleCase(key), cycle: rhythm.cycle, amount: Math.round(lastAmount * 100) / 100, lastDate: last.posted,
      nextDue: addCycle(last.posted, rhythm.cycle), count: steady.length, category: guessCategory(key),
      charges: steady.slice(-6).map((t) => ({ date: t.posted, amount: -t.amount })),
      ...(Math.abs(lastAmount - prev) >= 0.01 && Math.abs(lastAmount - prev) / prev >= 0.02 ? { priceChange: { from: prev, to: lastAmount, date: last.posted } } : {}),
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** Is this transaction a charge of that bill? (the bank name you saved, or the bill's name) */
export function matchesItem(item: Pick<Item, 'merchant' | 'name'>, key: string): boolean {
  const k = key.toLowerCase();
  const m = (item.merchant ?? '').toLowerCase().trim();
  if (m && (k === m || k.includes(m) || m.includes(k))) return true;
  const n = merchantKey(item.name);
  return !!n && n.length >= 4 && (k.includes(n) || n.includes(k));
}
