/**
 * 🔲 A receipt's barcode (owner's request: "if I lose the paper receipt I can always scan the one in the app").
 * Shared by the app and the server (plain TypeScript, no AI, no Deno/browser APIs):
 *  - `barcodeImgOf`: the barcode picture in a receipt email's HTML (alt/name/src/class saying "barcode", a barcode
 *    maker's address (`barcodeOfUrl`, also behind tracking links), or a long thin picture next to "receipt #" / "TC#");
 *  - `barcodeOfUrl`: the value a barcode maker's picture address carries (TJX `…/bc/<settings>/<value>`, `?data=`…);
 *  - `barsOf`: a barcode drawn with HTML table cells / boxes or SVG rects: Code 128 decoded from the bar widths, else
 *    the words printed just after it;
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
const LABEL = /(barcode|bar code|receipt\s*(#|no\.?|number|id|code)|transaction\s*(#|no\.?|number|id)|\btrans\b|\btxn\b|\btrn\b|\btc\s?#|\brec\s?#|scan (this|at|the)|return code|show this|for store use)/i;
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((x) => x != null) ?? '';
const px = (s: string) => { const m = s.match(/^\s*(\d{1,4})(px)?\s*$/i); return m ? Number(m[1]) : null; };
const styleDim = (style: string, k: 'width' | 'height') => px(style.match(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([^;]+)`, 'i'))?.[1] ?? '');
// Inline tags join (a number split as <b>12</b><b>34</b> stays one); blocks and other tags become a space / line.
export const htmlText = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/^[^<]*?>|<[^>]*$/g, ' ').replace(/<\/?(?:span|b|strong|em|i|u|font|small|big|sup|sub)\b[^>]*>/gi, '').replace(/<br\s*\/?>|<\/(p|div|tr|li|td|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#35;|&num;/g, '#').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// ---------- 🔗 a barcode maker's picture address ----------
const GEN = /bar.?code|\/bc\/|\/bcgen|\/qr(code)?\b|qr.?server|bwip|metafloor|tec-it|quickchart|chart\.googleapis|barcodeapi|\/(c128|code128|itf|ean13)\//i;
const KIND = /^(c(ode)?[\s_-]?128[abc]?|code[\s_-]?39|ean[\s_-]?13|upc[\s_-]?a?|itf(14)?|i2of5|interleaved.*|qr([\s_-]?code)?|datamatrix|pdf417|aztec)$/i;
const VALUE_KEYS = ['data', 'text', 'value', 'code', 'barcode', 'content', 'chl', 'msg', 'number', 'd', 'v'];
const kindOf = (t: string): BarcodeFormat | null => (/qr/i.test(t) ? 'qr' : /128/.test(t) ? 'code128' : /itf|i2of5|interleaved/i.test(t) ? 'itf' : /ean.?13/i.test(t) ? 'ean13' : null);
const b64json = (seg: string): Record<string, unknown> | null => {
  if (!/^eyJ[\w-]+=*$/.test(seg)) return null; // base64 of '{"'
  try { const j = JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/'))); return j && typeof j === 'object' ? j : null; } catch { return null; }
};
/** A link inside a tracking / redirect address (`?url=https%3A…`), else null. */
export function innerUrl(src: string): string | null {
  try {
    for (const [, v] of new URL(src).searchParams) if (/^https?:\/\//i.test(v)) return v;
  } catch { /* not a URL */ }
  return null;
}
/**
 * The value a barcode maker's picture address carries, or null: a value parameter (`?data=` / `text=` / `code=` / `chl=`
 * …, a symbology name there counts as the kind instead), else the last path part (`…/bc/<settings>/T1131…`, TJX). The
 * kind from `type=` / `bcid=` / `cht=` / a base64 settings part ({"type":"C128"}). Tracking wrappers are looked through.
 */
export function barcodeOfUrl(src: string): { value: string; format: BarcodeFormat } | null {
  const inner = innerUrl(src);
  if (inner) { const r = barcodeOfUrl(inner); if (r) return r; }
  let u: URL;
  try { u = new URL(src); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !GEN.test(`${u.hostname}${u.pathname}`)) return null;
  let kind: BarcodeFormat | null = null;
  let value = '';
  for (const k of ['type', 'bcid', 'symbology', 'cht', 'format', 'code_type', 'bc', 'code']) {
    const v = u.searchParams.get(k);
    if (v && KIND.test(v.trim())) { kind ??= kindOf(v); }
  }
  for (const k of VALUE_KEYS) {
    const v = u.searchParams.get(k)?.trim();
    if (v && !KIND.test(v) && v.length >= 4) { value = v; break; }
  }
  const segs = u.pathname.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  for (const seg of segs) {
    const j = b64json(seg);
    if (!j) continue;
    for (const k of ['type', 'bcid', 'symbology', 'format']) if (typeof j[k] === 'string') kind ??= kindOf(j[k] as string);
    for (const k of ['data', 'value', 'code']) if (!value && typeof j[k] === 'string' && (j[k] as string).length >= 4) value = j[k] as string;
  }
  if (!value && segs.length >= 2) {
    const last = segs[segs.length - 1].replace(/\.(png|gif|jpe?g|svg|webp|bmp)$/i, '');
    if (KIND.test(last)) kind ??= kindOf(last);
    // a value: letters/digits (with dashes), at least one digit, not a picture hash / settings part
    else if (/^[A-Z0-9][A-Z0-9-]{5,79}$/i.test(last) && /\d/.test(last) && !/^[a-f0-9]{24,}$/i.test(last) && !b64json(last)) value = last;
    if (!kind) for (const seg of segs.slice(0, -1)) if (KIND.test(seg)) { kind = kindOf(seg); break; }
  }
  if (!value) return null;
  if (!kind && /qr/i.test(`${u.hostname}${u.pathname}`)) kind = 'qr';
  const format = kind ?? (/^[\x20-\x7e]+$/.test(value) ? formatOf(value) : 'qr');
  return { value: value.slice(0, 300), format };
}

export interface BarcodeImg { src: string; qr: boolean; after: string; score: number; value?: string; format?: BarcodeFormat }
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
    if (!src || !/^(https?:\/\/|cid:|data:image\/(png|gif|jpe?g|webp|bmp);base64,)/i.test(src)) continue;
    const data = /^data:/i.test(src);
    const inner = data ? null : innerUrl(src);
    const fromUrl = data ? null : barcodeOfUrl(src);
    const words = `${attr(tag, 'alt')} ${attr(tag, 'title')} ${attr(tag, 'class')} ${attr(tag, 'id')} ${attr(tag, 'name')} ${data ? '' : src.split('?')[0]} ${inner?.split('?')[0] ?? ''}`.toLowerCase();
    if (/logo|facebook|twitter|instagram|pinterest|youtube|tiktok|linkedin|icon|social|spacer|pixel|tracking|open\.gif|beacon|app.?store|google.?play|banner|hero|promo/.test(words) && !/bar.?code/.test(words)) continue;
    const style = attr(tag, 'style');
    const w = px(attr(tag, 'width')) ?? styleDim(style, 'width');
    const h = px(attr(tag, 'height')) ?? styleDim(style, 'height');
    if ((w != null && w < 40) || (h != null && h < 12)) continue; // pixels, bullets
    const at = m.index ?? 0;
    const near = htmlText(`${html.slice(Math.max(0, at - 800), at)} ${html.slice(at + tag.length, at + tag.length + 800)}`);
    const after = htmlText(html.slice(at + tag.length, at + tag.length + 600)).slice(0, 300);
    const qr = fromUrl ? fromUrl.format === 'qr' : /\bqr\b|qr.?code|qrcode/.test(words);
    let score = 0;
    if (/bar.?code|barcode/.test(words) || fromUrl) score += 10;
    if (qr) score += 8;
    if (w != null && h != null && w >= h * 2.5 && h <= 160) score += 4;
    if (LABEL.test(near)) score += 3;
    if (/^(cid|data):/i.test(src)) score += 1;
    if (fromUrl) score += 2;
    if (score < (qr || /bar.?code/.test(words) ? 8 : 7)) continue;
    if (!best || score > best.score) best = { src, qr, after, score, ...(fromUrl ? fromUrl : {}) };
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
  const srt = t.match(/\bst(?:ore)?\s?#?\s*:?\s*(\d{2,8})\b[^\d]{0,16}\breg(?:ister)?\s?#?\s*:?\s*(\d{1,4})\b[^\d]{0,16}\b(?:tr(?:ans|ansaction|n)?|txn)\s?#?\s*:?\s*(\d{2,6})\b/i);
  if (srt) return `${srt[1]}${srt[2]}${srt[3]}`;
  return null;
}

// ---------- ▮▯ a barcode drawn with HTML boxes or SVG ----------
// Code 128 widths (bar, space, bar, space, bar, space) of values 0–105; stop = 2331112.
const C128 = ('212222222122222221121223121322131222122213122312132212221213221312231212112232122132122231113222123122123221223211221132'
  + '221231213212223112312131311222321122321221312212322112322211212123212321232121111323131123131321112313132113132311211313231113'
  + '231311112133112331132131113123113321133121313121211331231131213113213311213131311123311321331121312113312311332111314111221411'
  + '431111111224111422121124121421141122141221112214112412122114122411142112142211241211221114413111241112134111111242121142121241'
  + '114212124112124211411212421112421211212141214121412121111143111341131141114113114311411113411311113141114131311141411131211412'
  + '211214211232').match(/.{6}/g)!;
const C128_IX = new Map(C128.map((p, i) => [p, i]));

/** Code 128 from bar/space widths (bars first, quiet zones off), checksum checked; tried both ways round. Else null. */
export function decodeCode128(widths: number[]): string | null {
  for (const w of [widths, [...widths].reverse()]) {
    if (w.length < 6 * 3 + 7 || (w.length - 7) % 6) continue;
    const syms: number[] = [];
    let ok = true;
    for (let i = 0; i + 7 < w.length; i += 6) {
      const part = w.slice(i, i + 6), unit = part.reduce((a, b) => a + b, 0) / 11;
      const p = part.map((x) => Math.min(4, Math.max(1, Math.round(x / unit)))).join('');
      const v = C128_IX.get(p);
      if (v == null) { ok = false; break; }
      syms.push(v);
    }
    const stop = w.slice(-7), su = stop.reduce((a, b) => a + b, 0) / 13;
    if (!ok || stop.map((x) => Math.round(x / su)).join('') !== '2331112' || syms[0] < 103) continue;
    const check = syms.pop()!;
    if (syms.reduce((a, v, i) => a + v * (i || 1), 0) % 103 !== check) continue;
    let set = syms[0] === 103 ? 'A' : syms[0] === 104 ? 'B' : 'C', out = '', shift = false;
    for (const v of syms.slice(1)) {
      const cur = shift ? (set === 'A' ? 'B' : 'A') : set;
      shift = false;
      if (cur === 'C') { if (v < 100) out += String(v).padStart(2, '0'); else if (v === 100) set = 'B'; else if (v === 101) set = 'A'; continue; }
      if (v < 96) { out += String.fromCharCode(cur === 'A' ? (v < 64 ? v + 32 : v - 64) : v + 32); continue; }
      if (v === 98) shift = true;
      else if (v === 99) set = 'C';
      else if (v === (cur === 'A' ? 100 : 101)) set = cur === 'A' ? 'B' : 'A';
    }
    if (out) return out;
  }
  return null;
}

const DARK = (c: string): boolean | null => {
  const s = c.trim().toLowerCase();
  if (s === 'black') return true;
  if (s === 'white' || s === 'transparent' || s === 'none') return false;
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/);
  if (m) { const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.3 * r + 0.59 * g + 0.11 * b < 128; }
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return 0.3 * +m[1] + 0.59 * +m[2] + 0.11 * +m[3] < 128;
  return null;
};
const styleOf = (style: string, k: string) => style.match(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([^;]+)`, 'i'))?.[1]?.trim() ?? '';
const num = (s: string) => { const m = s.match(/^\s*(\d+(?:\.\d+)?)(px)?\s*$/i); return m ? Number(m[1]) : null; };
/** Same-colour neighbours added up, the light quiet zones at both ends dropped: widths, bars first. */
function runsOf(cells: { dark: boolean; w: number }[]): number[] {
  const runs: { dark: boolean; w: number }[] = [];
  for (const c of cells) { const l = runs[runs.length - 1]; if (l && l.dark === c.dark) l.w += c.w; else runs.push({ ...c }); }
  while (runs.length && !runs[0].dark) runs.shift();
  while (runs.length && !runs[runs.length - 1].dark) runs.pop();
  return runs.map((r) => r.w);
}

/**
 * A barcode drawn with HTML (table cells / divs / spans with a width and a black or white background) or SVG rects:
 * `value` = the Code 128 it draws (when it decodes), `after` = the words just after it (for the number printed there).
 */
export function barsOf(html: string | undefined): { value: string | null; after: string } | null {
  if (!html) return null;
  // SVG: dark rects by x, the gaps between them are the spaces
  for (const svg of html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
    const rects = [...svg[0].matchAll(/<rect\b[^>]*>/gi)].map((r) => {
      const t = r[0], fill = attr(t, 'fill') || styleOf(attr(t, 'style'), 'fill');
      return { x: num(attr(t, 'x')) ?? 0, w: num(attr(t, 'width')) ?? 0, dark: fill ? DARK(fill) !== false : true };
    }).filter((r) => r.dark && r.w > 0).sort((a, b) => a.x - b.x);
    if (rects.length < 10) continue;
    const cells: { dark: boolean; w: number }[] = [];
    rects.forEach((r, i) => { if (i) { const gap = r.x - (rects[i - 1].x + rects[i - 1].w); if (gap > 0.01) cells.push({ dark: false, w: gap }); } cells.push({ dark: true, w: r.w }); });
    const end = (svg.index ?? 0) + svg[0].length;
    return { value: decodeCode128(runsOf(cells)), after: htmlText(html.slice(end, end + 600)).slice(0, 300) };
  }
  // HTML boxes: in a row, nothing written between them
  let group: { dark: boolean; w: number }[] = [], last = -1, end = 0;
  let best: { value: string | null; after: string } | null = null;
  const flush = () => {
    const runs = runsOf(group);
    if (runs.length >= 25) {
      const value = decodeCode128(runs);
      if (!best || (value && !best.value)) best = { value, after: htmlText(html.slice(end, end + 600)).slice(0, 300) };
    }
    group = [];
  };
  for (const m of html.matchAll(/<(td|th|div|span|i|b)\b([^>]*)>/gi)) {
    const t = m[0], style = attr(t, 'style');
    const w = num(attr(t, 'width')) ?? num(styleOf(style, 'width')) ?? num(styleOf(style, 'min-width'));
    const bg = attr(t, 'bgcolor') || styleOf(style, 'background-color') || styleOf(style, 'background').split(/\s+/)[0];
    const dark = bg ? DARK(bg) : null;
    const at = m.index ?? 0;
    if (w == null || w <= 0 || w > 20 || dark == null) continue; // a bar is a few px wide
    if (last >= 0 && (at - last > 400 || htmlText(html.slice(last, at)).trim())) flush();
    group.push({ dark, w });
    last = at + t.length;
    end = last;
  }
  flush();
  return best;
}
