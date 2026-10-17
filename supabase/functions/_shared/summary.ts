import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { PROVIDERS, providerOf, type Item, type Provider, type Settings } from './model.ts';
import { daysBetween, nextDue, todayIn } from './money.ts';

/**
 * 📱 "My apps" page (apps.html): LifeTracker's own card. Same shape as the other apps' GET /api/summary:
 * 1–3 short lines + the paid-AI cost today / last 7 days / this month.
 * ai_usage only counts calls per AI per day (not tokens), so the paid ones get a per-call ESTIMATE (labelled "about");
 * the free AIs (Gemini, Groq, OpenRouter free models) cost $0.
 */
/** Rough cost of one Claude read in this app (a bill, an email, a question: a few thousand words in, a short answer out). */
export const CLAUDE_PER_CALL: Record<string, number> = { 'claude-opus-5-5': 0.05, 'claude-sonnet-5-5': 0.03, 'claude-haiku-5-5': 0.01 };
const perCall = (p: Provider, s: Settings) => (providerOf(p).paid ? CLAUDE_PER_CALL[s.ai.slots[p]?.model] ?? 0.03 : 0);

export interface SummaryLine { icon: string; text: string; tone: 'good' | 'warn' | 'info' }
export interface Summary {
  app: 'lifetracker';
  lines: SummaryLine[];
  ai: { today: Cost; week: Cost; month: Cost; byModel: { model: string; calls: number; usd: number }[]; estimate: boolean };
  at: string;
}
interface Cost { calls: number; usd: number }

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function summary(db: SupabaseClient, userId: string, s: Settings): Promise<Summary> {
  const t = todayIn(s.appts.timeZone || 'UTC');
  // ai_usage days are the database's days (UTC), like take_ai().
  const utc = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(Date.parse(`${utc}T12:00:00Z`) - 6 * 86400_000).toISOString().slice(0, 10);
  const monthStart = `${utc.slice(0, 8)}01`;
  const since = weekStart < monthStart ? weekStart : monthStart;
  const [items, appts, alerts, sugg, usage] = await Promise.all([
    db.from('items').select('*').eq('user_id', userId).eq('status', 'active'),
    db.from('appointments').select('title, day, time').eq('user_id', userId).eq('status', 'booked').gte('day', t).order('day').order('time').limit(20),
    db.from('alerts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('seen', false),
    db.from('suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'accepted').not('item_id', 'is', null).gte('updated_at', `${weekStart}T00:00:00Z`),
    db.from('ai_usage').select('day, provider, n').eq('user_id', userId).gte('day', since),
  ]);

  const lines: SummaryLine[] = [];
  // Next bill due.
  const next = ((items.data as Item[]) ?? []).map((i) => ({ i, d: nextDue(i) })).filter((x): x is { i: Item; d: string } => !!x.d && x.d >= t).sort((a, b) => a.d.localeCompare(b.d))[0];
  if (next) {
    const n = daysBetween(t, next.d);
    lines.push({ icon: '📋', text: `Next bill: ${next.i.name} $${Number(next.i.amount).toFixed(2)} ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : shortDay(next.d)}`, tone: n <= 1 && !next.i.autopay ? 'warn' : 'info' });
  } else lines.push({ icon: '📋', text: 'No bills due yet', tone: 'info' });
  // Appointments today (else the next one).
  const ap = (appts.data as { title: string; day: string; time: string | null }[]) ?? [];
  const todays = ap.filter((a) => a.day === t);
  if (todays.length) lines.push({ icon: '📅', text: todays.length === 1 ? `Today: ${todays[0].title}${todays[0].time ? ` at ${todays[0].time}` : ''}` : `${todays.length} appointments today`, tone: 'info' });
  else if (ap[0]) lines.push({ icon: '📅', text: `Next: ${ap[0].title}, ${shortDay(ap[0].day)}`, tone: 'info' });
  // Heads-ups, and bills added by themselves this week (fully automatic: nothing waits for an OK).
  const heads = alerts.count ?? 0, added = sugg.count ?? 0;
  lines.push(heads || added
    ? { icon: '🔔', text: [heads ? `${heads} heads-up${heads === 1 ? '' : 's'}` : '', added ? `${added} bill${added === 1 ? '' : 's'} added by itself this week` : ''].filter(Boolean).join(' · '), tone: heads ? 'warn' : 'info' }
    : { icon: '✅', text: 'Nothing new for you', tone: 'good' });

  // AI calls and cost.
  const rows = (usage.data as { day: string; provider: Provider; n: number }[]) ?? [];
  const sum = (f: (d: string) => boolean): Cost => {
    const c = rows.filter((r) => f(r.day));
    return { calls: c.reduce((a, r) => a + r.n, 0), usd: r2(c.reduce((a, r) => a + r.n * perCall(r.provider, s), 0)) };
  };
  const byModel = rows.filter((r) => r.day === utc && r.n > 0).map((r) => {
    const info = PROVIDERS.find((p) => p.id === r.provider);
    const m = info?.models.find((x) => x.id === s.ai.slots[r.provider]?.model);
    return { model: info?.paid ? m?.name ?? info.name : `${info?.name ?? r.provider} (free)`, calls: r.n, usd: r2(r.n * perCall(r.provider, s)) };
  });
  return {
    app: 'lifetracker',
    lines: lines.slice(0, 3),
    ai: { today: sum((d) => d === utc), week: sum((d) => d >= weekStart), month: sum((d) => d >= monthStart), byModel, estimate: true },
    at: new Date().toISOString(),
  };
}
