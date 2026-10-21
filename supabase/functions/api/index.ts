import { z } from 'npm:zod@4.1.12';
import { admin, connection, cors, env, HttpError, json, saveConnection, settingsOf, sign, userOf, withCors } from '../_shared/server.ts';
import { claimSetupToken } from '../_shared/simplefin.ts';
import { authUrl, has, type Want } from '../_shared/google.ts';
import { readWithAi } from '../_shared/ai.ts';
import { applyExtracted, storeRows, syncUser } from '../_shared/sync.ts';
import { backfillLog, logMoney, shopOf } from '../_shared/moneyLog.ts';
import { SPEND_CATS, categorize, shopKey, spendCat } from '../_shared/spend.ts';
import { merchantKey } from '../_shared/recurring.ts';
import { blockOne, sendBox, unsubscribeOne } from '../_shared/unsub.ts';
import { EXTRA, allBoxes, mailBoxes, revoke, tokenOf } from '../_shared/mailbox.ts';
import { ask } from '../_shared/ask.ts';
import { summary } from '../_shared/summary.ts';
import { homeOf, nearbySearch, nearbyStep, thingsToDo, weekendFor } from '../_shared/nearbyFind.ts';
import { fridayOf } from '../_shared/place.ts';
import { todayIn } from '../_shared/money.ts';
import { negotiate } from '../_shared/negotiate.ts';
import { mimeOf, readVault } from '../_shared/vault.ts';
import { mergeBankRows, receiptAction, receiptFromFile, savedText, type BankRow, type ReceiptOp } from '../_shared/receipts.ts';
import type { Item, Sender } from '../_shared/model.ts';

