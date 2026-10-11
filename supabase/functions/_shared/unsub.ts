import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { Sender, Settings } from './model.ts';
import { archive, ensureLabel, has, isRateLimit, readHead, refresh, searchIds, sendMail, type MailHead } from './google.ts';
import { connection, open, saveConnection } from './server.ts';

/**
 * 📭 Mailing lists. Only email HEADERS are read (who sent it, the subject, opened or not, and the official
 * "List-Unsubscribe" header that real newsletters must carry); never the contents.
 * Unsubscribing uses that official header: the one-click kind is done quietly by the server (no page is opened);
 * the email kind sends the short "unsubscribe" email from your Gmail (needs the mailbox permission).
 * Senders seen in Spam are never unsubscribed (that only proves your address is real to spammers): they can be
 * blocked instead (their emails go out of the inbox, under a label; nothing is deleted).
 */

/** "Shop <news@shop.com>" → { address, name } */
export function parseFrom(from: string): { address: string; name: string } {
  const address = (from.match(/<([^>]+)>/)?.[1] ?? from.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? '').trim().toLowerCase();
  const name = from.replace(/<[^>]*>/, '').replace(/["']/g, '').trim();
  return { address, name: name && name !== address ? name.slice(0, 80) : address.split('@')[1] ?? address };
}

/** The List-Unsubscribe header: one-click (https + List-Unsubscribe-Post), a web page, or an email address. */
export function parseUnsub(header: string, post: string): Sender['unsub'] {
  const parts = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  const web = parts.find((p) => /^https:\/\//i.test(p) && safeUrl(p));
  const mailto = parts.find((p) => /^mailto:/i.test(p));
  return {
    ...(web && /one-click/i.test(post) ? { oneClick: web } : web ? { web } : {}),
    ...(mailto ? { mailto: mailto.slice(0, 300) } : {}),
  };
}

/** Only public https addresses (no IP numbers, no local names, no odd ports). */
export function safeUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:' || (x.port && x.port !== '443') || x.username || x.password) return false;
    const h = x.hostname.toLowerCase();
    if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return false;
    return true;
  } catch { return false; }
}

type Agg = { address: string; name: string; sample: string; sampleDate: string; emails: number; unread: number; first: string; last: string; opened: string | null; unsub: Sender['unsub']; spam: boolean };

/** Reads new email headers (first time: the last few months, 300 a run), and counts them per sender. */
export async function sweepStep(db: SupabaseClient, userId: string, s: Settings, until: number): Promise<string | void> {
  if (!s.unsub.on) return;
  const c = await connection(db, userId, 'google');
  if (!c || !has(c.meta.scope as string, 'gmail')) return;
  const meta = (await connection(db, userId, 'mail'))?.meta ?? {};
  const done = !!meta.sweepDone;
  const seen = new Set((meta.seenSweep as string[] | undefined) ?? []);
  const at = await refresh(await open(c.secret));
  const days = done ? 3 : Math.max(90, s.unsub.days + 30);
  const q = `newer_than:${days}d -in:sent -in:chats -in:drafts (category:promotions OR category:social OR category:updates OR category:forums OR unsubscribe)`;
  const all = (await searchIds(at, q, done ? 400 : 3000)).filter((id) => !seen.has(id));
  // Spam: just to know who NOT to unsubscribe from.
  const spamIds = (await searchIds(at, 'in:spam newer_than:30d', 100, { spam: true }).catch(() => [])).filter((id) => !seen.has(id));
  const ids = [...all.slice(0, 300), ...spamIds.slice(0, 50)];
  const agg = new Map<string, Agg>();
  let read = 0, stopped = '';
  for (const id of ids) {
    if (Date.now() > until) { stopped = 'out of time: the rest next run'; break; }
    let h: MailHead;
    try { h = await readHead(at, id); } catch (e) { if (isRateLimit(e)) { stopped = 'Gmail asked to slow down: the rest next run'; break; } throw e; }
    seen.add(id);
    read++;
    if (!h.listUnsub && !h.spam) continue; // not a mailing list (a person, a receipt…)
    const { address, name } = parseFrom(h.from);
    if (!address) continue;
    const a = agg.get(address) ?? { address, name, sample: h.subject, sampleDate: h.date, emails: 0, unread: 0, first: h.date, last: h.date, opened: null, unsub: {}, spam: false };
    a.emails++;
    if (h.unread) a.unread++;
    else if (!a.opened || h.date > a.opened) a.opened = h.date;
    if (h.date < a.first) a.first = h.date;
    if (h.date >= a.last) a.last = h.date;
    if (h.date >= a.sampleDate) { a.sample = h.subject.slice(0, 160); a.sampleDate = h.date; }
    const u = parseUnsub(h.listUnsub, h.listUnsubPost);
    if (Object.keys(u).length) a.unsub = { ...a.unsub, ...u };
    if (h.spam) a.spam = true;
    agg.set(address, a);
  }
  const list = [...agg.values()];
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    const { data: cur } = await db.from('senders').select('*').eq('user_id', userId).in('address', chunk.map((a) => a.address));
    const old = new Map(((cur as Sender[]) ?? []).map((x) => [x.address, x]));
    const rows = chunk.map((a) => {
      const o = old.get(a.address);
      const max = (x: string | null | undefined, y: string | null) => (!x ? y : !y ? x : x > y ? x : y);
      return {
        user_id: userId, address: a.address, name: a.name || o?.name || null, sample: a.sample || o?.sample || null,
        emails: (o?.emails ?? 0) + a.emails, unread: (o?.unread ?? 0) + a.unread,
        first_seen: o?.first_seen && o.first_seen < a.first ? o.first_seen : a.first, last_seen: max(o?.last_seen, a.last), last_opened: max(o?.last_opened, a.opened),
        unsub: { ...(o?.unsub ?? {}), ...a.unsub }, spam: (o?.spam ?? false) || a.spam,
      };
    });
    const { error } = await db.from('senders').upsert(rows, { onConflict: 'user_id,address' });
    if (error) throw new Error(error.message);
  }
  const left = all.length - Math.min(all.length, 300);
  await saveConnection(db, userId, 'mail', null, { seenSweep: [...seen].slice(-6000), lastSweep: new Date().toISOString(), sweepDone: done || (left <= 0 && !stopped), headsRead: ((meta.headsRead as number) ?? 0) + read });
  if (read) return `${read} email header(s) read, ${agg.size} mailing list(s)${!done && left > 0 ? `; ${left} older emails next time` : ''}${stopped ? ` (${stopped})` : ''}`;
}

