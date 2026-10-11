import { env } from './server.ts';
import { catOf, type Item, type Settings } from './model.ts';

/**
 * 📅 Google Calendar and ✉️ Gmail. Calendar uses the narrow "calendars this app created" permission: the app makes
 * one "LifeTracker" calendar and can only touch that one (never your other events). Gmail is read-only and only
 * if you tick it. Google Cloud: one OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Supabase secrets).
 */
export const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.app.created',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
};
export type Want = keyof typeof SCOPES;
export const callbackUrl = () => `${env('SUPABASE_URL')}/functions/v1/google-callback`;

export function authUrl(want: Want[], state: string): string {
  const q = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: callbackUrl(), response_type: 'code', access_type: 'offline', prompt: 'consent',
    include_granted_scopes: 'true', scope: ['openid', 'email', ...want.map((w) => SCOPES[w])].join(' '), state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

interface TokenReply { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string }
async function token(body: Record<string, string>): Promise<TokenReply> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json()) as TokenReply;
  if (!res.ok || !j.access_token) throw new Error(`Google: ${j.error_description ?? j.error ?? `HTTP ${res.status}`}`);
  return j;
}
export const exchange = (code: string) => token({ code, grant_type: 'authorization_code', redirect_uri: callbackUrl() });
export const refresh = async (refreshToken: string) => (await token({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token!;
export const has = (scope: string | undefined, w: Want) => !!scope?.split(' ').includes(SCOPES[w]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Google's "too fast" answers (per-minute limits): wait and try again. */
export const isRateLimit = (e: unknown) => /quota exceeded|rate limit|too many requests|HTTP 429/i.test(e instanceof Error ? e.message : String(e));

async function g<T>(at: string, url: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 204) return undefined as T;
    const j = await res.json().catch(() => ({}));
    if (res.ok) return j as T;
    const msg = `Google: ${(j as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`}`;
    if ((res.status === 429 || res.status === 403) && isRateLimit(msg) && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt; // 2, 4, 8, 16 s
      await sleep(Math.min(wait, 20_000));
      continue;
    }
    throw new Error(msg);
  }
}

/** Gmail allows a limited number of reads per minute: keep a steady pace (about 4 emails a second). */
let lastRead = 0;
async function pace() {
  const wait = lastRead + 250 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRead = Date.now();
}

// ---------- 📅 Calendar ----------
const CAL = 'https://www.googleapis.com/calendar/v3';
const RRULE: Record<string, string | null> = {
  weekly: 'RRULE:FREQ=WEEKLY', biweekly: 'RRULE:FREQ=WEEKLY;INTERVAL=2', monthly: 'RRULE:FREQ=MONTHLY', quarterly: 'RRULE:FREQ=MONTHLY;INTERVAL=3',
  semiannual: 'RRULE:FREQ=MONTHLY;INTERVAL=6', yearly: 'RRULE:FREQ=YEARLY', once: null,
};
interface GEvent { id?: string; summary: string; description?: string; start: { date: string }; end: { date: string }; recurrence?: string[]; reminders?: unknown; extendedProperties?: { private?: Record<string, string> }; status?: string }

/** The "LifeTracker" calendar (made once). */
export async function ensureCalendar(at: string, known?: string): Promise<string> {
  if (known) {
    const ok = await g<{ id?: string }>(at, `${CAL}/calendars/${encodeURIComponent(known)}`).catch(() => null);
    if (ok?.id) return known;
  }
  const c = await g<{ id: string }>(at, `${CAL}/calendars`, { method: 'POST', body: JSON.stringify({ summary: 'LifeTracker', description: 'Bills, renewals and free trials from LifeTracker. Changes here are replaced by the app.' }) });
  return c.id;
}

/** What the calendar should show for one bill: the due date (repeating), the renewal, the end of a free trial. */
export function eventsFor(item: Item, s: Settings, site: string): { kind: string; ev: GEvent }[] {
  if (item.status !== 'active') return [];
  const cat = catOf(item.category);
  const amt = `$${Number(item.amount).toFixed(2)}`;
  const link = site ? `\n\nOpen LifeTracker: ${site}` : '';
  const remind = { useDefault: false, overrides: [{ method: 'popup', minutes: Math.max(0, s.calendar.remindDays * 1440 - 9 * 60) }] };
  const out: { kind: string; ev: GEvent }[] = [];
  const allDay = (d: string) => ({ start: { date: d }, end: { date: nextDay(d) } });
  if (item.next_due) {
    const rule = RRULE[item.cycle];
    out.push({ kind: 'due', ev: {
      summary: `${cat.icon} ${item.name} ${amt}${item.autopay ? ' (autopay)' : ' · pay'}`,
      description: `${item.name}: ${amt} ${item.cycle === 'once' ? 'once' : item.cycle}${item.account ? `, from ${item.account}` : ''}.${item.notes ? `\n${item.notes}` : ''}${link}`,
      ...allDay(item.next_due), ...(rule ? { recurrence: [rule] } : {}), reminders: remind,
    } });
  }
  if (s.calendar.renewals && item.ends_on) out.push({ kind: 'renew', ev: { summary: `🔁 ${item.name} renews / ends`, description: `Check the price and decide: keep, switch or cancel.${link}`, ...allDay(item.ends_on), reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 7 * 1440 }, { method: 'popup', minutes: 1440 }] } } });
  if (s.calendar.trials && item.trial_ends) out.push({ kind: 'trial', ev: { summary: `⏳ ${item.name} free trial ends`, description: `Cancel before today if you don't want to pay ${amt}.${link}`, ...allDay(item.trial_ends), reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 2 * 1440 }, { method: 'popup', minutes: 9 * 60 }] } } });
  return out;
}
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const sigOf = (ev: GEvent) => { const s = JSON.stringify([ev.summary, ev.description, ev.start, ev.recurrence, ev.reminders]); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };

/** Makes the LifeTracker calendar match your bills: adds, updates and removes events. Returns counts. */
export async function syncCalendar(at: string, calendarId: string, items: Item[], s: Settings, site: string) {
  const existing: GEvent[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ maxResults: '2500', privateExtendedProperty: 'app=lifetracker', ...(page ? { pageToken: page } : {}) });
    const r = await g<{ items?: GEvent[]; nextPageToken?: string }>(at, `${CAL}/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    existing.push(...(r.items ?? []).filter((e) => e.status !== 'cancelled'));
    page = r.nextPageToken;
  } while (page);
  const have = new Map(existing.map((e) => [`${e.extendedProperties?.private?.item}:${e.extendedProperties?.private?.kind}`, e]));
  let added = 0, changed = 0, removed = 0;
  const want = new Set<string>();
  for (const item of items) {
    for (const { kind, ev } of eventsFor(item, s, site)) {
      const k = `${item.id}:${kind}`;
      want.add(k);
      const sig = sigOf(ev);
      const body = { ...ev, extendedProperties: { private: { app: 'lifetracker', item: item.id, kind, sig } } };
      const cur = have.get(k);
      if (!cur) { await g(at, `${CAL}/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(body) }); added++; }
      else if (cur.extendedProperties?.private?.sig !== sig) { await g(at, `${CAL}/calendars/${encodeURIComponent(calendarId)}/events/${cur.id}`, { method: 'PUT', body: JSON.stringify(body) }); changed++; }
    }
  }
  for (const [k, e] of have) if (!want.has(k) && e.id) { await g(at, `${CAL}/calendars/${encodeURIComponent(calendarId)}/events/${e.id}`, { method: 'DELETE' }).catch(() => undefined); removed++; }
  return { added, changed, removed };
}

