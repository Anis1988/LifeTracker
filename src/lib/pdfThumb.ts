import { signedUrls } from './vault';

/**
 * 🧾 A small picture of a PDF receipt's first page, drawn on this device with pdf.js (loaded only when a PDF receipt is
 * shown). Kept in memory and, best effort, in this browser (a few KB each), so it is drawn once. null = it couldn't be
 * drawn (then the card shows a 📄 tile).
 */
const mem = new Map<string, Promise<string | null>>();
const KEY = 'lt.pdfthumb:';

export function pdfThumb(path: string): Promise<string | null> {
  const hit = mem.get(path);
  if (hit) return hit;
  const p = (async () => {
    try { const v = localStorage.getItem(KEY + path); if (v) return v; } catch { /* private mode */ }
    try {
      const url = (await signedUrls([path], 120))[path];
      if (!url) return null;
      // Older phones' browsers: pdf.js needs Promise.withResolvers (else the 📄 tile shows).
      const P = Promise as unknown as { withResolvers?: () => unknown };
      if (!P.withResolvers) P.withResolvers = function <T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      const task = pdfjs.getDocument({ url });
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 180 / v1.width }); // about 3× the small picture: sharp on phones
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.min(Math.ceil(vp.height), 360); // the top of a long page is enough
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const data = canvas.toDataURL('image/jpeg', 0.78);
      await task.destroy();
      try { localStorage.setItem(KEY + path, data); } catch { /* full: memory only */ }
      return data;
    } catch (e) {
      console.warn('Receipt PDF picture:', e instanceof Error ? e.message : e);
      return null;
    }
  })();
  mem.set(path, p);
  return p;
}
