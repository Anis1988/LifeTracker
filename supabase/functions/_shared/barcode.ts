/**
 * 🔲 A receipt's barcode (owner's request: "if I lose the paper receipt I can always scan the one in the app").
 * Shared by the app and the server (plain TypeScript, no AI, no Deno/browser APIs):
 *  - `barcodeImgOf`: the barcode picture in a receipt email's HTML (alt/src/class saying "barcode", or a long thin
 *    picture next to "receipt #" / "TC#" words);
 *  - `barcodeNumberOf`: the number printed under it (Walmart TC#, Target REC#, "Receipt #", "Transaction #",
 *    Store/Reg/Trans, a line of 14–30 digits);
 *  - `cleanBarcode`: what is kept in `transactions.details.barcode`.
 */
export type BarcodeFormat = 'code128' | 'itf' | 'qr' | 'ean13' | 'unknown';
export interface Barcode {
  /** What the barcode holds (digits / letters; a QR code may hold a link). '' when only its picture was found. */
  value: string;
  format: BarcodeFormat;
  /** The barcode picture found in the email, in the private bucket (`<uid>/receipts/barcode-<msg id>.<ext>`). */
  image?: string;
  /** email = read from the receipt email; photo = decoded on the phone; ai = the number the AI read under it. */
  from: 'email' | 'photo' | 'ai';
}
export const BARCODE_FORMATS: BarcodeFormat[] = ['code128', 'itf', 'qr', 'ean13', 'unknown'];

/** A 13-digit number with a right EAN check digit. */
export function eanOk(v: string): boolean {
  if (!/^\d{13}$/.test(v)) return false;
  const s = [...v.slice(0, 12)].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (s % 10)) % 10 === Number(v[12]);
}
/** The best guess when only the number is known (Code 128 draws anything). */
export const formatOf = (v: string): BarcodeFormat => (eanOk(v) ? 'ean13' : 'code128');

/** A barcode as kept (or null): trimmed, printable, at most 300 characters; 1D values without spaces or dashes. */
export function cleanBarcode(b: Partial<Barcode> | null | undefined): Barcode | null {
  if (!b) return null;
  const format: BarcodeFormat = BARCODE_FORMATS.includes(b.format as BarcodeFormat) ? b.format as BarcodeFormat : 'unknown';
  let value = String(b.value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 300);
  if (format !== 'qr' && /^[\dA-Z][\dA-Z \-]*$/i.test(value) && /\d/.test(value)) value = value.replace(/[\s-]+/g, '').toUpperCase();
  const image = typeof b.image === 'string' && b.image ? b.image : undefined;
  if (!value && !image) return null;
  if (format !== 'qr' && value && value.replace(/\D/g, '').length < 6 && !/^[A-Z0-9]{8,}$/.test(value)) return image ? { value: '', format, image, from: b.from ?? 'email' } : null;
  return { value, format, ...(image ? { image } : {}), from: b.from === 'photo' || b.from === 'ai' ? b.from : 'email' };
}

/** "12345678901234567890" → "1234 5678 9012 3456 7890" (easier to read out at the till). */
export const groupDigits = (v: string) => (/^\d{8,}$/.test(v) ? v.replace(/(\d{4})(?=\d)/g, '$1 ') : v);

