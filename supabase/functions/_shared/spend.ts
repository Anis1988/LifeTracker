import type { ReceiptDetails } from './receiptText.ts';

/**
 * 💸 Spending: every purchase gets a spending category with free rules (shop names), no AI. You can move a shop to
 * another category (Settings.spend.rules, by shop). A month is compared with your usual month (the 3 before it).
 * Plain TypeScript: the app and the server both use it (Home, Money → Spending, budget heads-ups, Ask).
 */
export const SPEND_CATS: { id: string; icon: string; label: string }[] = [
  { id: 'groceries', icon: '🛒', label: 'Groceries' },
  { id: 'dining', icon: '🍽️', label: 'Eating out' },
  { id: 'gas', icon: '⛽', label: 'Gas' },
  { id: 'transport', icon: '🚕', label: 'Rides & parking' },
  { id: 'shopping', icon: '🛍️', label: 'Shopping' },
  { id: 'home', icon: '🔨', label: 'Home & garden' },
  { id: 'health', icon: '💊', label: 'Health & pharmacy' },
  { id: 'fun', icon: '🎬', label: 'Fun & hobbies' },
  { id: 'travel', icon: '✈️', label: 'Travel' },
  { id: 'personal', icon: '💇', label: 'Personal care' },
  { id: 'bills', icon: '📋', label: 'Bills & subscriptions' },
  { id: 'transfers', icon: '🔁', label: 'Transfers & cash' },
  { id: 'other', icon: '📦', label: 'Other' },
];
export const spendCat = (id: string) => SPEND_CATS.find((c) => c.id === id) ?? SPEND_CATS[SPEND_CATS.length - 1];

