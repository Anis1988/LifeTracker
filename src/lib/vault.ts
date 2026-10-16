import { supabase } from './supabase';

/**
 * 📁 Vault, on the device: pages are shrunk here before they are sent, several pages can become one PDF here
 * (pdf-lib, loaded only when needed), files are opened with short-lived signed links, and the optional PIN lock.
 */

// ---------- pages ----------
export interface Page { file: Blob; name: string; mime: string; url?: string } // url = a preview (photos only)

const isPdf = (f: { type: string; name?: string }) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name ?? '');

/** A photo made smaller (longest side 2000 px, JPEG): a phone photo of 4–8 MB becomes about 300–600 KB. */
export async function shrink(f: File): Promise<Page> {
  if (isPdf(f)) return { file: f, name: f.name, mime: 'application/pdf' };
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    img.close();
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
    if (!blob) throw new Error('no blob');
    const name = `${(f.name || 'page').replace(/\.[a-z0-9]+$/i, '')}.jpg`;
    return { file: blob, name, mime: 'image/jpeg', url: URL.createObjectURL(blob) };
  } catch {
    // A picture this browser can't open (some HEIC): kept as it is.
    return { file: f, name: f.name || 'page', mime: f.type || 'image/jpeg', url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined };
  }
}

/** Several pages (photos and PDFs) → one PDF, made on the device. pdf-lib is loaded only now (not in the app's first load). */
export async function combine(pages: Page[], title: string): Promise<Page> {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  out.setTitle(title || 'Document');
  out.setCreator('LifeTracker');
  for (const p of pages) {
    const bytes = new Uint8Array(await p.file.arrayBuffer());
    if (p.mime === 'application/pdf') {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg);
      continue;
    }
    const img = p.mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    // A4-ish page that keeps the photo's shape (no white bands).
    const w = 595, h = Math.round((img.height / img.width) * w);
    out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  const data = await out.save();
  return { file: new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), name: `${safeName(title || 'document')}.pdf`, mime: 'application/pdf' };
}

export const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(-60) || 'document';

export async function sha256(b: Blob): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()));
  return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------- files: only short-lived signed links, never public ----------
export const fileKind = (path: string) => (/\.pdf$/i.test(path) ? 'pdf' : 'image');
export const fileName = (path: string) => path.split('/').pop()?.replace(/^[0-9a-f-]{36}-/, '') ?? 'file';
/** Links that work for 2 minutes. */
export async function signedUrls(paths: string[], seconds = 120): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const r = await supabase.storage.from('docs').createSignedUrls(paths, seconds);
  if (r.error) throw new Error(r.error.message);
  return Object.fromEntries((r.data ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl]));
}
export async function openFile(path: string) {
  // The window is opened first (a phone blocks windows opened after a wait), then pointed at the 2-minute link.
  const w = window.open('', '_blank');
  const r = await supabase.storage.from('docs').createSignedUrl(path, 120);
  if (!r.data?.signedUrl) { w?.close(); throw new Error(r.error?.message ?? 'The file is missing.'); }
  if (w) w.location.href = r.data.signedUrl; else location.href = r.data.signedUrl;
}
export async function downloadFile(path: string, name: string) {
  const r = await supabase.storage.from('docs').createSignedUrl(path, 120, { download: name });
  if (!r.data?.signedUrl) throw new Error(r.error?.message ?? 'The file is missing.');
  const a = document.createElement('a');
  a.href = r.data.signedUrl;
  a.download = name;
  a.click();
}
/** Share the files (the phone's share menu), else download them. */
export async function shareFiles(paths: string[], title: string): Promise<'shared' | 'downloaded'> {
  const urls = await signedUrls(paths);
  const files = await Promise.all(paths.map(async (p) => {
    const b = await (await fetch(urls[p])).blob();
    return new File([b], fileName(p), { type: b.type || (fileKind(p) === 'pdf' ? 'application/pdf' : 'image/jpeg') });
  }));
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files, title });
    return 'shared';
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
  }
  return 'downloaded';
}

// ---------- 🔒 the Vault lock (a privacy screen) ----------
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** PBKDF2-SHA-256, 210,000 rounds, with a random salt: only this hash is saved, never the PIN. */
export async function hashPin(pin: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt ? unb64(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: s as Uint8Array<ArrayBuffer>, iterations: 210_000 }, key, 256));
  return { hash: b64(bits), salt: b64(s) };
}
export async function pinOk(pin: string, lock: { hash: string; salt: string }): Promise<boolean> {
  if (!lock.hash || !lock.salt) return false;
  const { hash } = await hashPin(pin, lock.salt);
  // Same length, compared without stopping early.
  let diff = hash.length ^ lock.hash.length;
  for (let i = 0; i < Math.min(hash.length, lock.hash.length); i++) diff |= hash.charCodeAt(i) ^ lock.hash.charCodeAt(i);
  return diff === 0;
}

// Open until: kept in memory only (a reload, or the app going to the background, locks it again).
let openUntil = 0;
const subs = new Set<() => void>();
export const isOpen = () => Date.now() < openUntil;
export function unlockVault(minutes: number) { openUntil = Date.now() + Math.max(1, minutes) * 60_000; subs.forEach((f) => f()); }
export function lockVault() { openUntil = 0; subs.forEach((f) => f()); }
/** Using the Vault keeps it open (the minutes count from the last tap). */
export function touchVault(minutes: number) { if (isOpen()) openUntil = Date.now() + Math.max(1, minutes) * 60_000; }
export function onLockChange(f: () => void) { subs.add(f); return () => void subs.delete(f); }
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && openUntil) lockVault(); });
}

// Too many wrong PINs: a short wait (kept in memory and on this device).
const WAIT_KEY = 'lt.vaultWait';
export function waitLeft(): number {
  try { return Math.max(0, Number(localStorage.getItem(WAIT_KEY) ?? 0) - Date.now()); } catch { return 0; }
}
export function wrongPin(count: number) {
  if (count % 5 !== 0) return;
  try { localStorage.setItem(WAIT_KEY, String(Date.now() + Math.min(300, 30 * 2 ** (count / 5 - 1)) * 1000)); } catch { /* private mode */ }
}
