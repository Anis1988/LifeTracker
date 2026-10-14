import { CYCLES, type Cycle, type Item } from './model.ts';

/** Dates as plain "YYYY-MM-DD" (no time zone surprises). */
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parseDay = (s: string) => new Date(`${s}T12:00:00Z`);
/** Today on this device's calendar (the phone's local day; the server runs in UTC, so it gets the UTC day). */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Today in a given time zone (server side: appointments are in the owner's time zone). */
export const todayIn = (timeZone: string) => { try { return new Date().toLocaleDateString('en-CA', { timeZone }); } catch { return today(); } };
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400_000);

/** `want` = the day of the month to aim for (a bill due on the 31st stays on the 31st, or the month's last day). */
export function addCycle(day: string, cycle: Cycle, times = 1, want?: number): string {
  const d = parseDay(day);
  if (cycle === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * times);
  else if (cycle === 'biweekly') d.setUTCDate(d.getUTCDate() + 14 * times);
  else {
    const months = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12, once: 0 }[cycle] * times;
    const aim = want ?? d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    // The 31st in a 30-day month: the last day of that month.
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(aim, last));
  }
  return iso(d);
}

type Due = Pick<Item, 'next_due' | 'cycle'> & { details?: { dueDay?: number } | null };
const lastDay = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();
/**
 * The day of the month a bill is really due: usually next_due's day; a bill due on the 29th–31st that was moved to a
 * shorter month's last day (Feb 28) keeps its real day in details.dueDay, so it goes back to the 31st afterwards.
 */
export function dueDayOf(item: Due): number | undefined {
  if (!item.next_due) return undefined;
  const d = Number(item.next_due.slice(8, 10));
  const want = item.details?.dueDay;
  return want && want > d && want <= 31 && d === lastDay(item.next_due) ? want : d;
}

/** The next due date on or after `from` (rolls an old due date forward by its cycle, keeping its day of the month). */
export function nextDue(item: Due, from = today()): string | null {
  if (!item.next_due) return null;
  if (item.cycle === 'once') return item.next_due;
  const want = dueDayOf(item);
  let d = item.next_due;
  for (let k = 1; k <= 1000 && d < from; k++) d = addCycle(item.next_due, item.cycle, k, want);
  return d;
}

export const perYear = (c: Cycle) => CYCLES.find((x) => x.id === c)?.perYear ?? 0;
/** What it costs per month on average (a yearly $120 = $10/month). */
export const monthly = (i: Pick<Item, 'amount' | 'cycle'>) => (Number(i.amount) * perYear(i.cycle)) / 12;

/** Every due date between two days (for the "next 30 days" list and the calendar). */
export function dueDates(item: Due, from: string, to: string): string[] {
  const first = nextDue(item, from);
  if (!first || first < from) return []; // a one-time bill already past
  if (item.cycle === 'once') return first <= to ? [first] : [];
  const want = dueDayOf(item);
  const out: string[] = [];
  for (let n = 0; out.length < 60; n++) {
    const d = n ? addCycle(first, item.cycle, n, want) : first;
    if (d > to) break;
    out.push(d);
  }
  return out;
}

export function money(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

// ---------- 🏠 mortgage / loans ----------
export interface Amortization { months: number; payoff: string; interest: number; payment: number; schedule: { month: string; balance: number; interest: number; principal: number }[] }

/** Monthly principal + interest payment for a loan. */
export function loanPayment(balance: number, ratePct: number, months: number): number {
  const r = ratePct / 100 / 12;
  if (!r) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

/** Pays the balance down month by month (with an optional extra each month) until it is gone. */
export function amortize(balance: number, ratePct: number, payment: number, extra = 0, start = today()): Amortization {
  const r = ratePct / 100 / 12;
  let bal = balance;
  let interest = 0;
  let m = 0;
  const schedule: Amortization['schedule'] = [];
  while (bal > 0.005 && m < 1200) {
    const int = bal * r;
    const pay = Math.min(bal + int, payment + extra);
    if (pay <= int) break; // the payment doesn't even cover the interest
    bal = bal + int - pay;
    interest += int;
    m++;
    schedule.push({ month: addCycle(start, 'monthly', m).slice(0, 7), balance: Math.max(0, bal), interest: int, principal: pay - int });
  }
  return { months: m, payoff: addCycle(start, 'monthly', m), interest, payment, schedule };
}
