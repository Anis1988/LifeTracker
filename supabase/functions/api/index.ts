import { z } from 'npm:zod@4.1.12';
import { admin, connection, cors, env, HttpError, json, open, saveConnection, settingsOf, sign, userOf, withCors } from '../_shared/server.ts';
import { claimSetupToken } from '../_shared/simplefin.ts';
import { authUrl, has, type Want } from '../_shared/google.ts';
import { readWithAi } from '../_shared/ai.ts';
import { applyExtracted, syncUser } from '../_shared/sync.ts';
import { merchantKey } from '../_shared/recurring.ts';
import { refresh } from '../_shared/google.ts';
import { blockOne, unsubscribeOne } from '../_shared/unsub.ts';
import { ask } from '../_shared/ask.ts';
import { summary } from '../_shared/summary.ts';
import { negotiate } from '../_shared/negotiate.ts';
import { mimeOf, readVault } from '../_shared/vault.ts';
import type { Item, Sender } from '../_shared/model.ts';

/**
 * The app's server (POST /functions/v1/api {action, ...}), signed-in users only. Everything you can see or change
 * directly (bills, suggestions, documents, alerts, settings) goes straight to the database with Row Level Security;
 * this is only for what needs secrets: the bank, Google, the AI and the automatic run.
 */
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('bank-connect'), setupToken: z.string().min(20).max(2000) }),
  z.object({ action: z.literal('disconnect'), kind: z.enum(['simplefin', 'google']) }),
  z.object({ action: z.literal('google-start'), want: z.array(z.enum(['calendar', 'gmail', 'mailbox'])).min(1).max(3), back: z.string().url().max(300) }),
  z.object({ action: z.literal('run'), part: z.enum(['online', 'breaches', 'lists', 'week', 'purchases', 'appts', 'calendar', 'contacts', 'vault']) }),
  z.object({ action: z.literal('phone-key') }),
  z.object({ action: z.literal('ask'), question: z.string().min(2).max(500), history: z.array(z.object({ q: z.string().max(500), a: z.string().max(2000) })).max(6).optional() }),
  z.object({ action: z.literal('unsubscribe'), id: z.string().uuid() }),
  z.object({ action: z.literal('block'), id: z.string().uuid() }),
  z.object({ action: z.literal('vault-read'), path: z.string().min(10).max(300) }),
  z.object({ action: z.literal('sync'), full: z.boolean().optional() }),
  z.object({ action: z.literal('read-doc'), id: z.string().uuid() }),
  z.object({ action: z.literal('summary') }),
  z.object({ action: z.literal('negotiate'), id: z.string().uuid(), okSwitch: z.boolean(), fresh: z.boolean().optional() }),
  z.object({ action: z.literal('import-csv'), rows: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number(), description: z.string().max(200), account: z.string().max(80).optional() })).min(1).max(5000) }),
]);

