import type { Finding, Item, Paper, Sender, Settings } from './model.ts';
import { daysBetween, money, nextDue, today } from './money.ts';
import { paperKind } from './people.ts';

/**
 * 📊 "My week": one short summary of everything about you. The same function makes the card on Home and the
 * Sunday email, so they always say the same thing. Plain TypeScript (app + server).
 */
export interface WeekInput {
  items: Item[]; findings: Finding[]; senders: Sender[]; papers: Paper[]; settings: Settings;
  spent: { week: number; usualWeek: number | null; top: { name: string; amount: number }[] };
}
export interface WeekLine { icon: string; text: string; tone?: 'warn' | 'good' }

export function weekSummary(w: WeekInput, now = today()): WeekLine[] {
  const out: WeekLine[] = [];
  const weekAgo = new Date(Date.parse(`${now}T12:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);

  // 💸 money out this week, against a usual week
  if (w.spent.week > 0) {
    const vs = w.spent.usualWeek ? ` (a usual week: ${money(w.spent.usualWeek)})` : '';
    const top = w.spent.top.length ? `. Most at ${w.spent.top.slice(0, 3).map((t) => `${t.name} ${money(t.amount)}`).join(', ')}` : '';
    out.push({ icon: '💸', text: `Spent ${money(w.spent.week)} this week${vs}${top}.`, tone: w.spent.usualWeek && w.spent.week > w.spent.usualWeek * 1.3 ? 'warn' : undefined });
  }
  // 📋 bills in the next 7 days
  const due = w.items.filter((i) => i.status === 'active').map((i) => ({ i, d: nextDue(i) })).filter((x) => x.d && daysBetween(now, x.d) >= 0 && daysBetween(now, x.d) <= 7);
  if (due.length) out.push({ icon: '📋', text: `${due.length} bill${due.length > 1 ? 's' : ''} in the next 7 days: ${money(due.reduce((a, x) => a + Number(x.i.amount), 0))} (${due.slice(0, 4).map((x) => x.i.name).join(', ')}${due.length > 4 ? '…' : ''}).` });
  // 🕵️ found about you this week
  const newWeb = w.findings.filter((f) => f.kind === 'web' && f.status === 'new');
  const worrying = newWeb.filter((f) => f.verdict === 'worrying');
  if (worrying.length) out.push({ icon: '⚠️', text: `${worrying.length} page${worrying.length > 1 ? 's' : ''} about you look worrying: open Me to check.`, tone: 'warn' });
  else if (newWeb.length) out.push({ icon: '🕵️', text: `${newWeb.length} new page${newWeb.length > 1 ? 's' : ''} mention you (nothing worrying).` });
  const listed = w.findings.filter((f) => f.kind === 'broker' && f.status === 'listed');
  if (listed.length) out.push({ icon: '🧹', text: `Listed on ${listed.length} people-search site${listed.length > 1 ? 's' : ''}: removal steps in Me.`, tone: 'warn' });
  const breaches = w.findings.filter((f) => f.kind === 'breach' && f.status === 'new');
  if (breaches.length) out.push({ icon: '🔓', text: `In ${breaches.length} data breach${breaches.length > 1 ? 'es' : ''} (${breaches.slice(0, 2).map((b) => b.key).join(', ')}): change those passwords.`, tone: 'warn' });
  // 📭 mailing lists
  const gone = w.senders.filter((s) => s.status === 'unsubscribed' && s.done_at && s.done_at.slice(0, 10) >= weekAgo);
  if (gone.length) out.push({ icon: '📭', text: `Unsubscribed from ${gone.length} mailing list${gone.length > 1 ? 's' : ''}${gone.some((s) => s.auto) ? ' (some automatically)' : ''}: ${gone.slice(0, 4).map((s) => s.name || s.address).join(', ')}${gone.length > 4 ? '…' : ''}.`, tone: 'good' });
  // 🪪 documents that expire within 90 days
  const soon = w.papers.filter((p) => p.expires && daysBetween(now, p.expires) <= 90).sort((a, b) => (a.expires! < b.expires! ? -1 : 1));
  for (const p of soon.slice(0, 3)) {
    const d = daysBetween(now, p.expires!);
    out.push({ icon: paperKind(p.kind).icon, text: d < 0 ? `${p.name} expired on ${p.expires}.` : `${p.name} expires in ${d} day${d === 1 ? '' : 's'} (${p.expires}).`, tone: d <= 30 ? 'warn' : undefined });
  }
  // 🔒 credit freeze
  const c = w.settings.credit;
  const notFrozen = (['equifax', 'experian', 'transunion'] as const).filter((b) => c[b] !== 'frozen');
  if (notFrozen.length) out.push({ icon: '🔒', text: `Credit freeze: ${3 - notFrozen.length} of 3 done. It’s free and stops loans in your name.` });
  if (!out.length) out.push({ icon: '✅', text: 'All quiet: nothing needs you this week.', tone: 'good' });
  return out;
}

/** 💸 Money out in the last 7 days, a usual week (the 8 weeks before), and where most of it went. */
export function spentOf(tx: { posted: string; amount: number; description: string | null }[], now = today()): WeekInput['spent'] {
  const t = Date.parse(`${now}T12:00:00Z`);
  const daysAgo = (d: string) => Math.floor((t - Date.parse(`${d}T12:00:00Z`)) / 86400_000);
  let week = 0, before = 0, oldest = 0;
  const by = new Map<string, number>();
  for (const x of tx) {
    const a = Number(x.amount);
    if (!(a < 0)) continue;
    const d = daysAgo(x.posted);
    if (d < 0) continue;
    if (d < 7) {
      week += -a;
      const name = (x.description ?? 'Other').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Other';
      by.set(name, (by.get(name) ?? 0) + -a);
    } else if (d < 63) { before += -a; oldest = Math.max(oldest, d); }
  }
  // A "usual week" only once there are at least 3 earlier weeks to compare with.
  const weeks = Math.floor((oldest - 6) / 7);
  return {
    week: Math.round(week * 100) / 100,
    usualWeek: weeks >= 3 ? Math.round((before / weeks) * 100) / 100 : null,
    top: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })),
  };
}