// ---------- ✉️ in a receipt email ----------
const LABEL = /(barcode|bar code|receipt\s*(#|no\.?|number|id|code)|transaction\s*(#|no\.?|number|id)|\btrans\b|\btc\s?#|\brec\s?#|scan (this|at|the)|return code|show this)/i;
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((x) => x != null) ?? '';
const px = (s: string) => { const m = s.match(/^\s*(\d{1,4})(px)?\s*$/i); return m ? Number(m[1]) : null; };
const styleDim = (style: string, k: 'width' | 'height') => px(style.match(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([^;]+)`, 'i'))?.[1] ?? '');
export const htmlText = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|td|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#35;|&num;/g, '#').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

export interface BarcodeImg { src: string; qr: boolean; after: string; score: number }
/**
 * The barcode picture of a receipt email (the best one, or null): alt / src / class / title naming a barcode (or a QR
 * code), else a long thin picture (at least 2.5× wider than high, at most 160 px high) with "receipt # / TC# /
 * transaction" words close to it. Logos, social icons and tracking pixels are skipped. `after` = the words just after it.
 */
export function barcodeImgOf(html: string | undefined): BarcodeImg | null {
  if (!html) return null;
  let best: BarcodeImg | null = null;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, 'src').replace(/&amp;/g, '&').trim();
    if (!src || !/^(https:\/\/|cid:)/i.test(src)) continue;
    const words = `${attr(tag, 'alt')} ${attr(tag, 'title')} ${attr(tag, 'class')} ${attr(tag, 'id')} ${src.split('?')[0]}`.toLowerCase();
    if (/logo|facebook|twitter|instagram|pinterest|youtube|tiktok|linkedin|icon|social|spacer|pixel|tracking|open\.gif|beacon|app.?store|google.?play|banner|hero|promo/.test(words) && !/bar.?code/.test(words)) continue;
    const style = attr(tag, 'style');
    const w = px(attr(tag, 'width')) ?? styleDim(style, 'width');
    const h = px(attr(tag, 'height')) ?? styleDim(style, 'height');
    if ((w != null && w < 40) || (h != null && h < 12)) continue; // pixels, bullets
    const at = m.index ?? 0;
    const near = htmlText(`${html.slice(Math.max(0, at - 800), at)} ${html.slice(at + tag.length, at + tag.length + 800)}`);
    const after = htmlText(html.slice(at + tag.length, at + tag.length + 600)).slice(0, 300);
    const qr = /\bqr\b|qr.?code|qrcode/.test(words);
    let score = 0;
    if (/bar.?code|barcode/.test(words)) score += 10;
    if (qr) score += 8;
    if (w != null && h != null && w >= h * 2.5 && h <= 160) score += 4;
    if (LABEL.test(near)) score += 3;
    if (/^cid:/i.test(src)) score += 1;
    if (score < (qr || /bar.?code/.test(words) ? 8 : 7)) continue;
    if (!best || score > best.score) best = { src, qr, after, score };
  }
  return best;
}

/** One value out of a label's text: "2-4511-0044-0091" → "2451100440091". */
const digitsOf = (s: string) => s.replace(/[\s-]+/g, '');
const LONG_LINE = /^\s*[*#]?\s*((?:\d[\s-]?){14,30})\s*[*#]?\s*$/;

/**
 * The number printed with a receipt's barcode, free: (1) a 12–30 digit run just under the barcode picture, (2) a
 * labelled number (Walmart "TC# …", Target "REC# …", "Receipt #", "Transaction #/ID"), (3) a line that is only a long
 * number (14–30 digits), (4) "Store 0123 Reg 004 Trans 5678" (TJX / HomeGoods style). Phone and card numbers never.
 */
export function barcodeNumberOf(text: string, after = ''): string | null {
  if (after) {
    const m = after.match(/(?:^|[^\d])((?:\d[\s-]?){12,30})(?!\d)/);
    if (m && !/(\(\d{3}\)|phone|tel|call)/i.test(after.slice(0, (m.index ?? 0) + 2))) return digitsOf(m[1]).replace(/-$/, '');
  }
  const t = text.slice(0, 30_000);
  const tok = '([\\dA-Z][\\dA-Z-]{3,29}(?:\\s\\d[\\d-]{2,})*)'; // a first part, then only groups of digits ("1234 5678")
  const labelled: RegExp[] = [
    /\bTC\s?#\s*:?\s*((?:\d[\s-]?){12,30})/i, // Walmart
    /\bREC\s?#\s*:?\s*((?:\d[\s-]?){10,30})/i, // Target
    new RegExp(`\\b(?:receipt|transaction|trans(?:action)?\\.?)\\s*(?:#|no\\.?|number|id|code|barcode)\\s*:?\\s*${tok}`, 'i'),
    new RegExp(`\\b(?:barcode|bar code|return code)\\s*(?:#|no\\.?|number)?\\s*:?\\s*${tok}`, 'i'),
  ];
  for (const re of labelled) {
    const m = t.match(re);
    if (!m) continue;
    const v = digitsOf(m[1]).replace(/-+$/, '').toUpperCase();
    if (v.length >= 8 && v.replace(/\D/g, '').length >= 4) return v;
  }
  for (const line of t.split(/\n/)) {
    const m = line.match(LONG_LINE);
    if (m) return digitsOf(m[1]);
  }
  const srt = t.match(/\bst(?:ore)?\s?#?\s*:?\s*(\d{2,5})\b[^\n\d]{0,12}\breg(?:ister)?\s?#?\s*:?\s*(\d{1,4})\b[^\n\d]{0,12}\btr(?:ans|ansaction|n)?\s?#?\s*:?\s*(\d{2,6})\b/i);
  if (srt) return `${srt[1]}${srt[2]}${srt[3]}`;
  return null;
}