Deno.serve(async (req) => withCors(await handle(req), req));

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  try {
    const user = await userOf(req);
    const body = Body.parse(await req.json());
    const db = admin();
    switch (body.action) {
      case 'status': {
        const [bank, google, status, me, mail, phone, contacts, vault] = await Promise.all([connection(db, user.id, 'simplefin'), connection(db, user.id, 'google'), connection(db, user.id, 'status'), connection(db, user.id, 'me'), connection(db, user.id, 'mail'), connection(db, user.id, 'phone'), connection(db, user.id, 'contacts'), connection(db, user.id, 'vault')]);
        const { data: usage } = await db.from('ai_usage').select('provider, n').eq('user_id', user.id).eq('day', new Date().toISOString().slice(0, 10));
        return json({
          bank: bank ? { connected: true, lastSync: bank.meta.lastSync ?? null, accounts: bank.meta.accounts ?? [], errors: bank.meta.errors ?? [] } : { connected: false },
          google: google ? { connected: true, email: google.meta.email ?? null, calendar: has(google.meta.scope as string, 'calendar'), gmail: has(google.meta.scope as string, 'gmail'), lastGmail: google.meta.gmailScanned ?? null, alertsScanned: google.meta.alertsScanned ?? null, alertsRead: google.meta.alertsRead ?? 0, alertBanks: google.meta.alertBanks ?? [], mailbox: has(google.meta.scope as string, 'mailbox') } : { connected: false },
          me: { lastOnline: me?.meta.lastOnline ?? null, lastErrors: me?.meta.lastErrors ?? [], weekSent: me?.meta.weekSent ?? null, breachScanned: me?.meta.breachScanned ?? null },
          mail: { lastSweep: mail?.meta.lastSweep ?? null, sweepDone: !!mail?.meta.sweepDone, headsRead: mail?.meta.headsRead ?? 0, apptsScanned: mail?.meta.apptsScanned ?? null, contactsScanned: contacts?.meta.scanned ?? null, vaultScanned: vault?.meta.scanned ?? null },
          phone: { since: phone?.meta.since ?? null, lastText: phone?.meta.lastText ?? null },
          lastRun: status?.meta ?? null,
          aiUsed: Object.fromEntries((usage ?? []).map((u) => [u.provider, u.n])),
          keys: {
            gemini: !!env('GEMINI_API_KEY'), groq: !!env('GROQ_API_KEY'), openrouter: !!env('OPENROUTER_API_KEY'), claude: !!env('ANTHROPIC_API_KEY'),
            google: !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET')), email: !!env('RESEND_API_KEY'), secret: env('LT_SECRET_KEY').length >= 16,
          },
          email: user.email,
        });
      }
      case 'bank-connect': {
        const access = await claimSetupToken(body.setupToken);
        await saveConnection(db, user.id, 'simplefin', access, { connectedAt: new Date().toISOString(), lastSync: null });
        // First look-back right away (about a year of transactions), then find the recurring ones.
        const log = await syncUser(db, user.id, user.email, { full: true });
        return json({ ok: true, log });
      }
      case 'disconnect': {
        await db.from('connections').delete().eq('user_id', user.id).eq('kind', body.kind);
        return json({ ok: true });
      }
      case 'google-start': {
        if (!env('GOOGLE_CLIENT_ID')) throw new HttpError('Google isn’t set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the Guide → Setting it up).', 503);
        const cur = await connection(db, user.id, 'google');
        // Keep what was already allowed, add what was asked.
        const want = [...new Set([...body.want, ...(['calendar', 'gmail', 'mailbox'] as Want[]).filter((w) => has(cur?.meta.scope as string, w))])] as Want[];
        const payload = btoa(JSON.stringify({ u: user.id, b: body.back, t: Date.now() }));
        return json({ url: authUrl(want, `${payload}.${await sign(payload)}`) });
      }
      case 'sync': {
        const log = await syncUser(db, user.id, user.email, { full: body.full });
        return json({ ok: true, log });
      }
      case 'run': {
        // One part now ("Check now", "Scan my mailing lists", "Send my week now").
        const log = await syncUser(db, user.id, user.email, { only: [body.part], force: true });
        return json({ ok: true, log });
      }
      case 'phone-key': {
        // 💬 The Android app's own key for sending appointment texts (a new one replaces the old one).
        const nonce = crypto.randomUUID().replace(/-/g, '');
        await saveConnection(db, user.id, 'phone', null, { nonce, since: new Date().toISOString() });
        return json({ key: `${user.id}.${nonce}.${await sign(`phone:${user.id}:${nonce}`)}`, url: `${env('SUPABASE_URL')}/functions/v1/texts` });
      }
      case 'summary':
        // 📱 "My apps" page: LifeTracker's card (read-only, no AI).
        return json(await summary(db, user.id, await settingsOf(db, user.id)));
      case 'negotiate':
        // 💬 "Get a lower price": one AI read, then kept on the bill per price (free the next time).
        return json(await negotiate(db, user.id, await settingsOf(db, user.id), body.id, body.okSwitch, body.fresh));
      case 'ask':
        return json(await ask(db, user.id, await settingsOf(db, user.id), body.question, body.history ?? []));
      case 'unsubscribe':
      case 'block': {
        const { data: sender } = await db.from('senders').select('*').eq('id', body.id).eq('user_id', user.id).maybeSingle();
        if (!sender) throw new HttpError('Not found.', 404);
        const g = await connection(db, user.id, 'google');
        const mailbox = has(g?.meta.scope as string, 'mailbox');
        const at = g && (mailbox || body.action === 'unsubscribe') ? await refresh(await open(g.secret)) : undefined;
        if (body.action === 'block') {
          if (!mailbox || !at) throw new HttpError('Blocking needs “Manage mailing lists” (Settings → Mailing lists → Allow).', 400);
          const moved = await blockOne(db, user.id, sender as Sender, at);
          return json({ status: 'blocked', moved });
        }
        return json(await unsubscribeOne(db, user.id, sender as Sender, { at, mailbox }));
      }
      case 'vault-read': {
        // 📁 A scanned / added document: read once by the AI (free first), kept by the file's hash (never paid twice).
        // The file must be in this person's own Vault folder of the private bucket.
        if (!body.path.startsWith(`${user.id}/vault/`) || body.path.includes('..')) throw new HttpError('Not found.', 404);
        const { data: file, error } = await db.storage.from('docs').download(body.path);
        if (error || !file) throw new HttpError('The file is missing.', 404);
        const r = await readVault(db, user.id, await settingsOf(db, user.id), { mime: mimeOf(body.path, file.type), bytes: new Uint8Array(await file.arrayBuffer()) });
        return json({ ...r.data, by: r.by, cached: r.cached, hash: r.hash });
      }
      case 'read-doc': {
        const { data: doc } = await db.from('documents').select('*').eq('id', body.id).eq('user_id', user.id).maybeSingle();
        if (!doc) throw new HttpError('Document not found.', 404);
        // The file must be in this person's own folder (a row can't point at someone else's file).
        if (!doc.path.startsWith(`${user.id}/`)) throw new HttpError('Document not found.', 404);
        await db.from('documents').update({ status: 'reading', error: null }).eq('id', doc.id);
        try {
          const { data: file, error } = await db.storage.from('docs').download(doc.path);
          if (error || !file) throw new Error('The file is missing.');
          const bytes = new Uint8Array(await file.arrayBuffer());
          const input = doc.mime.startsWith('text/')
            ? { text: new TextDecoder().decode(bytes) }
            : { file: { mime: doc.mime, data: b64(bytes) } };
          const s = await settingsOf(db, user.id);
          const r = await readWithAi(db, user.id, s, input);
          const { data: items } = await db.from('items').select('*').eq('user_id', user.id).neq('status', 'cancelled');
          const alerts: Parameters<typeof applyExtracted>[7] = [];
          const link = r.data.isBill
            ? await applyExtracted(db, user.id, r.data, 'document', `doc:${doc.id}`, { documentId: doc.id }, (items as Item[]) ?? [], alerts)
            : {};
          if (alerts.length) await db.from('alerts').upsert(alerts, { onConflict: 'user_id,kind,key', ignoreDuplicates: true });
          const { data: done } = await db.from('documents').update({ status: 'done', extracted: r.data, ai_by: r.by, item_id: link.itemId ?? null, error: r.tried.length ? `Tried first: ${r.tried.join(' · ')}` : null }).eq('id', doc.id).select().single();
          return json({ doc: done, ...link });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await db.from('documents').update({ status: 'failed', error: msg.slice(0, 500) }).eq('id', doc.id);
          throw new HttpError(msg, 502);
        }
      }
      case 'import-csv': {
        // A bank CSV read on the device: stored like bank transactions, then the recurring ones are found.
        const rows = body.rows.map((r) => ({
          user_id: user.id, external_id: `csv:${r.date}:${r.amount}:${r.description.slice(0, 60)}`, account: r.account ?? 'CSV import',
          posted: r.date, amount: r.amount, description: r.description, merchant: merchantKey(r.description),
        }));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await db.from('transactions').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,external_id', ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        }
        const log = await syncUser(db, user.id, user.email);
        return json({ ok: true, imported: rows.length, log });
      }
    }
  } catch (e) {
    if (e instanceof z.ZodError) return json({ error: 'Invalid request.' }, 400);
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }, status);
  }
}

function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
