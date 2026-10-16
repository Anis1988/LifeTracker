import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { Alert, Item, Settings } from './model.ts';
import { iso, money } from './money.ts';
import { getAttachment, has, isRateLimit, readEmail, refresh, searchIds, type Attachment, type Mail } from './google.ts';
import { connection, open, saveConnection } from './server.ts';
import { classifyAttachment, fromEmailNote, vaultKey, type Route } from './vaultText.ts';
import { mimeOf, readBill, readVault, safeName, sha256 } from './vault.ts';
import { applyExtracted } from './sync.ts';
import { merchantKey } from './recurring.ts';
import { returnDaysFor } from './spend.ts';

/**
 * 📁 Documents attached to emails (Gmail is read-only). For each PDF or photo attached:
 *  1. a FREE look (file name, subject, sender's words; no AI): important document → Vault, receipt / invoice / bill → Money,
 *     newsletter, ad, logo → skipped;
 *  2. the AI reads only what's left (free AIs first, Claude last, daily limits, `vault.maxPerRun` a morning), and never
 *     the same file twice (kept by the file's SHA-256);
 *  3. Vault documents are saved straight in (owner's choice) with "From email: <subject> — <sender>, <date>" in the note
 *     and a heads-up; bills go to Inbox like an uploaded bill; receipts go to Money → Returns with the receipt attached.
 * The same attachment is never saved twice (file hash + Gmail message id).
 */
type NewAlert = Omit<Alert, 'id' | 'seen' | 'created_at'> & { user_id: string };

const QUERY = 'has:attachment -category:promotions -category:social -in:sent -in:chats -in:drafts (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png OR filename:heic OR filename:webp)';
const addDays = (d: string, n: number) => iso(new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000));

export async function vaultEmailStep(db: SupabaseClient, userId: string, s: Settings, alerts: NewAlert[], until: number): Promise<string | void> {
  if (!s.vault.emails) return;
  const c = await connection(db, userId, 'google');
  if (!c || !has(c.meta.scope as string, 'gmail')) return;
  const meta = (await connection(db, userId, 'vault'))?.meta ?? {};
  const seen = new Set((meta.seen as string[] | undefined) ?? []);
  const at = await refresh(await open(c.secret));
  // First time: the last 6 months; then the last few days (an email stopped half-way is looked at again).
  const ids = (await searchIds(at, `newer_than:${meta.scanned ? 5 : 180}d ${QUERY}`, meta.scanned ? 60 : 150)).filter((id) => !seen.has(id));
  const { data: items } = await db.from('items').select('*').eq('user_id', userId).neq('status', 'cancelled');
  let reads = 0, vault = 0, bills = 0, receipts = 0, skipped = 0, stopped = '';
  for (const id of ids) {
    if (Date.now() > until) { stopped = 'out of time: the rest next run'; break; }
    let m: Mail;
    try { m = await readEmail(at, id); } catch (e) { if (isRateLimit(e)) { stopped = 'Gmail asked to slow down'; break; } throw e; }
    let done = true;
    for (const a of (m.attachments ?? []).slice(0, 6)) {
      const route = classifyAttachment({ subject: m.subject, from: m.from, filename: a.filename, mime: a.mime, size: a.size, text: m.text, listUnsub: m.listUnsub, inline: a.inline });
      if (route === 'skip') { skipped++; continue; }
      if (reads >= s.vault.maxPerRun) { done = false; stopped = 'the rest next run'; break; }
      try {
        const r = await oneAttachment(db, userId, s, at, m, a, route, (items as Item[]) ?? [], alerts);
        reads += r.reads;
        if (r.saved === 'vault') vault++; else if (r.saved === 'bill') bills++; else if (r.saved === 'receipt') receipts++; else skipped++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/No AI could read|No AI is set up|limit/i.test(msg)) { done = false; stopped = msg.slice(0, 140); break; } // AI limits: this email again next run
        if (isRateLimit(e)) { done = false; stopped = 'Gmail asked to slow down'; break; }
        skipped++; // a broken file: don't try it every morning
      }
    }
    if (done) seen.add(id);
    if (!done) break;
  }
  await saveConnection(db, userId, 'vault', null, { seen: [...seen].slice(-4000), scanned: new Date().toISOString() });
  if (ids.length) return `${ids.length} email(s) with files: ${vault} to Vault, ${bills} bill(s) to Inbox, ${receipts} receipt(s) to Money → Returns, ${skipped} skipped for free${stopped ? ` (${stopped})` : ''}`;
}

