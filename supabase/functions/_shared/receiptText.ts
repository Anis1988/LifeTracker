import { merchantKey } from './recurring.ts';
import { classifyAttachment, type Route } from './vaultText.ts';

/**
 * 🧾 Receipts → Spending, shared by the app and the server (plain TypeScript, no AI):
 *  - `emailKind`: is an email a receipt (→ Spending), a product order (→ Returns, for the return window), a bill
 *    (→ Bills, by the morning bill reader), or nothing (newsletter, ad, shipping update)?
 *  - `parseReceipt`: the business and the total read from a plain receipt email with free patterns (the AI only
 *    when these can't find a clear total);
 *  - `sameSpend`: is a receipt the same purchase as a bank line (amount ±$0.01, ±3 days, a similar shop name)?
 *    Used both ways, so a purchase is counted once whichever arrives first.
 */
export interface MailLike { subject: string; from: string; text: string; date: string; listUnsub?: string; attachments?: { filename: string; mime: string; size: number; inline: boolean }[] }
export type EmailKind = 'receipt' | 'order' | 'bill' | null;

/** Gmail search for receipt emails (subject or body words, or a file named receipt / invoice). Free. */
export const RECEIPT_QUERY = '-category:promotions -category:social -in:sent -in:chats -in:drafts (subject:(receipt OR "payment received" OR "payment confirmation" OR "thank you for your purchase" OR "thanks for your purchase" OR "your purchase" OR "you paid" OR "payment successful") OR "your receipt" OR "order total" OR "thank you for your purchase" OR "thanks for your purchase" OR "amount paid" OR "total charged" OR filename:receipt OR filename:invoice)';

