/**
 * 📧 Bank alert emails ("You made a $15.49 purchase at NETFLIX"): turned into transactions with free patterns
 * (no AI). Works for Bank of America, Capital One and SoFi, and most other banks' purchase alerts.
 * Plain TypeScript (no Deno/browser APIs): used by the server and by the Guide's example.
 */
export interface AlertMail { from: string; subject: string; text: string; date: string } // date = when the email arrived (YYYY-MM-DD)
export interface AlertTx { bank: string; amount: number; merchant: string; posted: string; account: string }

const BANKS: { re: RegExp; name: string }[] = [
  { re: /bankofamerica\.com|bofa/i, name: 'Bank of America' },
  { re: /capitalone\.com|capital one/i, name: 'Capital One' },
  { re: /sofi\.(com|org)|\bsofi\b/i, name: 'SoFi' },
  { re: /chase\.com/i, name: 'Chase' },
  { re: /wellsfargo\.com/i, name: 'Wells Fargo' },
  { re: /citi(bank)?\.com/i, name: 'Citi' },
  { re: /americanexpress\.com|aexp/i, name: 'Amex' },
  { re: /discover\.com/i, name: 'Discover' },
  { re: /usbank\.com/i, name: 'U.S. Bank' },
  { re: /paypal\.com|\bpaypal\b/i, name: 'PayPal' },
];
export const bankOf = (from: string) => BANKS.find((b) => b.re.test(from))?.name ?? null;

/** Gmail search for purchase alerts from these banks (and alert-looking emails from any bank). */
export const ALERT_QUERY = '(from:(bankofamerica.com OR capitalone.com OR sofi.com OR sofi.org OR chase.com OR wellsfargo.com OR citi.com OR americanexpress.com OR discover.com OR usbank.com) (transaction OR purchase OR charge OR charged OR spent OR alert)) OR (from:paypal.com "you paid") OR subject:("transaction alert" OR "purchase alert" OR "you made a purchase" OR "new transaction")';

// Money coming IN, payments TO the card, or security notices: not purchases.
const NOT_PURCHASE = /\b(refund|credit(ed)? to your|deposit|direct deposit|payment (received|posted|scheduled)|thank you for your payment|transfer (received|from)|password|sign[- ]?in|verification code|security alert|new device|statement is (ready|available)|balance (is|alert)|low balance)\b/i;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function toDay(s: string, fallback: string): string {
  const t = s.trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m![1].toLowerCase().slice(0, 3)));
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return fallback;
}
const money = (s: string) => Number(s.replace(/[$,\s]/g, ''));
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s:*-]+|[\s.,;*]+$/g, '').trim();

/** The purchase in a bank alert email, or null if it isn't one (or can't be read for sure). */
export function parseBankAlert(m: AlertMail): AlertTx | null {
  const bank = bankOf(`${m.from} ${m.subject}`) ?? 'Bank';
  const all = `${m.subject}\n${m.text}`.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  if (NOT_PURCHASE.test(m.subject) || (NOT_PURCHASE.test(all) && !/(purchase|transaction|charged|spent)/i.test(m.subject))) return null;

  // Amount: labelled first ("Amount: $15.49"), then common sentences.
  // PayPal: "You paid $19.99 USD to Netflix.com".
  const pp = all.match(/you (?:paid|sent) \$\s?([\d,]+\.\d{2})(?: USD)? to ([^\n]{2,60}?)(?:\s*(?:\n|merchant\b|$))/i);
  const amt = (pp ? [pp[0], pp[1]] as unknown as RegExpMatchArray : null)
    ?? all.match(/amount\s*[:\-]?\s*\$\s?([\d,]+\.\d{2})/i)
    ?? all.match(/in the amount of \$\s?([\d,]+\.\d{2})/i)
    ?? all.match(/(?:purchase|transaction|charge|payment) (?:of|for) \$\s?([\d,]+\.\d{2})/i)
    ?? all.match(/(?:spent|charged|used your [\w\s]{0,30}?card for) \$\s?([\d,]+\.\d{2})/i)
    ?? all.match(/\$\s?([\d,]+\.\d{2}) (?:purchase|transaction|charge|at |with |was )/i);
  if (!amt) return null;
  const amount = money(amt[1]);
  if (!(amount > 0) || amount > 100000) return null;

  // Merchant: labelled ("Where: NETFLIX.COM", "Merchant: …"), then "at NETFLIX.COM, a pending…", "at NETFLIX on …".
  const mer = (pp ? [pp[0], pp[2]] as unknown as RegExpMatchArray : null) ?? all.match(/(?:where|merchant(?: name)?|description|at merchant)\s*:\s*([^\n]{2,60})/i)
    ?? all.match(/\bat ([A-Z0-9][^\n,]{1,50}?)(?:,| on | for | was | using | with your|\.\s|\n)/)
    ?? all.match(/\bwith ([A-Z0-9][^\n,]{1,50}?)(?:,| on | for | was |\.\s|\n)/);
  const merchant = mer ? clean(mer[1]) : '';
  if (!merchant || merchant.length < 2 || /^(your|the|a|an)\b/i.test(merchant)) return null;

  // Date: labelled, then "on March 5, 2026", else the day the email arrived.
  const dt = all.match(/(?:date|transaction date|posted)\s*:\s*([^\n]{6,30})/i) ?? all.match(/transaction date\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i) ?? all.match(/\bon ((?:[A-Za-z]{3,9}\.? \d{1,2},? \d{4})|(?:\d{1,2}\/\d{1,2}\/\d{2,4}))/);
  const posted = dt ? toDay(dt[1], m.date) : m.date;

  const last4 = all.match(/(?:ending in|ending|account ending|card ending|ending with|x{2,}|\*{2,})\s*:?\s*(\d{4})\b/i)?.[1];
  return { bank, amount, merchant: merchant.slice(0, 80), posted, account: `${bank}${last4 ? ` …${last4}` : ''}` };
}
