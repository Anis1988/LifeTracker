import type { Barcode, BarcodeFormat } from '../../supabase/functions/_shared/barcode.ts';
import { fileKind, signedUrls } from './vault';

/**
 * 🔲 Receipt barcodes on this device (free, nothing sent but the decoded value):
 *  - `decodeBarcode`: reads the barcode / QR code on a receipt photo (the phone's own BarcodeDetector when it has one,
 *    else ZXing, loaded only then);
 *  - `barcodeOfStored`: the same for a receipt already kept (photo, or a PDF's first page drawn with pdf.js);
 *  - `drawBarcode`: draws a barcode crisp from its value (JsBarcode / qrcode, loaded only when shown).
 */
export type Decoded = Pick<Barcode, 'value' | 'format'>;

const FROM_DETECTOR: Record<string, BarcodeFormat> = { code_128: 'code128', itf: 'itf', qr_code: 'qr', ean_13: 'ean13' };
const FROM_ZXING: Record<string, BarcodeFormat> = { CODE_128: 'code128', ITF: 'itf', QR_CODE: 'qr', EAN_13: 'ean13' };

type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]> };
type DetectorCtor = { new (o?: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

async function toCanvas(src: Blob | string, max = 2400): Promise<HTMLCanvasElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('The picture could not be opened.')); img.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { if (typeof src !== 'string') URL.revokeObjectURL(url); }
}

const rotate = (c: HTMLCanvasElement) => {
  const r = document.createElement('canvas');
  r.width = c.height; r.height = c.width;
  const ctx = r.getContext('2d', { willReadFrequently: true })!;
  ctx.translate(r.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(c, 0, 0);
  return r;
};

async function withDetector(c: HTMLCanvasElement): Promise<Decoded | null> {
  const D = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!D) return null;
  try {
    const have = (await D.getSupportedFormats?.()) ?? [];
    const want = ['code_128', 'itf', 'qr_code', 'ean_13', 'code_39', 'pdf417', 'data_matrix'].filter((f) => !have.length || have.includes(f));
    const found = await new D({ formats: want }).detect(c);
    const b = found.find((x) => x.rawValue?.trim());
    return b ? { value: b.rawValue.trim(), format: FROM_DETECTOR[b.format] ?? 'unknown' } : null;
  } catch { return null; }
}

async function withZxing(c: HTMLCanvasElement): Promise<Decoded | null> {
  const z = await import('@zxing/library');
  const reader = new z.MultiFormatReader();
  const hints = new Map<unknown, unknown>([[z.DecodeHintType.TRY_HARDER, true], [z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.CODE_128, z.BarcodeFormat.ITF, z.BarcodeFormat.QR_CODE, z.BarcodeFormat.EAN_13, z.BarcodeFormat.CODE_39, z.BarcodeFormat.PDF_417]]]);
  reader.setHints(hints as Map<never, never>);
  for (const cv of [c, rotate(c)]) {
    const { data, width, height } = cv.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, cv.width, cv.height);
    const lum = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    try {
      const r = reader.decode(new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(lum, width, height))));
      const v = r.getText().trim();
      if (v) return { value: v, format: FROM_ZXING[z.BarcodeFormat[r.getBarcodeFormat()]] ?? 'unknown' };
    } catch { /* none in this direction */ }
  }
  return null;
}

/** The barcode on a receipt picture, or null (never throws). */
export async function decodeBarcode(src: Blob | string): Promise<Decoded | null> {
  try {
    if (typeof src !== 'string' && !src.type.startsWith('image/')) return null;
    const c = await toCanvas(src);
    return (await withDetector(c)) ?? (await withZxing(c));
  } catch (e) { console.warn('Barcode:', e instanceof Error ? e.message : e); return null; }
}

/** A PDF receipt's first page, drawn big enough to read its barcode. */
async function pdfPage(url: string): Promise<string | null> {
  const P = Promise as unknown as { withResolvers?: () => unknown };
  if (!P.withResolvers) P.withResolvers = function <T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const task = pdfjs.getDocument({ url });
  try {
    const page = await (await task.promise).getPage(1);
    const vp = page.getViewport({ scale: 1600 / page.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.min(Math.ceil(vp.height), 6000);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL('image/png');
  } finally { await task.destroy(); }
}

/** The barcode on a receipt already kept in this person's folder (photo or PDF), or null. */
export async function barcodeOfStored(path: string): Promise<Decoded | null> {
  try {
    const url = (await signedUrls([path], 120))[path];
    if (!url) return null;
    if (fileKind(path) === 'pdf') { const page = await pdfPage(url); return page ? decodeBarcode(page) : null; }
    const blob = await (await fetch(url)).blob();
    return decodeBarcode(blob.type.startsWith('image/') ? blob : new Blob([blob], { type: 'image/jpeg' }));
  } catch { return null; }
}

/** Draws a 1D barcode into an <svg> (white bars background), crisp at any size. false = it can't be drawn. */
export async function drawLinear(svg: SVGSVGElement, value: string, format: BarcodeFormat, height = 120): Promise<boolean> {
  const JsBarcode = (await import('jsbarcode')).default;
  const fmt = format === 'itf' && /^\d+$/.test(value) && value.length % 2 === 0 ? 'ITF' : format === 'ean13' && /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128';
  let ok = true;
  const draw = (f: string) => JsBarcode(svg, value, { format: f, displayValue: false, margin: 12, height, width: 2, background: '#ffffff', lineColor: '#000000', valid: (v: boolean) => { ok = v; } });
  draw(fmt);
  if (!ok && fmt !== 'CODE128') { ok = true; draw('CODE128'); }
  if (ok) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('preserveAspectRatio', 'none'); }
  return ok;
}

/** Draws a QR code on a canvas (black on white). */
export async function drawQr(canvas: HTMLCanvasElement, value: string, size = 480): Promise<boolean> {
  const QR = (await import('qrcode')).default;
  try { await QR.toCanvas(canvas, value, { width: size, margin: 2, color: { dark: '#000000', light: '#ffffff' } }); canvas.style.removeProperty('width'); canvas.style.removeProperty('height'); return true; } catch { return false; }
}