const MARKETING = /(newsletter|% off|\bsale\b|\bdeals?\b|promo|webinar|digest|weekly update|new arrivals|last chance|don'?t miss|special offer|black friday|cyber monday|recommended for you|you might like|coupon)/i;
const SHIPPING = /(has shipped|have shipped|on its way|out for delivery|was delivered|been delivered|tracking number|arriving (today|tomorrow)|delivery update)/i;
const RECEIPT_WORDS = /(\breceipt\b|payment received|we received your payment|thank you for your purchase|thanks for your purchase|thank you for your payment|thanks for your payment|payment confirmation|payment successful|you paid|amount paid|total charged|order total|grand total|\btotal\b[^\n]{0,20}\$\s?\d)/i;
const ORDER_WORDS = /(order confirmation|order confirmed|your order|order (#|no\.?|number)|thanks for your order|thank you for your order|we('|’)ve received your order)/i;
const PRODUCT_WORDS = /(ship(s|ping|ped)?\b|deliver(y|ed)?|arriv(e|es|ing)|track (your )?(order|package)|return(s| policy| window| by)?\b|qty|quantity)/i;
const BILL_WORDS = /(payment due|amount due|due date|statement is ready|your (bill|statement) is|minimum payment|past due)/i;
const MONEY_RE = /(\$|usd|€|£)\s?\d|\d+\.\d{2}\s?(usd|\$)/i;

/** What kind of money email this is (free). Newsletters and shipping updates are nothing. */
export function emailKind(m: MailLike): EmailKind {
  const subj = m.subject ?? '';
  const body = (m.text ?? '').slice(0, 6000);
  const all = `${subj}\n${body}`;
  if (!MONEY_RE.test(all)) return null;
  if (SHIPPING.test(subj)) return null;
  const receiptSubj = RECEIPT_WORDS.test(subj);
  const orderSubj = ORDER_WORDS.test(subj);
  // Newsletters and ads: skipped unless the subject itself says receipt / order.
  if (MARKETING.test(subj) && !receiptSubj && !orderSubj) return null;
  if (m.listUnsub && !receiptSubj && !orderSubj) return null;
  if (BILL_WORDS.test(subj) && !/payment (received|confirmation|successful)|thank you for your payment/i.test(subj)) return 'bill';
  // A product order (shipping, a return window): Returns tracks it; the bank line or a receipt counts the money.
  if ((orderSubj || ORDER_WORDS.test(body)) && PRODUCT_WORDS.test(all) && !/\breceipt\b/i.test(subj)) return 'order';
  if (receiptSubj || RECEIPT_WORDS.test(body)) return 'receipt';
  if (orderSubj) return 'order';
  return null;
}

/** Where a whole email goes (used by the checks): a document attached → Vault, else its money kind. */
export function routeEmail(m: MailLike): 'spending' | 'returns' | 'vault' | 'inbox' | 'skip' {
  const files: Route[] = (m.attachments ?? []).map((a) => classifyAttachment({ subject: m.subject, from: m.from, filename: a.filename, mime: a.mime, size: a.size, text: m.text, listUnsub: m.listUnsub, inline: a.inline }));
  if (files.includes('vault')) return 'vault';
  const k = emailKind(m);
  if (k === 'receipt') return 'spending';
  if (k === 'order') return 'returns';
  if (k === 'bill') return 'inbox';
  if (files.includes('money')) return 'spending';
  return 'skip';
}

const GENERIC_SENDER = /^(no-?reply|do-?not-?reply|receipts?|payments?|billing|orders?|service|support|info|notifications?|hello|team|customer ?service|accounts?|mail|email)$/i;
/** "Joe's Coffee via Square" <receipts@squareup.com> → "Joe's Coffee"; a generic sender → its web address' name. */
export function businessOf(from: string): string {
  const name = from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  const clean = name.replace(/\s+(via|from|by)\s+(square|toast|clover|stripe|paypal|shopify|venmo).*$/i, '').replace(/\b(receipts?|payments?|billing|team|no-?reply)\b/gi, '').replace(/[|:–-]+\s*$/, '').trim();
  if (clean && !GENERIC_SENDER.test(clean) && !/@/.test(clean)) return clean.slice(0, 80);
  const dom = (from.match(/@([a-z0-9.-]+)/i)?.[1] ?? '').toLowerCase().split('.').filter((p) => !['mail', 'email', 'e', 'em', 'info', 'news', 'receipts', 'messaging', 'notifications', 'com', 'net', 'org', 'co', 'io', 'us'].includes(p));
  const w = dom[dom.length - 1] ?? '';
  return w ? w[0].toUpperCase() + w.slice(1) : '';
}

/** Platforms that send receipts for other businesses: the business name must come from the sender's name, not the address. */
const PLATFORM = /(squareup|square|toasttab|clover|stripe|paypal|shopify|venmo)\./i;

/** The total of a receipt email, free: "Total $23.45", "Amount paid: $23.45"… (never a subtotal, tax or tip). */
export function totalOf(text: string): number | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 400);
  const amt = (s: string) => { const m = s.match(/(?:\$|usd)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))|(\d{1,3}(?:,\d{3})*\.\d{2})\s?(?:usd)/i); const v = m ? Number((m[1] ?? m[2]).replace(/,/g, '')) : NaN; return v > 0 && v < 100000 ? v : null; };
  const strong = /(grand total|order total|total charged|amount charged|amount paid|total paid|you paid|payment amount|total amount|charged to)/i;
  for (let i = 0; i < lines.length; i++) if (strong.test(lines[i])) { const v = amt(lines[i]) ?? (lines[i + 1] ? amt(lines[i + 1]) : null); if (v) return v; }
  let last: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!/\btotal\b/i.test(lines[i]) || /sub\s?-?total|total (savings|saved|discount|tax)|tax|tip/i.test(lines[i])) continue;
    const v = amt(lines[i]) ?? (lines[i + 1] && !/\btotal\b/i.test(lines[i + 1]) ? amt(lines[i + 1]) : null);
    if (v) last = v;
  }
  return last;
}

