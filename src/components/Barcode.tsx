import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { groupDigits, type Barcode } from '../../supabase/functions/_shared/barcode.ts';
import { drawLinear, drawQr } from '../lib/barcode';
import { signedUrls } from '../lib/vault';
import { errText, toast } from './ui';

/**
 * 🔲 A receipt's barcode (owner's request: lost the paper receipt → scan the one in the app): drawn crisp from its
 * value (JsBarcode / qrcode, loaded only here), or the picture found in the email (2-minute link). Always black on
 * white, also in dark mode, because a till scanner needs it. The ReceiptSheet section and the full-screen viewer.
 */
export const BarcodeGlyph = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M3 5h1.6v14H3zM6 5h.8v14H6zM8.2 5h2v14h-2zM11.6 5h.8v14h-.8zM13.8 5h1.6v14h-1.6zM16.8 5h.8v14h-.8zM19 5h2v14h-2z" /></svg>
);

/** The barcode drawn (or its picture). `big` = full screen. A made-up one in the Guide draws the same way. */
export function BarcodeArt({ b, big, original }: { b: Barcode; big?: boolean; original?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const useImage = !!b.image && (original || !b.value);
  useEffect(() => {
    let live = true;
    setFailed(false);
    if (useImage) { void signedUrls([b.image!], 120).then((u) => live && setImg(u[b.image!] ?? null)).catch((e) => { if (live) { setFailed(true); toast('err', errText(e)); } }); }
    else if (b.format === 'qr') { if (canvas.current) void drawQr(canvas.current, b.value, big ? 720 : 360).then((ok) => live && setFailed(!ok)); }
    else if (svg.current) void drawLinear(svg.current, b.value, b.format, big ? 160 : 90).then((ok) => live && setFailed(!ok)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [b.value, b.format, b.image, useImage, big]);
  const label = `Barcode${b.value ? ` ${b.value}` : ''}`;
  if (failed) return <p className="py-6 text-center text-sm text-slate-700">This barcode can’t be drawn: show the number below.</p>;
  if (useImage) return img ? <img src={img} alt={label} className={`mx-auto block bg-white object-contain [image-rendering:pixelated] ${big ? 'max-h-[min(42vh,320px)] w-full max-w-[680px]' : 'max-h-28 w-full'}`} /> : <div className={`skel mx-auto w-full ${big ? 'h-40 max-w-[680px]' : 'h-20'}`} />;
  if (b.format === 'qr') return <canvas ref={canvas} role="img" aria-label={label} className={`mx-auto block bg-white [image-rendering:pixelated] ${big ? 'aspect-square w-[min(72vmin,380px)]' : 'aspect-square w-28'}`} />;
  return <svg ref={svg} role="img" aria-label={label} shapeRendering="crispEdges" className={`mx-auto block bg-white ${big ? 'h-[min(34vh,200px)] w-full max-w-[680px]' : 'h-20 w-full'}`} />;
}

/** Full screen, ready for the till: white, big, the number in large mono text, the screen kept awake. */
export function BarcodeViewer({ b, title, onClose }: { b: Barcode; title: string; onClose: () => void }) {
  const both = !!b.image && !!b.value;
  const [which, setWhich] = useState<'pic' | 'drawn'>(b.image ? 'pic' : 'drawn');
  useEffect(() => {
    // 🔆 Keep the screen on while it's shown (where the phone allows it).
    let lock: { release: () => Promise<void> } | null = null;
    const ask = () => { const w = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock; if (w && document.visibilityState === 'visible') void w.request('screen').then((l) => { lock = l; }, () => undefined); };
    ask();
    document.addEventListener('visibilitychange', ask);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('visibilitychange', ask); window.removeEventListener('keydown', k); document.body.style.overflow = prev; void lock?.release().catch(() => undefined); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Always white with black text (not dark mode): a scanner needs contrast.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Barcode of the receipt: ${title}`} className="fixed inset-0 z-[60] flex flex-col bg-white text-slate-900 animate-[fade_.2s_ease-out]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', colorScheme: 'light' }}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate font-semibold">🔲 {title}</p>
        <button className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-900" aria-label="Close" onClick={onClose}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-auto px-4 pb-4">
        <div className="w-full max-w-[720px] rounded-2xl bg-white p-3">
          <BarcodeArt b={b} big original={which === 'pic'} />
        </div>
        {b.value && <p className="num select-all break-all text-center font-mono text-[26px] font-semibold leading-tight tracking-[0.08em] sm:text-[32px]">{groupDigits(b.value)}</p>}
        {both && (
          <div role="group" aria-label="Show" className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-full border border-slate-300 bg-slate-100 p-1">
            {([['pic', 'Email picture'], ['drawn', 'Drawn']] as const).map(([k, l]) => (
              <button key={k} className={`tap min-h-[44px] rounded-full px-3 text-sm font-semibold ${which === k ? 'bg-slate-900 text-white' : 'text-slate-700'}`} aria-pressed={which === k} onClick={() => setWhich(k)}>{l}</button>
            ))}
          </div>
        )}
        <p className="text-center text-sm text-slate-600">☀️ Turn up your screen brightness, then hold the phone flat under the scanner.</p>
        {!b.image && b.from !== 'photo' && <p className="max-w-sm text-center text-xs text-slate-500">Drawn from the number on the receipt. If the till can’t scan it, the cashier can type the number.</p>}
      </div>
    </div>,
    document.body,
  );
}

/** The sheet's 🔲 Barcode section: a small barcode (tap = full screen), the number, Find / Find again. */
export function BarcodeSection({ b, title, onFind, busy, example, hasReceipt }: { b: Barcode | null | undefined; title: string; onFind?: () => void; busy?: boolean; example?: boolean; hasReceipt: boolean }) {
  const [full, setFull] = useState(false);
  if (!b && !hasReceipt) return null;
  return (
    <div className="panel space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="label">🔲 Barcode</p>
        {b && <span className="text-[11px] text-slate-500 dark:text-slate-400">{b.from === 'photo' ? 'Read from the photo' : b.from === 'ai' ? 'Number read by the AI' : 'From the email'}</span>}
      </div>
      {b ? (
        <>
          <button className="tap block w-full rounded-xl border border-slate-900/10 bg-white p-2 dark:border-white/15" tabIndex={example ? -1 : undefined} onClick={() => !example && setFull(true)} aria-label={`Show the barcode of ${title} full screen`}>
            <BarcodeArt b={b} />
            {b.value && <span className="num mt-1 block break-all text-center font-mono text-sm font-semibold tracking-wider text-slate-900">{groupDigits(b.value)}</span>}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" tabIndex={example ? -1 : undefined} onClick={() => !example && setFull(true)}><BarcodeGlyph /> Full screen</button>
            <button className="btn" tabIndex={example ? -1 : undefined} disabled={busy} onClick={example ? undefined : onFind}>{busy ? <span className="spinner" /> : '↻ Find again'}</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-600 dark:text-slate-300">No barcode yet. Lost the paper? Find it on the receipt, then scan it from your phone at the till.</p>
          <button className="btn w-full" tabIndex={example ? -1 : undefined} disabled={busy} onClick={example ? undefined : onFind}>{busy ? <><span className="spinner" /> Looking…</> : '🔲 Find barcode'}</button>
        </>
      )}
      {full && b && <BarcodeViewer b={b} title={title} onClose={() => setFull(false)} />}
    </div>
  );
}
