import type { Alert, EmailKind, EmailOften, Settings } from './model.ts';

/**
 * ✉️ Emails to me (owner's request: "limit the number of emails"). Plain TS shared by the app (Settings, Guide) and the
 * server (`emailStep` in sync.ts). Every automatic email goes through `planEmail`: at most ONE a day (or one a week),
 * only the kinds switched on, only heads-ups not already seen in the app. Heads-ups always stay in the app.
 */
export const EMAIL_OFTEN: { id: EmailOften; label: string; hint: string }[] = [
  { id: 'daily', label: 'One summary a day', hint: 'Everything new in one email, in the morning. Nothing new = no email.' },
  { id: 'weekly', label: 'One a week', hint: 'One email on your “My week” day with the week’s news.' },
  { id: 'important', label: 'Only important', hint: 'Only bills due (not on autopay), price increases and security alerts, as soon as found. Still at most 1 a day.' },
  { id: 'never', label: 'Never', hint: 'No automatic emails. Everything stays in the app.' },
];

export const EMAIL_KINDS: { id: EmailKind; icon: string; label: string; hint: string }[] = [
  { id: 'added', icon: '🆕', label: 'What was added', hint: 'Bills, documents and appointments added by themselves.' },
  { id: 'due', icon: '📅', label: 'Bills due', hint: 'Bills not on autopay, trials, renewals, documents and dates coming up, budgets.' },
  { id: 'price', icon: '📈', label: 'Price changes', hint: 'A bill went up (or down).' },
  { id: 'weekend', icon: '🎉', label: 'Weekend ideas', hint: 'The Friday “This weekend” list.' },
  { id: 'week', icon: '📊', label: 'Weekly summary', hint: '“My week”, on your chosen day.' },
  { id: 'security', icon: '🛡️', label: 'Security alerts', hint: 'Data breaches, your name online, credit freeze.' },
];

/** Which checkbox a heads-up belongs to (null = never emailed). */
const KIND_OF: Record<Alert['kind'], EmailKind | null> = {
  found: 'added', vault: 'added', appt: 'added', unsub: 'added',
  due: 'due', trial: 'due', renewal: 'due', paper: 'due', date: 'due', return: 'due', warranty: 'due', budget: 'due',
  price: 'price', nearby: 'weekend', breach: 'security', me: 'security', credit: 'security', sync: null,
};
export const emailKindOf = (k: Alert['kind']): EmailKind | null => KIND_OF[k] ?? null;

/** "$15.49 → $17.99": the two amounts of a price heads-up. */
const priceUp = (title: string) => {
  const m = title.match(/([\d,]+(?:\.\d+)?)\s*→\s*\D{0,4}([\d,]+(?:\.\d+)?)/);
  return !!m && Number(m[2].replace(/,/g, '')) > Number(m[1].replace(/,/g, ''));
};
/** Important (sent right away in "Only important"): a bill due that isn't on autopay, a price that went up, a breach or a worrying find about you. */
export const isImportant = (a: { kind: Alert['kind']; title: string }) => a.kind === 'due' || a.kind === 'breach' || a.kind === 'me' || (a.kind === 'price' && priceUp(a.title));

const part = (now: number, tz: string, o: Intl.DateTimeFormatOptions) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...o }).format(new Date(now)); } catch { return new Intl.DateTimeFormat('en-CA', o).format(new Date(now)); }
};
export const dayIn = (now: number, tz: string) => part(now, tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
const hourIn = (now: number, tz: string) => Number(part(now, tz, { hour: '2-digit', hourCycle: 'h23' })) % 24;
const dowOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);

export interface EmailPlan { send: boolean; why: string; since: string; important: boolean; week: boolean }

/**
 * May an automatic email go now, and with what? `full` = the daily morning run (it may always send, after the day's
 * heads-ups are made); other runs wait until 9 in the morning, your time. "Only important" goes at any run. Only one a
 * day: once sent today, nothing more until tomorrow (what comes later goes in the next one).
 */
export function planEmail(s: Settings, o: { now: number; tz: string; lastSent: string | null; full?: boolean }): EmailPlan {
  const e = s.emails;
  const back = (days: number) => new Date(o.now - days * 86400_000).toISOString();
  const no = (why: string): EmailPlan => ({ send: false, why, since: back(1), important: false, week: false });
  if (!e.on || e.often === 'never') return no('off');
  const day = dayIn(o.now, o.tz);
  const last = o.lastSent ? dayIn(Date.parse(o.lastSent), o.tz) : null;
  if (last === day) return no('already sent today');
  const morning = !!o.full || hourIn(o.now, o.tz) >= 9;
  // From the last email (at most a week back), so nothing is sent twice and nothing old comes back.
  const since = (days: number) => (o.lastSent && Date.parse(o.lastSent) > o.now - days * 86400_000 ? o.lastSent : back(days === 8 ? 7 : 1));
  if (e.often === 'important') return { send: true, why: 'important', since: since(2), important: true, week: false };
  if (!morning) return no('waits for the morning');
  const weekDay = dowOf(day) === s.week.day;
  if (e.often === 'daily') return { send: true, why: 'daily', since: since(2), important: false, week: e.kinds.week && weekDay };
  if (!weekDay) return no('waits for your week day');
  if (last && daysApart(last, day) < 6) return no('sent this week already');
  return { send: true, why: 'weekly', since: since(8), important: false, week: e.kinds.week };
}

/** The heads-ups that go in: not seen in the app yet, their kind switched on (and only the important ones in that mode). */
export function pickAlerts<T extends { kind: Alert['kind']; title: string; seen?: boolean }>(s: Settings, plan: EmailPlan, list: T[]): T[] {
  return list.filter((a) => {
    const k = emailKindOf(a.kind);
    return !a.seen && !!k && s.emails.kinds[k] && (!plan.important || isImportant(a));
  }).sort((a, b) => Number(isImportant(b)) - Number(isImportant(a)));
}

/** One email: the heads-ups grouped by kind, then the week in short. */
export function emailText(list: { kind: Alert['kind']; title: string; body: string | null }[], week: { icon: string; text: string }[], plan: Pick<EmailPlan, 'important' | 'why'>, site = ''): { subject: string; body: string } {
  const n = list.length;
  const subject = plan.important && n ? `LifeTracker: ${list[0].title}${n > 1 ? ` (+${n - 1} more)` : ''}`
    : plan.why === 'weekly' ? `LifeTracker: your week${n ? ` (${n} new)` : ''}`
    : n ? `LifeTracker: today, ${n} thing${n > 1 ? 's' : ''}` : 'LifeTracker: your week';
  const groups = EMAIL_KINDS.map((k) => ({ k, items: list.filter((a) => emailKindOf(a.kind) === k.id) })).filter((g) => g.items.length);
  const lines = [
    ...groups.flatMap((g) => [`${g.k.icon} ${g.k.label}`, ...g.items.map((a) => `• ${a.title}${a.body ? `\n  ${a.body.split('\n').join('\n  ')}` : ''}`), '']),
    ...(week.length ? ['📊 Your week, in short', ...week.map((l) => `${l.icon} ${l.text}`), ''] : []),
    `At most one email a ${plan.why === 'weekly' ? 'week' : 'day'}. Change what you get: ${site ? `${site}#/me/settings/emails` : 'Me → Settings → ✉️ Emails to me'}`,
  ];
  return { subject, body: lines.join('\n') };
}

/** The Settings tile's short line. */
export function emailsWords(s: Settings): string {
  if (!s.emails.on || s.emails.often === 'never') return 'Off · app only';
  return EMAIL_OFTEN.find((o) => o.id === s.emails.often)!.label;
}