/** What was read on a receipt (kept with its spending line, `transactions.details`). */
export interface ReceiptItem { name: string; qty: number | null; price: number | null }
export interface ReceiptDetails { store: string; date: string; total: number; tax: number | null; card: string | null; items: ReceiptItem[]; read: 'free' | 'ai' | 'hand'; by?: string | null;
  /** A receipt added to a bank purchase whose total isn't the bank's amount: kept = "use its items anyway" was picked. */
  mismatch?: { receipt: number; bank: number; kept: boolean } | null }

const TIP = /\b(tip|gratuity)\b/i;
/**
 * 📎 Does a receipt fit its bank purchase? Its total = the bank's amount (±$0.01), or the total plus a tip line written
 * on it (a tip added after the receipt was printed) = the amount.
 */
export function receiptFits(d: Pick<ReceiptDetails, 'total' | 'items'>, amount: number): boolean {
  const a = Math.abs(Number(amount));
  const near = (x: number) => Math.abs(x - a) <= 0.011;
  if (d.total > 0 && near(d.total)) return true;
  const tip = (d.items ?? []).filter((i) => TIP.test(i.name)).reduce((s, i) => s + (i.price ?? 0), 0);
  return tip > 0 && d.total > 0 && near(Math.round((d.total + tip) * 100) / 100);
}
/** The receipt's details as kept on a bank line: `mismatch` set when its total isn't the bank's (asked once, then kept). */
export function fitTo(d: ReceiptDetails, amount: number, kept = false): ReceiptDetails {
  return { ...d, mismatch: receiptFits(d, amount) ? null : { receipt: d.total, bank: Math.abs(Number(amount)), kept } };
}

const AMT = /(?:\$|usd)\s?(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+(?:\.\d{2}))|(-?\d{1,3}(?:,\d{3})*\.\d{2})\s?(?:usd)?\s*$/i;
const amtIn = (s: string) => { const m = s.match(AMT); const v = m ? Number((m[1] ?? m[2]).replace(/,/g, '')) : NaN; return Number.isFinite(v) && Math.abs(v) < 100000 ? v : null; };
const NOT_ITEM = /(total|tax|tip|gratuity|change|cash|card|visa|mastercard|amex|discover|balance|paid|payment|refund|savings|discount|fee due|due|points|reward|auth|approval|ending)/i;

/** The tax line of a receipt, free. */
export function taxOf(text: string): number | null {
  for (const l of text.split(/\n/)) if (/\b(sales )?tax\b/i.test(l) && !/before tax|pre-?tax|tax id|tax-?free/i.test(l)) { const v = amtIn(l); if (v != null && v >= 0) return v; }
  return null;
}
/** The card's last 4 ("Visa ending in 1234", "**** 1234"), free. */
export function cardOf(text: string): string | null {
  const m = text.match(/(?:ending (?:in|with)|ends in|\*{2,}\s?|x{3,}\s?|•{2,}\s?|…)\s?(\d{4})\b/i);
  return m ? m[1] : null;
}
/** The lines bought ("2 x Latte  $9.00", "Muffin ... 3.25"), free: lines with a name and a price that aren't totals. */
export function itemsOf(text: string): ReceiptItem[] {
  const out: ReceiptItem[] = [];
  for (const raw of text.split(/\n/).slice(0, 300)) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (l.length < 4 || l.length > 90 || NOT_ITEM.test(l)) continue;
    const price = amtIn(l);
    if (price == null || price <= 0) continue;
    let name = l.replace(AMT, '').replace(/[.:\-–\s]+$/, '').trim();
    let qty: number | null = null;
    const q = name.match(/^(\d{1,3})\s?(?:x|×|@)?\s+(.+)$/i) ?? name.match(/^(.+?)\s+(?:x|×)\s?(\d{1,3})$/i);
    if (q) { const [a, b] = /^\d/.test(q[1]) ? [q[1], q[2]] : [q[2], q[1]]; qty = Number(a); name = b; }
    if (!/[a-z]{2}/i.test(name) || /https?:|www\.|@/.test(name)) continue;
    out.push({ name: name.slice(0, 60), qty, price });
    if (out.length >= 40) break;
  }
  return out;
}