/**
 * The app's server (POST /functions/v1/api {action, ...}), signed-in users only. Everything you can see or change
 * directly (bills, suggestions, documents, alerts, settings) goes straight to the database with Row Level Security;
 * this is only for what needs secrets: the bank, Google, the AI and the automatic run.
 */
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('bank-connect'), setupToken: z.string().min(20).max(2000) }),
  z.object({ action: z.literal('disconnect'), kind: z.union([z.enum(['simplefin', 'google']), z.string().regex(/^google:\d{1,3}$/)]) }),
  // extra: "＋ Add another Google account" ('new') or more permission for one already added ('google:<n>'): Gmail only.
  z.object({ action: z.literal('google-start'), want: z.array(z.enum(['calendar', 'gmail', 'mailbox'])).min(1).max(3), back: z.string().url().max(300), extra: z.union([z.literal('new'), z.string().regex(/^google:\d{1,3}$/)]).optional() }),
  z.object({ action: z.literal('google-extra'), kind: z.string().regex(/^google:\d{1,3}$/), on: z.boolean() }),
  z.object({ action: z.literal('run'), part: z.enum(['online', 'breaches', 'lists', 'week', 'purchases', 'appts', 'calendar', 'contacts', 'vault', 'mail', 'weekend']) }),
  z.object({ action: z.literal('phone-key') }),
  z.object({ action: z.literal('ask'), question: z.string().min(2).max(500), history: z.array(z.object({ q: z.string().max(500), a: z.string().max(2000) })).max(6).optional() }),
  z.object({ action: z.literal('unsubscribe'), id: z.string().uuid() }),
  z.object({ action: z.literal('block'), id: z.string().uuid() }),
  z.object({ action: z.literal('vault-read'), path: z.string().min(10).max(300) }),
  z.object({ action: z.literal('sync'), full: z.boolean().optional() }),
  z.object({ action: z.literal('read-doc'), id: z.string().uuid() }),
  z.object({ action: z.literal('summary') }),
  z.object({ action: z.literal('nearby'), op: z.enum(['home', 'search', 'todo', 'weekend']), zip: z.string().regex(/^\d{5}$/).optional(), q: z.string().max(80).optional(), kind: z.enum(['food', 'fun', 'events', 'trips']).optional(), step: z.enum(['map', 'routes', 'web']).optional() }),
  z.object({ action: z.literal('negotiate'), id: z.string().uuid(), okSwitch: z.boolean(), fresh: z.boolean().optional() }),
  z.object({ action: z.literal('receipt-add'), path: z.string().min(10).max(300) }),
  z.object({ action: z.literal('receipt'), op: z.enum(['edit', 'reread', 'delete', 'attach', 'detach', 'keep', 'line']), id: z.string().uuid(), entry: z.boolean().optional(), path: z.string().min(10).max(300).optional(), line: z.object({ description: z.string().trim().min(1).max(200), posted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().min(0.01).max(1e6), note: z.string().max(300).nullable() }).optional(), details: z.object({ store: z.string().max(120), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), total: z.number().min(0).max(1e6), tax: z.number().min(0).max(1e6).nullable(), card: z.string().regex(/^\d{4}$/).nullable(), items: z.array(z.object({ name: z.string().max(60), qty: z.number().min(0).max(1e4).nullable(), price: z.number().min(-1e6).max(1e6).nullable() })).max(40) }).optional() }),
  z.object({ action: z.literal('spend-cat'), id: z.string().uuid(), cat: z.enum(SPEND_CATS.map((c) => c.id) as [string, ...string[]]) }),
  z.object({ action: z.literal('money-log'), op: z.enum(['backfill', 'bill-undo']), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), id: z.string().uuid().optional() }),
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
        const [bank, google, status, me, mail, phone, contacts, vault, receipts, boxes] = await Promise.all([connection(db, user.id, 'simplefin'), connection(db, user.id, 'google'), connection(db, user.id, 'status'), connection(db, user.id, 'me'), connection(db, user.id, 'mail'), connection(db, user.id, 'phone'), connection(db, user.id, 'contacts'), connection(db, user.id, 'vault'), connection(db, user.id, 'receipts'), allBoxes(db, user.id)]);
        const { data: usage } = await db.from('ai_usage').select('provider, n').eq('user_id', user.id).eq('day', new Date().toISOString().slice(0, 10));
        return json({
          bank: bank ? { connected: true, lastSync: bank.meta.lastSync ?? null, accounts: bank.meta.accounts ?? [], errors: bank.meta.errors ?? [] } : { connected: false },
          google: google ? { connected: true, email: google.meta.email ?? null, calendar: has(google.meta.scope as string, 'calendar'), gmail: has(google.meta.scope as string, 'gmail'), lastGmail: google.meta.gmailScanned ?? null, alertsScanned: google.meta.alertsScanned ?? null, alertsRead: google.meta.alertsRead ?? 0, alertBanks: google.meta.alertBanks ?? [], mailbox: has(google.meta.scope as string, 'mailbox'), lastScan: google.meta.lastScan ?? null } : { connected: false },
          // ✉️ Extra Gmail accounts (no secrets: only what Settings shows).
          googleExtras: boxes.filter((b) => !b.main).map((b) => ({ kind: b.kind, email: b.email, on: b.on, gmail: has(b.scope, 'gmail'), mailbox: has(b.scope, 'mailbox'), lastScan: b.meta.lastScan ?? null, lastError: b.meta.lastError ?? null, connectedAt: b.meta.connectedAt ?? null })),
          me: { lastOnline: me?.meta.lastOnline ?? null, lastErrors: me?.meta.lastErrors ?? [], weekSent: me?.meta.weekSent ?? null, breachScanned: me?.meta.breachScanned ?? null },
          mail: { lastSweep: mail?.meta.lastSweep ?? null, sweepDone: !!mail?.meta.sweepDone, headsRead: mail?.meta.headsRead ?? 0, apptsScanned: mail?.meta.apptsScanned ?? null, contactsScanned: contacts?.meta.scanned ?? null, vaultScanned: vault?.meta.scanned ?? null, receiptsScanned: receipts?.meta.scanned ?? null, mailChecked: receipts?.meta.mailChecked ?? null, check: receipts?.meta.mailCheck ?? null },
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
        // An extra Gmail account: Google is also told to forget LifeTracker's access (its own grant, not the main one).
        const extra = body.kind.startsWith(EXTRA) ? await connection(db, user.id, body.kind) : null;
        await db.from('connections').delete().eq('user_id', user.id).eq('kind', body.kind);
        if (extra?.secret) await revoke(extra.secret);
        return json({ ok: true });
      }
      case 'google-extra': {
        const cur = await connection(db, user.id, body.kind);
        if (!cur) throw new HttpError('That Google account isn’t connected any more.', 404);
        await saveConnection(db, user.id, body.kind, null, { on: body.on });
        return json({ ok: true });
      }
      case 'google-start': {
        if (!env('GOOGLE_CLIENT_ID')) throw new HttpError('Google isn’t set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the Guide → Setting it up).', 503);
        if (body.extra) {
          // ＋ Another Google account: Gmail only (read-only), + the mailbox permission only if asked for that account.
          const cur = body.extra === 'new' ? null : await connection(db, user.id, body.extra);
          if (body.extra !== 'new' && !cur) throw new HttpError('That Google account isn’t connected any more.', 404);
          const want = [...new Set(['gmail', ...body.want.filter((w) => w !== 'calendar'), ...(has(cur?.meta.scope as string, 'mailbox') ? ['mailbox'] : [])])] as Want[];
          const payload = btoa(JSON.stringify({ u: user.id, b: body.back, t: Date.now(), x: body.extra }));
          return json({ url: authUrl(want, `${payload}.${await sign(payload)}`, { pick: true }) });
        }
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
      case 'nearby': {
        // 📍 Places near your zip (OpenStreetMap first, then the free Gemini with Google Search), things to do, this weekend.
        const s = await settingsOf(db, user.id);
        if (body.op === 'home') return json(await homeOf(db, user.id, { place: { zip: body.zip ?? s.place.zip } }));
        // The app asks in steps (map → routes → web) so results show as they come; without a step it's one call.
        if (body.step && (body.op === 'search' || body.op === 'todo')) return json(await nearbyStep(db, user.id, s, body.step, body.op === 'todo' ? { kind: body.kind ?? 'fun' } : { q: body.q ?? '' }));
        if (body.op === 'search') return json(await nearbySearch(db, user.id, s, body.q ?? ''));
        if (body.op === 'todo') return json(await thingsToDo(db, user.id, s, body.kind ?? 'fun'));
        return json((await weekendFor(db, user.id, s, fridayOf(todayIn(s.appts.timeZone || 'America/New_York')))).w);
      }
      case 'negotiate':
        // 💬 "Get a lower price": one AI read, then kept on the bill per price (free the next time).
        return json(await negotiate(db, user.id, await settingsOf(db, user.id), body.id, body.okSwitch, body.fresh));
      case 'ask':
        return json(await ask(db, user.id, await settingsOf(db, user.id), body.question, body.history ?? []));
      case 'unsubscribe':
      case 'block': {
        const { data: sender } = await db.from('senders').select('*').eq('id', body.id).eq('user_id', user.id).maybeSingle();
        if (!sender) throw new HttpError('Not found.', 404);
        // ✉️ Every mailbox watched: the unsubscribe email goes from one that may send; blocking tidies each one that allows it.
        const boxes = await mailBoxes(db, user.id);
        const { at, mailbox } = await sendBox(boxes);
        if (body.action === 'block') {
          const ats = await Promise.all(boxes.filter((b) => has(b.scope, 'mailbox')).map(tokenOf));
          if (!ats.length) throw new HttpError('Blocking needs “Manage mailing lists” (Settings → Mailing lists → Allow).', 400);
          const moved = await blockOne(db, user.id, sender as Sender, ats);
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
      case 'receipt-add': {
        // 🧾 A receipt added by hand (photo / PDF in this person's own folder): read once (cached by hash) → Spending, counted once.
        if (!(body.path.startsWith(`${user.id}/money/`) || body.path.startsWith(`${user.id}/vault/`)) || body.path.includes('..')) throw new HttpError('Not found.', 404);
        const { data: file, error } = await db.storage.from('docs').download(body.path);
        if (error || !file) throw new HttpError('The file is missing.', 404);
        const r = await receiptFromFile(db, user.id, await settingsOf(db, user.id), body.path, new Uint8Array(await file.arrayBuffer()), mimeOf(body.path, file.type));
        if (r.status === 'known') await db.storage.from('docs').remove([body.path]); // already there: not kept twice
        return json({ ...r, text: savedText(r.status, r.business, r.amount) });
      }
      case 'receipt': {
        if ((body.op === 'edit' && !body.details) || (body.op === 'attach' && !body.path) || (body.op === 'line' && !body.line)) throw new HttpError('Invalid request.', 400);
        const op: ReceiptOp = body.op === 'edit' ? { op: 'edit', id: body.id, details: body.details! } : body.op === 'reread' ? { op: 'reread', id: body.id }
          : body.op === 'attach' ? { op: 'attach', id: body.id, path: body.path! } : body.op === 'detach' ? { op: 'detach', id: body.id } : body.op === 'keep' ? { op: 'keep', id: body.id }
          : body.op === 'line' ? { op: 'line', id: body.id, line: body.line! } : { op: 'delete', id: body.id, entry: !!body.entry };
        return json(await receiptAction(db, user.id, await settingsOf(db, user.id), op));
      }
      case 'spend-cat': {
        // 🏷️ Move a purchase's shop to another category: saved as the shop's rule (Settings.spend.rules), so the row,
        // the category totals and the budgets all use it from now on (the same shopKey + categorize everywhere).
        const { data: t } = await db.from('transactions').select('id, amount, description, merchant, item_id, source, details').eq('id', body.id).eq('user_id', user.id).maybeSingle();
        if (!t) throw new HttpError('Not found.', 404);
        const { data: row } = await db.from('settings').select('data').eq('user_id', user.id).maybeSingle();
        const data = (row?.data ?? {}) as Record<string, unknown> & { spend?: { rules?: Record<string, string> } };
        const before = categorize(t, (await settingsOf(db, user.id)).spend.rules);
        const key = shopKey(t);
        const spend = { ...(data.spend ?? {}), rules: { ...(data.spend?.rules ?? {}), [key]: body.cat } };
        const { error } = await db.from('settings').upsert({ user_id: user.id, data: { ...data, spend } });
        if (error) throw new Error(error.message);
        if (before !== body.cat) await logMoney(db, user.id, [{ kind: 'change', ref: t.id, data: { tx: t.id, from: before, to: body.cat, key }, text: `${shopOf(t)} · category ${spendCat(before).label} → ${spendCat(body.cat).label} (rule saved: this shop from now on)` }]);
        return json({ ok: true, key, rules: spend.rules });
      }
      case 'money-log': {
        if (body.op === 'backfill') {
          // 📜 First open of the Log: "added" lines for this month's purchases already there (once; no AI).
          const c = await connection(db, user.id, 'moneylog');
          const month = body.month ?? new Date().toISOString().slice(0, 7);
          if (c?.meta.backfilled === month) return json({ added: 0 });
          const added = await backfillLog(db, user.id, month);
          await saveConnection(db, user.id, 'moneylog', null, { backfilled: month });
          return json({ added });
        }
        // ↶ A bill added by itself was undone in the app (Inbox): one Log line from the remembered row.
        const { data: sg } = await db.from('suggestions').select('id, name, amount, status').eq('id', body.id ?? '').eq('user_id', user.id).maybeSingle();
        if (!sg || sg.status !== 'ignored') return json({ ok: false });
        await logMoney(db, user.id, [{ kind: 'bill', ref: null, key: `undo:${sg.id}`, data: { suggestion: sg.id }, text: `bill ${sg.name}${sg.amount ? ` $${Number(sg.amount).toFixed(2)}` : ''} undone (won’t be added again)` }]);
        return json({ ok: true });
      }
      case 'import-csv': {
        // A bank CSV read on the device: stored like bank transactions, then the recurring ones are found.
        // 🧾 A purchase already in Spending from its receipt is merged into that line (counted once).
        const all: BankRow[] = body.rows.map((r) => ({
          user_id: user.id, external_id: `csv:${r.date}:${r.amount}:${r.description.slice(0, 60)}`, account: r.account ?? 'CSV import',
          posted: r.date, amount: r.amount, description: r.description, merchant: merchantKey(r.description), source: 'csv' as const,
        }));
        const { rows } = await mergeBankRows(db, user.id, all);
        await storeRows(db, user.id, rows, (await settingsOf(db, user.id)).spend.rules);
        const log = await syncUser(db, user.id, user.email);
        return json({ ok: true, imported: all.length, log });
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