async function oneAttachment(db: SupabaseClient, userId: string, s: Settings, at: string, m: Mail, a: Attachment, route: Route, items: Item[], alerts: NewAlert[]): Promise<{ saved?: 'vault' | 'bill' | 'receipt'; reads: number }> {
  const bytes = await getAttachment(at, m.id, a.attachmentId);
  const hash = await sha256(bytes);
  const mime = mimeOf(a.filename, a.mime);
  const note = fromEmailNote(m);
  const sourceKey = vaultKey(m.id, hash);
  // Already kept (this email, or the same file from anywhere: a scan, another email)? Nothing to do.
  const [{ data: inVault }, { data: inDocs }, { data: inBuys }] = await Promise.all([
    db.from('papers').select('id').eq('user_id', userId).or(`file_hash.eq.${hash},source_key.eq.${sourceKey}`).limit(1),
    db.from('documents').select('id').eq('user_id', userId).eq('hash', hash).limit(1),
    db.from('purchases').select('id, file').eq('user_id', userId).eq('key', `mail:${m.id}`).limit(1),
  ]);
  if (inVault?.length || inDocs?.length || inBuys?.[0]?.file) return { reads: 0 };

  let reads = 0;
  let moneyRoute: 'bill' | 'receipt' | null = null;
  if (route === 'vault' || route === 'maybe') {
    const r = await readVault(db, userId, s, { mime, bytes }, hash);
    if (!r.cached) reads++;
    const x = r.data;
    if (x.route === 'skip') return { reads };
    if (x.route === 'bill' || x.route === 'receipt') moneyRoute = x.route;
    else {
      const folderPath = `${userId}/vault/${crypto.randomUUID()}`;
      const path = `${folderPath}/${safeName(a.filename)}`;
      const up = await db.storage.from('docs').upload(path, bytes, { contentType: mime });
      if (up.error) throw new Error(`storage: ${up.error.message}`);
      const row = {
        user_id: userId, name: x.title || a.filename.replace(/\.[a-z0-9]+$/i, '').slice(0, 120) || 'Document', kind: x.idKind || 'other', folder: x.folder, holder: x.forWhom || null,
        number_end: x.numberEnd || null, doc_date: x.docDate || null, expires: x.dueDate || null, due_kind: x.dueKind, tags: x.tags, files: [path], file_hash: hash,
        summary: x.summary || null, body: x.text || null, notes: note, source: 'email', source_key: sourceKey, ai_by: r.by,
      };
      const { data: saved, error } = await db.from('papers').upsert(row, { onConflict: 'user_id,source_key', ignoreDuplicates: true }).select('id');
      if (error || !saved?.length) { await db.storage.from('docs').remove([path]); if (error) throw new Error(error.message); return { reads }; }
      alerts.push({ user_id: userId, kind: 'vault', key: `mail:${m.id}:${hash.slice(0, 12)}`, item_id: null, title: `📁 Saved to your Vault: ${row.name}${row.holder ? ` (${row.holder})` : ''}`.slice(0, 200), body: `${note}.${row.expires ? ` ${row.due_kind === 'due' ? 'Next due' : 'Expires'} ${row.expires}: you’ll get a heads-up.` : ''} Not useful? Delete it in Vault.`.slice(0, 500) });
      return { saved: 'vault', reads };
    }
  }

  // 💳 Money: a bill → Inbox (like an uploaded bill), a receipt → Money → Returns with the receipt attached.
  const b = await readBill(db, userId, s, { mime, bytes }, hash);
  if (!b.cached) reads++;
  const x = b.data;
  const path = `${userId}/money/${crypto.randomUUID()}-${safeName(a.filename)}`;
  const up = await db.storage.from('docs').upload(path, bytes, { contentType: mime });
  if (up.error) throw new Error(`storage: ${up.error.message}`);
  if (x.isBill && moneyRoute !== 'receipt') {
    const { data: doc, error } = await db.from('documents').insert({ user_id: userId, path, file_name: a.filename.slice(0, 200), mime, size: bytes.length, status: 'done', extracted: x, ai_by: b.by, origin: note, hash }).select('id').single();
    if (error) { await db.storage.from('docs').remove([path]); throw new Error(error.message); }
    // Same key as the bill emails read in the morning ("mail:<company>"): one suggestion per company, not two.
    const link = await applyExtracted(db, userId, x, 'email', `mail:${merchantKey(x.merchant || x.name)}`, { subject: m.subject, from: m.from, documentId: doc.id }, items, alerts);
    if (link.itemId) await db.from('documents').update({ item_id: link.itemId }).eq('id', doc.id);
    return { saved: 'bill', reads };
  }
  const store = (x.merchant || x.name || m.from.replace(/<[^>]*>/g, '').replace(/"/g, '')).trim().slice(0, 120) || 'Receipt';
  const days = returnDaysFor(`${store} ${m.from}`);
  const returnBy = days ? addDays(m.date, days) : null;
  const { data: prev } = await db.from('purchases').select('id').eq('user_id', userId).eq('key', `mail:${m.id}`).maybeSingle();
  if (prev) await db.from('purchases').update({ file: path }).eq('id', prev.id); // found by the order-email step already: add the receipt
  else {
    const { error } = await db.from('purchases').insert({ user_id: userId, key: `mail:${m.id}`, store, item: (x.name && x.name !== store ? x.name : null)?.slice(0, 200) ?? null, amount: x.amount, bought: m.date, return_by: returnBy, warranty_ends: null, status: returnBy ? 'keep' : 'kept', notes: note, file: path });
    if (error) { await db.storage.from('docs').remove([path]); throw new Error(error.message); }
    alerts.push({ user_id: userId, kind: 'return', key: `receipt:${m.id}`, item_id: null, title: `🧾 Receipt kept in Money → Returns: ${store}${x.amount ? ` ${money(x.amount)}` : ''}`.slice(0, 200), body: note });
  }
  return { saved: 'receipt', reads };
}