// ---------- ✉️ Gmail (read-only) ----------
const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
export interface Mail { id: string; from: string; subject: string; date: string; text: string }

/** Receipt / bill / renewal emails (and anything sent to you+lifetracker@…) from the last `days` days. */
export async function findBillEmails(at: string, days: number, plusTag: string, max = 40): Promise<string[]> {
  const words = '(receipt OR invoice OR "your bill" OR statement OR "payment due" OR renewal OR renew OR subscription OR "free trial" OR "trial ends" OR premium OR "auto-pay" OR autopay OR "amount due")';
  const q = `newer_than:${days}d -category:promotions (${words} OR deliveredto:+${plusTag})`;
  const r = await g<{ messages?: { id: string }[] }>(at, `${GM}/messages?${new URLSearchParams({ q, maxResults: String(max) })}`);
  return (r.messages ?? []).map((m) => m.id);
}

interface Part { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] }
const dec = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
function textOf(p: Part): { plain: string; html: string } {
  const out = { plain: '', html: '' };
  const walk = (x: Part) => {
    if (x.mimeType === 'text/plain' && x.body?.data) out.plain += dec(x.body.data);
    else if (x.mimeType === 'text/html' && x.body?.data) out.html += dec(x.body.data);
    x.parts?.forEach(walk);
  };
  walk(p);
  return out;
}
const stripHtml = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;|&dollar;/g, '$').replace(/&[a-z]+;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

export async function readEmail(at: string, id: string): Promise<Mail> {
  await pace();
  const m = await g<{ id: string; payload: Part; internalDate: string }>(at, `${GM}/messages/${id}?format=full`);
  const h = (n: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? '';
  const t = textOf(m.payload);
  return { id, from: h('from'), subject: h('subject'), date: new Date(Number(m.internalDate)).toISOString().slice(0, 10), text: (t.plain.trim() || stripHtml(t.html)).slice(0, 20_000) };
}

/** Free first look (no AI): does it talk about money and a bill? Skips most newsletters and shipping notices. */
export function looksLikeBill(m: Mail): boolean {
  const all = `${m.subject}\n${m.text}`.toLowerCase();
  const money = /(\$|usd|€|£)\s?\d|\d+\.\d{2}\s?(usd|\$)/.test(all);
  const word = /(receipt|invoice|bill|statement|payment|renew|subscription|trial|premium|policy|due|charged|membership|plan)/.test(all);
  const noise = /(shipped|out for delivery|tracking number|order has been delivered|unsubscribe from this newsletter)/.test(all) && !/subscription|renew|premium|policy/.test(all);
  return money && word && !noise;
}

/** 📧 Bank purchase-alert emails from the last `days` days (ids only). */
export async function findAlertEmails(at: string, days: number, query: string, max = 200): Promise<string[]> {
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ q: `newer_than:${days}d (${query})`, maxResults: '100', ...(page ? { pageToken: page } : {}) });
    const r = await g<{ messages?: { id: string }[]; nextPageToken?: string }>(at, `${GM}/messages?${q}`);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    page = r.nextPageToken;
  } while (page && ids.length < max);
  return ids.slice(0, max);
}
