import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { getAttachment, isRateLimit, readEmail, type Mail } from './google.ts';
import { allBoxes, boxTag, tokenOf, type Box } from './mailbox.ts';
import { connection, saveConnection } from './server.ts';
import { iso } from './money.ts';
import { barcodeImgOf, barcodeNumberOf, barsOf, cleanBarcode, formatOf, htmlText, type Barcode } from './barcode.ts';
import type { ReceiptDetails } from './receiptText.ts';

/**
 * 🔲 Receipt barcodes from emails (server side, free, no AI): the barcode picture in the email's HTML is copied into
 * the private `docs` bucket (`<uid>/receipts/barcode-<msg id>.<ext>`: https only (http tried as https), public
 * addresses only, every redirect checked again, images only, 500 KB at most; CID attachments and data: pictures too).
 * The value: from the barcode maker's address (TJX), else bars drawn in HTML/SVG, else the number printed with it
 * (free patterns on the HTML's words, `barcode.ts`).
 */
const MAX = 500 * 1024;
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/bmp': 'bmp' };
const PRIVATE = /^(localhost|.*\.(local|internal|localdomain|lan|home|corp)|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[?::1?\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:|\[?::ffff:)/i;

/** A picture from the web, read safely: https, a public host (each redirect checked again), an image type, ≤ 500 KB. */
export async function fetchImage(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  let u = url;
  for (let hop = 0; hop < 6; hop++) {
    const p = new URL(u);
    if (p.protocol !== 'https:' || PRIVATE.test(p.hostname) || /^\d+$/.test(p.hostname)) throw new Error('not a public https picture');
    const res = await fetch(p, { redirect: 'manual', headers: { Accept: 'image/*' }, signal: AbortSignal.timeout(12_000) });
    if (res.status >= 300 && res.status < 400) { const to = res.headers.get('location'); await res.body?.cancel(); if (!to) throw new Error('bad redirect'); u = new URL(to, p).toString(); continue; }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!TYPES[mime]) { await res.body?.cancel(); throw new Error('not a picture'); }
    if (Number(res.headers.get('content-length') ?? 0) > MAX) { await res.body?.cancel(); throw new Error('picture too big'); }
    const reader = res.body!.getReader();
    const parts: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > MAX) { await reader.cancel(); throw new Error('picture too big'); }
      parts.push(value);
    }
    const bytes = new Uint8Array(n);
    let o = 0;
    for (const x of parts) { bytes.set(x, o); o += x.length; }
    return { bytes, mime };
  }
  throw new Error('too many redirects');
}

const sniff = (b: Uint8Array, given: string) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x47 && b[1] === 0x49 ? 'image/gif' : TYPES[given] ? given : '');

/** The barcode of one receipt email (or null): its picture kept in this person's folder, and the number with it. */
export async function barcodeForMail(db: SupabaseClient, userId: string, at: string, m: Mail): Promise<Barcode | null> {
  const img = barcodeImgOf(m.html);
  const bars = img ? null : barsOf(m.html);
  // the HTML's own words too: the plain part may be a "can't show HTML" stub
  const text = m.html ? `${m.text}\n${htmlText(m.html.slice(0, 300_000))}` : m.text;
  const value = img?.value ?? bars?.value ?? barcodeNumberOf(text, img?.after ?? bars?.after) ?? '';
  let image: string | undefined;
  if (img) {
    try {
      let file: { bytes: Uint8Array; mime: string };
      const data = img.src.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i);
      if (data) {
        const b64 = data[2].replace(/\s+/g, '');
        if (b64.length * 0.75 > MAX) throw new Error('picture too big');
        file = { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), mime: data[1].toLowerCase() };
      } else if (/^cid:/i.test(img.src)) {
        const cid = img.src.slice(4).replace(/^<|>$/g, '');
        const a = (m.attachments ?? []).find((x) => x.cid === cid);
        if (!a || a.size > MAX) throw new Error('no picture');
        const bytes = await getAttachment(at, m.id, a.attachmentId);
        file = { bytes, mime: a.mime };
      } else file = await fetchImage(img.src.replace(/^http:/i, 'https:'));
      const mime = sniff(file.bytes, file.mime);
      if (!mime || file.bytes.length > MAX) throw new Error('not a picture');
      const path = `${userId}/receipts/barcode-${m.id.replace(/[^\w-]/g, '')}.${TYPES[mime]}`;
      const up = await db.storage.from('docs').upload(path, file.bytes, { contentType: mime, upsert: true });
      if (!up.error) image = path;
    } catch { /* the number alone is still kept */ }
  }
  if (img?.qr && !img.value && image) return cleanBarcode({ value: '', format: 'qr', image, from: 'email' });
  return cleanBarcode({ value, format: img?.value ? img.format ?? formatOf(value) : bars?.value ? 'code128' : value ? formatOf(value) : 'unknown', image, from: 'email' });
}