export interface UnsubResult { status: Sender['status']; open?: string; error?: string }

/** Unsubscribe from one sender: one-click (quiet POST), else the unsubscribe email, else hand back the web page for you to finish. */
export async function unsubscribeOne(db: SupabaseClient, userId: string, sender: Sender, opts: { at?: string; mailbox: boolean; auto?: boolean }): Promise<UnsubResult> {
  if (sender.spam) return { status: sender.status, error: 'Seen in Spam: block it instead (unsubscribing would tell the spammer your address is real).' };
  const set = async (status: Sender['status'], error: string | null = null) => {
    await db.from('senders').update({ status, error, auto: !!opts.auto && status === 'unsubscribed', done_at: new Date().toISOString() }).eq('id', sender.id).eq('user_id', userId);
  };
  const u = sender.unsub ?? {};
  if (u.oneClick && safeUrl(u.oneClick)) {
    // RFC 8058 one-click: a POST with this exact body; the sender must stop without any page or login.
    const r = await fetch(u.oneClick, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click', redirect: 'manual', signal: AbortSignal.timeout(15_000) }).catch((e) => e as Error);
    if (!(r instanceof Error) && r.status < 400) { await r.body?.cancel().catch(() => undefined); await set('unsubscribed'); return { status: 'unsubscribed' }; }
    if (!u.mailto && !u.web) { const error = `The sender refused (${r instanceof Error ? r.message : `HTTP ${r.status}`})`; await set('failed', error); return { status: 'failed', error }; }
  }
  if (u.mailto && opts.mailbox && opts.at) {
    const m = u.mailto.replace(/^mailto:/i, '');
    const [to, query = ''] = m.split('?');
    const params = new URLSearchParams(query);
    const addr = decodeURIComponent(to).trim();
    if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(addr)) {
      await sendMail(opts.at, addr, params.get('subject') || 'unsubscribe', params.get('body') || 'Please unsubscribe me from this list.');
      await set('unsubscribed');
      return { status: 'unsubscribed' };
    }
  }
  if (u.web && safeUrl(u.web) && !opts.auto) {
    // Some senders need a click on their page: you finish it there (the app never opens it for you).
    await set('web');
    return { status: 'web', open: u.web };
  }
  if (u.mailto && !opts.mailbox) return { status: sender.status, error: 'This sender needs an email to unsubscribe: allow “Manage mailing lists” (Settings → Mailing lists) and try again.' };
  return { status: sender.status, error: 'No unsubscribe option from this sender. Block it instead.' };
}

