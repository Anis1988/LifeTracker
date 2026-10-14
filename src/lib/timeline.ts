import { apptKind, catOf, dateKind, type Appointment, type Item, type LifeDate, type Paper, type Purchase } from '../../supabase/functions/_shared/model.ts';
import { daysBetween, dueDates, today } from '../../supabase/functions/_shared/money.ts';
import { paperKind } from '../../supabase/functions/_shared/people.ts';
import { whenText } from '../../supabase/functions/_shared/apptText.ts';

/** 🗓️ Everything coming up, in one list: appointments, bills, trial ends, renewals, documents, important dates, return windows, warranties. */
export type Tone = 'bill' | 'warn' | 'date' | 'doc' | 'return' | 'appt';
export interface Moment { date: string; icon: string; title: string; sub: string; amount?: number; tone: Tone; itemId?: string; apptId?: string; time?: string }

const monthsLater = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

export function timeline(input: { items: Item[]; papers: Paper[]; dates: LifeDate[]; purchases: Purchase[]; appts?: Appointment[] }, days = 30, from = today()): Moment[] {
  const end = new Date(Date.parse(`${from}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
  const inRange = (d: string | null | undefined): d is string => !!d && d >= from && d <= end;
  const out: Moment[] = [];
  for (const i of input.items.filter((x) => x.status === 'active')) {
    for (const d of dueDates(i, from, end)) out.push({ date: d, icon: catOf(i.category).icon, title: i.name, sub: i.autopay ? 'Autopay' : 'Pay it yourself', amount: Number(i.amount), tone: 'bill', itemId: i.id });
    if (inRange(i.trial_ends)) out.push({ date: i.trial_ends, icon: '⏳', title: `${i.name}: free trial ends`, sub: `Cancel before to avoid ${Number(i.amount).toFixed(2)}`, tone: 'warn', itemId: i.id });
    if (inRange(i.ends_on)) out.push({ date: i.ends_on, icon: '🔁', title: `${i.name} renews or ends`, sub: 'Compare prices or cancel', tone: 'warn', itemId: i.id });
  }
  for (const p of input.papers) {
    if (inRange(p.expires)) out.push({ date: p.expires, icon: paperKind(p.kind).icon, title: `${p.name} expires`, sub: p.holder ?? 'Renew it', tone: 'doc' });
    const start = p.expires ? new Date(Date.parse(`${p.expires}T12:00:00Z`) - 90 * 86400_000).toISOString().slice(0, 10) : null;
    if (inRange(start)) out.push({ date: start, icon: paperKind(p.kind).icon, title: `Start renewing: ${p.name}`, sub: `Expires ${p.expires}`, tone: 'doc' });
  }
  for (const d of input.dates) {
    let n = d.next_date;
    for (let k = 0; k < 24 && n <= end; k++) {
      if (n >= from) out.push({ date: n, icon: dateKind(d.kind).icon, title: d.title, sub: d.every_months ? (d.every_months === 12 ? 'Every year' : `Every ${d.every_months} months`) : 'Once', tone: 'date' });
      if (!d.every_months) break;
      n = monthsLater(n, d.every_months);
    }
  }
  for (const p of input.purchases.filter((x) => x.status === 'keep' || x.status === 'kept')) {
    if (p.status === 'keep' && inRange(p.return_by)) out.push({ date: p.return_by, icon: '🧾', title: `Last day to return: ${p.store}`, sub: p.item ?? 'Keep it or return it', amount: p.amount ?? undefined, tone: 'return' });
    if (inRange(p.warranty_ends)) out.push({ date: p.warranty_ends, icon: '🛡️', title: `Warranty ends: ${p.store}`, sub: p.item ?? '', tone: 'return' });
  }
  for (const a of input.appts ?? []) {
    if (a.status === 'booked' && inRange(a.day)) out.push({ date: a.day, icon: apptKind(a.kind).icon, title: a.title, sub: [whenText(a).split(' · ')[1], a.place].filter(Boolean).join(' · '), tone: 'appt', apptId: a.id, time: a.time ?? '' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '~').localeCompare(b.time ?? '~') || a.title.localeCompare(b.title));
}

export const daysLeft = (d: string) => daysBetween(today(), d);
