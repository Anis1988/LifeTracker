import { apptKind, catOf, dateKind, type Appointment, type Item, type LifeDate, type Paper, type Purchase } from '../../supabase/functions/_shared/model.ts';
import { addCycle, daysBetween, dueDates, today } from '../../supabase/functions/_shared/money.ts';
import { docIcon } from '../../supabase/functions/_shared/vaultText.ts';
import { whenText } from '../../supabase/functions/_shared/apptText.ts';
import type { MailSrc } from '../../supabase/functions/_shared/mailPeople.ts';

/** 🗓️ Everything coming up, in one list: appointments, bills, trial ends, renewals, documents, important dates, return windows, warranties. */
export type Tone = 'bill' | 'warn' | 'date' | 'doc' | 'return' | 'appt';
export interface Moment { date: string; icon: string; title: string; sub: string; amount?: number; tone: Tone; itemId?: string; apptId?: string; docId?: string; time?: string; src?: MailSrc } // src = 👥 what it was found in (the person chip)

const monthsLater = (d: string, n: number) => addCycle(d, 'monthly', n);

export function timeline(input: { items: Item[]; papers: Paper[]; dates: LifeDate[]; purchases: Purchase[]; appts?: Appointment[] }, days = 30, from = today()): Moment[] {
  const end = new Date(Date.parse(`${from}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
  const inRange = (d: string | null | undefined): d is string => !!d && d >= from && d <= end;
  const out: Moment[] = [];
  for (const i of input.items.filter((x) => x.status === 'active')) {
    const src = i.source === 'email' ? i : undefined;
    for (const d of dueDates(i, from, end)) out.push({ date: d, icon: catOf(i.category).icon, title: i.name, sub: i.autopay ? 'Autopay' : 'Pay it yourself', amount: Number(i.amount), tone: 'bill', itemId: i.id, src });
    if (inRange(i.trial_ends)) out.push({ date: i.trial_ends, icon: '⏳', title: `${i.name}: free trial ends`, sub: `Cancel before to avoid ${Number(i.amount).toFixed(2)}`, tone: 'warn', itemId: i.id, src });
    if (inRange(i.ends_on)) out.push({ date: i.ends_on, icon: '🔁', title: `${i.name} renews or ends`, sub: 'Compare prices or cancel', tone: 'warn', itemId: i.id, src });
  }
  for (const p of input.papers) {
    if (p.remind === false) continue;
    const src = p.source === 'email' ? p : undefined;
    if (p.due_kind === 'due') { if (inRange(p.expires)) out.push({ date: p.expires, icon: docIcon(p), title: `${p.name} due`, sub: p.holder ?? 'Vault', tone: 'doc', docId: p.id, src }); continue; }
    if (inRange(p.expires)) out.push({ date: p.expires, icon: docIcon(p), title: `${p.name} expires`, sub: p.holder ?? 'Renew it', tone: 'doc', docId: p.id, src });
    const start = p.expires ? new Date(Date.parse(`${p.expires}T12:00:00Z`) - 90 * 86400_000).toISOString().slice(0, 10) : null;
    if (inRange(start)) out.push({ date: start, icon: docIcon(p), title: `Start renewing: ${p.name}`, sub: `Expires ${p.expires}`, tone: 'doc', docId: p.id, src });
  }
  for (const d of input.dates) {
    let n = d.next_date;
    for (let k = 0; k < 24 && n <= end; k++) {
      if (n >= from) out.push({ date: n, icon: dateKind(d.kind).icon, title: d.title, sub: d.every_months ? (d.every_months === 12 ? 'Every year' : `Every ${d.every_months} months`) : 'Once', tone: 'date' });
      if (!d.every_months) break;
      n = monthsLater(d.next_date, d.every_months * (k + 1));
    }
  }
  for (const p of input.purchases.filter((x) => x.status === 'keep' || x.status === 'kept')) {
    if (p.status === 'keep' && inRange(p.return_by)) out.push({ date: p.return_by, icon: '🧾', title: `Last day to return: ${p.store}`, sub: p.item ?? 'Keep it or return it', amount: p.amount ?? undefined, tone: 'return', src: p });
    if (inRange(p.warranty_ends)) out.push({ date: p.warranty_ends, icon: '🛡️', title: `Warranty ends: ${p.store}`, sub: p.item ?? '', tone: 'return', src: p });
  }
  for (const a of input.appts ?? []) {
    if (a.status === 'booked' && inRange(a.day)) out.push({ date: a.day, icon: apptKind(a.kind).icon, title: a.title, sub: [whenText(a).split(' · ')[1], a.place].filter(Boolean).join(' · '), tone: 'appt', apptId: a.id, time: a.time ?? '', src: a.source === 'email' ? a : undefined });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '~').localeCompare(b.time ?? '~') || a.title.localeCompare(b.title));
}

export const daysLeft = (d: string) => daysBetween(today(), d);