/** Automatic mode + tidy: unsubscribe from senders you haven't opened in `days` days; keep their emails out of the inbox. */
export async function unsubStep(db: SupabaseClient, userId: string, s: Settings, until: number): Promise<string | void> {
  if (!s.unsub.on) return;
  const c = await connection(db, userId, 'google');
  if (!c || !has(c.meta.scope as string, 'gmail')) return;
  const mailbox = has(c.meta.scope as string, 'mailbox');
  if (!s.unsub.auto && !(s.unsub.tidy && mailbox)) return;
  const at = await refresh(await open(c.secret));
  const out: string[] = [];
  if (s.unsub.auto) {
    const cutoff = new Date(Date.now() - s.unsub.days * 86400_000).toISOString().slice(0, 10);
    const { data } = await db.from('senders').select('*').eq('user_id', userId).eq('status', 'subscribed').eq('spam', false).gte('emails', 2).lte('first_seen', cutoff).order('emails', { ascending: false }).limit(60);
    const due = ((data as Sender[]) ?? []).filter((x) => (!x.last_opened || x.last_opened < cutoff) && (x.unsub.oneClick || (x.unsub.mailto && mailbox))).slice(0, 15);
    let n = 0;
    for (const x of due) {
      if (Date.now() > until) break;
      const r = await unsubscribeOne(db, userId, x, { at, mailbox, auto: true }).catch((e) => ({ status: 'failed' as const, error: String(e) }));
      if (r.status === 'unsubscribed') n++;
    }
    if (n) out.push(`unsubscribed from ${n} list(s) you hadn't opened in ${s.unsub.days} days`);
  }
  if (s.unsub.tidy && mailbox) {
    // Unsubscribed more than 2 days ago (time for the sender to stop) or blocked: their emails leave the inbox, under a label.
    const twoDays = new Date(Date.now() - 2 * 86400_000).toISOString();
    const { data } = await db.from('senders').select('id, address, status, done_at').eq('user_id', userId).in('status', ['unsubscribed', 'blocked']).limit(200);
    const list = ((data ?? []) as Pick<Sender, 'id' | 'address' | 'status' | 'done_at'>[]).filter((x) => x.status === 'blocked' || (x.done_at && x.done_at < twoDays));
    let moved = 0;
    const labels: Record<string, string> = {};
    for (const x of list.slice(0, 40)) {
      if (Date.now() > until) break;
      const ids = await searchIds(at, `from:${x.address} in:inbox`, 200).catch(() => []);
      if (!ids.length) continue;
      const name = x.status === 'blocked' ? 'LifeTracker/Blocked' : 'LifeTracker/Unsubscribed';
      labels[name] ??= await ensureLabel(at, name);
      await archive(at, ids, labels[name]);
      moved += ids.length;
    }
    if (moved) out.push(`${moved} email(s) from unsubscribed or blocked senders moved out of the inbox (label LifeTracker/…)`);
  }
  if (out.length) return out.join('; ');
}

/** Block: their emails go out of the inbox (labelled), now and every morning. Nothing is deleted. */
export async function blockOne(db: SupabaseClient, userId: string, sender: Sender, at: string): Promise<number> {
  const ids = await searchIds(at, `from:${sender.address} in:inbox`, 500);
  if (ids.length) await archive(at, ids, await ensureLabel(at, 'LifeTracker/Blocked'));
  await db.from('senders').update({ status: 'blocked', done_at: new Date().toISOString(), error: null }).eq('id', sender.id).eq('user_id', userId);
  return ids.length;
}