/** The mailbox a receipt email came from: `gmail:<id>|<address>`, else details.mailbox, else the main one. */
export function boxOfReceipt(boxes: Box[], path: string | null, mailbox?: string | null): Box | undefined {
  const tag = path?.startsWith('gmail:') ? path.split('|')[1] : undefined;
  const want = (tag ?? mailbox ?? '').toLowerCase();
  return (want ? boxes.find((b) => b.email?.toLowerCase() === want || b.kind === want) : undefined) ?? (tag ? undefined : boxes.find((b) => b.main));
}
/** The Gmail message of a receipt (from its key `mail:<id>:…`), or null. */
export const messageOf = (key: string | null) => (key?.startsWith('mail:') ? key.split(':')[1] || null : null);

type Row = { id: string; receipt_key: string | null; receipt_path: string | null; details: ReceiptDetails | null; posted: string; amount: number; description: string | null };
const baseDetails = (t: Row): ReceiptDetails => ({ store: t.description ?? '', date: t.posted, total: Math.abs(Number(t.amount)), tax: null, card: null, items: [], read: 'hand' });

/** 🔲 Find a receipt's barcode again from its email (the right mailbox): null when the email has none. */
export async function barcodeFromEmail(db: SupabaseClient, userId: string, t: Row, boxes?: Box[]): Promise<Barcode | null> {
  const msg = messageOf(t.receipt_key);
  if (!msg) return null;
  const box = boxOfReceipt(boxes ?? await allBoxes(db, userId), t.receipt_path, t.details?.mailbox);
  if (!box) throw new Error('The mailbox of this receipt is not connected any more.');
  let at: string, m: Mail;
  try {
    at = await tokenOf(box);
    m = await readEmail(at, msg, boxTag(box));
  } catch (e) {
    const why = e instanceof Error ? e.message.replace(/^Google:\s*/, '') : String(e);
    throw new Error(/not found|HTTP 404/i.test(why) ? 'This receipt email is no longer in Gmail (deleted?).' : `Couldn't reach Gmail: ${why.slice(0, 120)}`);
  }
  return barcodeForMail(db, userId, at, m);
}
export const withBarcode = (t: Row, b: Barcode | null): ReceiptDetails => ({ ...(t.details ?? baseDetails(t)), barcode: b });

/**
 * One time (in the daily run, a few each day): email receipts of the last 90 days without a barcode get theirs from
 * their email. Free (no AI); its own memory (`barcodeTried` in the `receipts` connection), at most 25 emails a run.
 */
export async function barcodeBackfillStep(db: SupabaseClient, userId: string, boxes: Box[], until: number): Promise<string | void> {
  if (!boxes.length) return;
  const meta = (await connection(db, userId, 'receipts'))?.meta ?? {};
  const tried = new Set((meta.barcodeTried as string[] | undefined) ?? []);
  const since = iso(new Date(Date.now() - 90 * 86400_000));
  const { data } = await db.from('transactions').select('id, receipt_key, receipt_path, details, posted, amount, description')
    .eq('user_id', userId).like('receipt_key', 'mail:%').gte('posted', since).order('posted', { ascending: false }).limit(400);
  const todo = ((data ?? []) as Row[]).filter((t) => !t.details?.barcode && !tried.has(t.id)).slice(0, 25);
  if (!todo.length) return;
  let found = 0, stopped = '';
  for (const t of todo) {
    if (Date.now() > until) { stopped = 'the rest next run'; break; }
    try {
      const b = await barcodeFromEmail(db, userId, t, boxes);
      if (b) { await db.from('transactions').update({ details: withBarcode(t, b) }).eq('id', t.id).eq('user_id', userId); found++; }
    } catch (e) { if (isRateLimit(e)) { stopped = 'Gmail asked to slow down'; break; } }
    tried.add(t.id);
  }
  await saveConnection(db, userId, 'receipts', null, { barcodeTried: [...tried].slice(-3000), barcodeScanned: new Date().toISOString() });
  if (found || stopped) return `${found} barcode(s) found on older receipt emails${stopped ? ` (${stopped})` : ''}`;
}