// First match wins: more specific shops before broad words.
const RULES: [RegExp, string][] = [
  [/\b(venmo|zelle|cash app|paypal \*?transfer|atm|withdrawal|transfer)\b/i, 'transfers'],
  [/\b(uber eats|doordash|grubhub|postmates|seamless|instacart)\b/i, 'dining'],
  [/\b(uber|lyft|parking|parkmobile|toll|e-?zpass|sunpass|metro|transit|mta|bart|amtrak)\b/i, 'transport'],
  [/\b(shell|exxon|mobil|chevron|bp|sunoco|marathon|speedway|wawa|sheetz|circle k|valero|citgo|arco|racetrac|quiktrip|costco gas|sam'?s club fuel|fuel|gas station)\b/i, 'gas'],
  [/\b(kroger|publix|safeway|aldi|whole foods|trader joe'?s|wegmans|h-?e-?b|meijer|food lion|giant|stop & shop|sprouts|winn-?dixie|albertsons|vons|ralphs|harris teeter|wal-?mart|walmart|costco|sam'?s club|bj'?s|grocery|market|supermarket)\b/i, 'groceries'],
  [/\b(starbucks|dunkin|mcdonald'?s|chick-?fil-?a|chipotle|subway|taco bell|wendy'?s|burger king|domino'?s|pizza|panera|cafe|coffee|restaurant|grill|kitchen|bar & grill|sushi|bistro|diner|bakery|eatery)\b/i, 'dining'],
  [/\b(cvs|walgreens|rite aid|pharmacy|clinic|hospital|medical|dental|dentist|doctor|urgent care|optical|vision|labcorp|quest diag)\b/i, 'health'],
  [/\b(home depot|lowe'?s|ikea|wayfair|ace hardware|menards|bed bath|hardware|nursery|garden)\b/i, 'home'],
  [/\b(delta|united|american air|southwest|jetblue|spirit|frontier|alaska air|airline|airbnb|vrbo|marriott|hilton|hyatt|ihg|holiday inn|hotel|expedia|booking\.com|hertz|enterprise rent|avis|budget rent)\b/i, 'travel'],
  [/\b(amc|regal|cinemark|ticketmaster|stubhub|steam|playstation|xbox|nintendo|bowling|golf|museum|theater|theatre|concert|live nation)\b/i, 'fun'],
  [/\b(salon|barber|spa|nails|sephora|ulta|massage|gym|fitness|planet fitness|la fitness)\b/i, 'personal'],
  [/\b(netflix|spotify|hulu|disney|hbo|max\.com|apple\.com\/bill|google \*|youtube|prime video|audible|icloud|xfinity|comcast|spectrum|verizon|at&t|att\b|t-?mobile|duke energy|electric|power|water|insurance|geico|state farm|progressive|allstate|mortgage|loan|rent)\b/i, 'bills'],
  [/\b(amazon|amzn|target|best buy|apple store|ebay|etsy|tj ?maxx|marshalls|ross|kohl'?s|macy'?s|nordstrom|old navy|gap|nike|shein|temu|dollar tree|dollar general|five below)\b/i, 'shopping'],
];

/** The spending category of one purchase: your own rule for that shop first, then a bill it matches, then the shop name. */
export function categorize(tx: { description: string | null; merchant: string | null; item_id?: string | null }, rules: Record<string, string> = {}): string {
  const key = tx.merchant ?? '';
  if (key && rules[key]) return rules[key];
  if (tx.item_id) return 'bills';
  const text = `${tx.description ?? ''} ${key}`;
  return RULES.find(([re]) => re.test(text))?.[1] ?? 'other';
}

export interface SpendTx {
  posted: string; amount: number; description: string | null; merchant: string | null; item_id?: string | null;
  // 🧾 receipts (Money → Spending): the receipt file (or gmail:<id>), where the line came from, "From email: …"
  id?: string; account?: string | null; source?: 'bank' | 'alert' | 'csv' | 'receipt'; receipt_path?: string | null; note?: string | null; details?: ReceiptDetails | null;
}
export interface SpendReport {
  month: string; // YYYY-MM
  total: number;
  usual: number | null; // average of the months before (up to 3) that have purchases
  soFarUsual: number | null; // a usual month up to the same day
  byCat: { id: string; amount: number; usual: number | null }[];
  top: { key: string; name: string; amount: number; cat: string; count: number }[];
  count: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (d: string) => d.slice(0, 7);
const prevMonth = (m: string, n: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 - n, 1)); return d.toISOString().slice(0, 7); };

/** Money out in one month (default: this one), by category and shop, against a usual month. Transfers are left out of the total. */
export function spendReport(tx: SpendTx[], rules: Record<string, string> = {}, month = new Date().toISOString().slice(0, 7), dayOfMonth = Number(new Date().toISOString().slice(8, 10))): SpendReport {
  const out = tx.filter((t) => Number(t.amount) < 0);
  const cat = new Map<SpendTx, string>(out.map((t) => [t, categorize(t, rules)]));
  const counted = out.filter((t) => cat.get(t) !== 'transfers');
  const inMonth = (m: string) => counted.filter((t) => monthOf(t.posted) === m);
  const sum = (list: SpendTx[]) => r2(list.reduce((a, t) => a - Number(t.amount), 0));
  const cur = inMonth(month);
  const before = [1, 2, 3].map((n) => inMonth(prevMonth(month, n))).filter((l) => l.length);
  const usual = before.length ? r2(before.reduce((a, l) => a + sum(l), 0) / before.length) : null;
  const soFarUsual = before.length ? r2(before.reduce((a, l) => a + sum(l.filter((t) => Number(t.posted.slice(8, 10)) <= dayOfMonth)), 0) / before.length) : null;
  const byCat = SPEND_CATS.filter((c) => c.id !== 'transfers').map((c) => ({
    id: c.id,
    amount: sum(cur.filter((t) => cat.get(t) === c.id)),
    usual: before.length ? r2(before.reduce((a, l) => a + sum(l.filter((t) => cat.get(t) === c.id)), 0) / before.length) : null,
  })).filter((c) => c.amount > 0 || (c.usual ?? 0) > 0).sort((a, b) => b.amount - a.amount);
  const shops = new Map<string, { key: string; name: string; amount: number; cat: string; count: number }>();
  for (const t of cur) {
    const key = t.merchant || (t.description ?? 'other').toLowerCase();
    const s = shops.get(key) ?? { key, name: (t.description ?? key).replace(/\s+/g, ' ').trim().slice(0, 40), amount: 0, cat: cat.get(t)!, count: 0 };
    s.amount = r2(s.amount - Number(t.amount));
    s.count++;
    shops.set(key, s);
  }
  return { month, total: sum(cur), usual, soFarUsual, byCat, top: [...shops.values()].sort((a, b) => b.amount - a.amount).slice(0, 12), count: cur.length };
}

/** 🧾 Usual return windows (days) of big stores, used when the receipt doesn't say. Always check the store's own policy. */
export const RETURN_DAYS: [RegExp, number][] = [
  [/amazon|amzn/i, 30], [/walmart/i, 90], [/target/i, 90], [/costco/i, 90], [/best ?buy/i, 15], [/apple/i, 14],
  [/home ?depot/i, 90], [/lowe'?s/i, 90], [/ikea/i, 180], [/wayfair/i, 30],
];
export const returnDaysFor = (store: string) => RETURN_DAYS.find(([re]) => re.test(store))?.[1] ?? null;