/** A plain receipt email read with free patterns; null when there's no clear total or business (then the AI may read it). */
export function parseReceipt(m: MailLike): (ReceiptDetails & { business: string; amount: number }) | null {
  const text = m.text ?? '';
  const amount = totalOf(text);
  let business = businessOf(m.from);
  if (PLATFORM.test(m.from) && GENERIC_SENDER.test(m.from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim())) business = ''; // "receipts@squareup.com": whose receipt?
  if (!amount || !business) return null;
  return { business, amount, store: business, date: m.date, total: amount, tax: taxOf(text), card: cardOf(text), items: itemsOf(text), read: 'free' };
}

/** 🔎 Search in Spending (on the device): shop, items on the receipt, amount, date, category, notes, the email it came from. */
export function matchSpend(t: { posted: string; amount: number; description: string | null; merchant: string | null; note?: string | null; account?: string | null; details?: Partial<ReceiptDetails> | null }, q: string, catLabel = ''): boolean {
  const words = q.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const d = t.details;
  const amt = Math.abs(Number(t.amount));
  const month = new Date(`${t.posted.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const hay = [t.description, t.merchant, t.note, t.account, catLabel, t.posted, month, amt.toFixed(2), String(amt), d?.store, d?.card, ...(d?.items ?? []).map((i) => i.name)]
    .filter(Boolean).join(' \n ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return words.every((w) => hay.includes(w.replace(/^\$/, '')));
}

// ---------- 🔁 the same purchase twice? ----------
const STOP = new Set(['the', 'and', 'inc', 'llc', 'ltd', 'co', 'corp', 'com', 'www', 'store', 'shop', 'market', 'online', 'usa', 'us', 'of', 'at', 'via', 'square', 'toast', 'paypal', 'receipt']);
const tokens = (s: string) => merchantKey(s).replace(/'/g, '').split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
/** Two shop names for the same place: "Joe's Coffee" ~ "SQ *JOES COFFEE 1234 SEATTLE WA", "Amazon" ~ "AMZN Mktp US". */
export function similarShop(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ka = merchantKey(a), kb = merchantKey(b);
  if (ka && kb && (ka === kb || ka.includes(kb) || kb.includes(ka))) return true;
  const ta = tokens(a), tb = tokens(b);
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const sa = squash(a), sb = squash(b);
  if (ta.some((w) => tb.includes(w) || sb.includes(w)) || tb.some((w) => sa.includes(w))) return true;
  return (/\bamzn\b|amazon/i.test(a) && /\bamzn\b|amazon/i.test(b));
}

const dayNum = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`) / 86400_000;
export interface SpendLine { posted: string; amount: number; description: string | null; merchant?: string | null }
/** Same purchase: same amount (±$0.01), within 3 days, similar shop. */
export function sameSpend(a: SpendLine, b: SpendLine): boolean {
  if (Math.abs(Math.abs(Number(a.amount)) - Math.abs(Number(b.amount))) > 0.011) return false;
  if (Math.abs(dayNum(a.posted) - dayNum(b.posted)) > 3) return false;
  return similarShop(a.description ?? a.merchant, b.description ?? b.merchant) || similarShop(a.merchant, b.merchant);
}
/** The closest matching line (by date), or undefined. */
export function bestMatch<T extends SpendLine>(want: SpendLine, list: T[]): T | undefined {
  return list.filter((x) => sameSpend(want, x)).sort((x, y) => Math.abs(dayNum(x.posted) - dayNum(want.posted)) - Math.abs(dayNum(y.posted) - dayNum(want.posted)))[0];
}

/** A receipt kept as an email (no file): `gmail:<message id>` opens the email in Gmail; `gmail:<id>|<address>` in that extra account. */
export function receiptLink(path: string): string | null {
  if (!path.startsWith('gmail:')) return null;
  const [id, who] = path.slice(6).split('|');
  return who ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(who)}#all/${id}` : `https://mail.google.com/mail/u/0/#all/${id}`;
}
