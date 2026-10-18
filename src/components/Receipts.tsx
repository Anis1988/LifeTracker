import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SPEND_CATS, categorize, spendCat, type SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { receiptLink, type ReceiptDetails, type ReceiptItem } from '../../supabase/functions/_shared/receiptText.ts';
import { money, today } from '../../supabase/functions/_shared/money.ts';
import { downloadFile, fileKind, fileName, openFile, safeName, shareFiles, shrink, signedUrls } from '../lib/vault';
import { api, supabase } from '../lib/supabase';
import { Money, Sheet, errText, shortDate, toast } from './ui';

/**
 * 🧾 Receipts in Money → Spending: each one written out in full (`ReceiptCard`: shop, date, category, every line bought,
 * tax, total, card) with the receipt's picture small on the right (tap = full screen with Download / Share / Delete),
 * the sheet (Re-read / Edit / Delete), and "📷 Add a receipt" (read and saved at once). Also drawn in the Guide with
 * made-up data (no working buttons there).
 */
export const hasReceipt = (t: SpendTx) => !!t.receipt_path;
const isFile = (p: string | null | undefined): p is string => !!p && !p.startsWith('gmail:');
const SOURCE: Record<string, string> = { alert: '📧 bank alert email', csv: '📄 bank CSV', bank: '🏦 bank link', receipt: '🧾 receipt only' };

/** Short-lived links (10 minutes) for the receipt photos in a list, so the small pictures show. */
export function useThumbs(list: SpendTx[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const want = useMemo(() => [...new Set(list.map((t) => t.receipt_path).filter((p): p is string => isFile(p) && fileKind(p) === 'image'))].sort(), [list]);
  const key = want.join('|');
  useEffect(() => {
    const need = want.filter((p) => !urls[p]);
    if (!need.length) return;
    let live = true;
    void signedUrls(need, 600).then((u) => live && setUrls((c) => ({ ...c, ...u }))).catch(() => undefined);
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

/** A PDF receipt's first page as a small picture (drawn on this device, once). */
function usePdfThumb(path: string | null | undefined, on: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!on || !path || !isFile(path) || fileKind(path) !== 'pdf') return;
    let live = true;
    void import('../lib/pdfThumb').then((m) => m.pdfThumb(path)).then((u) => { if (live) setSrc(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [path, on]);
  return src;
}

/** A drawn receipt (the Guide's made-up picture). */
const DrawnReceipt = ({ lines = 6 }: { lines?: number }) => (
  <span className="flex h-full w-full flex-col gap-[3px] bg-[#fbfaf6] p-1.5" aria-hidden="true">
    <span className="mx-auto h-1 w-3/5 rounded-full bg-slate-400" />
    {[85, 60, 75, 50, 70, 40, 65, 55].slice(0, lines).map((w, k) => <span key={k} className="h-[3px] rounded-full bg-slate-300" style={{ width: `${w}%` }} />)}
    <span className="mt-auto h-1 w-2/3 self-end rounded-full bg-slate-500" />
  </span>
);

/**
 * The small picture: the photo, a PDF's first page (📄 if it can't be drawn), a ✉️ for a receipt that is an email.
 * size: 'row' (list), 'card' (the receipt card, about 64 px wide), 'big' (the sheet). In the Guide: a drawn receipt.
 */
export function ReceiptThumb({ t, url, onView, big, size = big ? 'big' : 'row', example }: { t: SpendTx; url?: string; onView?: () => void; big?: boolean; size?: 'row' | 'card' | 'big'; example?: boolean }) {
  const p = t.receipt_path;
  const pdf = usePdfThumb(p, !example && size !== 'row');
  const box = size === 'big' ? 'h-40 w-32' : size === 'card' ? 'h-[84px] w-16' : 'h-14 w-11';
  const shown = url ?? pdf ?? undefined;
  const inner = example ? <DrawnReceipt lines={size === 'row' ? 6 : 8} />
    : shown ? <img src={shown} alt="" className="h-full w-full bg-white object-cover object-top" loading="lazy" />
    : <span className={`flex h-full w-full flex-col items-center justify-center gap-0.5 ${size === 'big' ? 'text-4xl' : 'text-xl'}`} aria-hidden="true">{!p ? spendCat(categorize(t)).icon : p.startsWith('gmail:') ? '✉️' : fileKind(p) === 'pdf' ? '📄' : '🧾'}{size === 'card' && p && fileKind(p) === 'pdf' && !p.startsWith('gmail:') ? <span className="text-[9px] font-bold tracking-wide text-slate-500 dark:text-slate-400">PDF</span> : null}</span>;
  const cls = `tap relative ${box} shrink-0 overflow-hidden rounded-xl border border-slate-900/10 bg-white/70 shadow-[0_6px_14px_-10px_rgba(0,0,0,.6)] dark:border-white/15 dark:bg-white/[0.06]`;
  if (!p && !example) return <span className={`${cls.replace('tap ', '')}`}>{inner}</span>;
  const what = p?.startsWith('gmail:') ? 'Open the email of the receipt' : 'Open the receipt';
  return <button className={cls} onClick={onView} aria-label={`${what} of ${t.details?.store || t.description || 'this purchase'} full screen`}>{inner}{size !== 'big' && <span className="absolute bottom-0.5 right-0.5 rounded-full bg-slate-900/70 px-1 text-[9px] leading-4 text-white" aria-hidden="true">{p?.startsWith('gmail:') ? '↗' : '⤢'}</span>}</button>;
}

const unit = (i: ReceiptItem) => (i.price != null && i.qty != null && i.qty > 1 ? Math.round((i.price / i.qty) * 100) / 100 : null);
const SHOW = 8;

/**
 * 🧾 A receipt, written out in full in the Spending list (owner's request): shop, date, category, every line bought
 * (name, qty × price, line total; the first 8, then "+N more" opens the rest in place), tax, total and card, with the
 * receipt's picture small on the right (tap = full screen with Download). The same card for a scanned receipt and a
 * receipt from an email. Tap the shop for the sheet (edit, re-read, delete). Also in the Guide with made-up data.
 */
export function ReceiptCard({ t, url, rules, onOpen, onView, example, startOpen }: { t: SpendTx; url?: string; rules: Record<string, string>; onOpen?: () => void; onView?: () => void; example?: boolean; startOpen?: boolean }) {
  const [all, setAll] = useState(!!startOpen);
  const d = t.details;
  const cat = spendCat(categorize(t, rules));
  const items = d?.items ?? [];
  const shown = all ? items : items.slice(0, SHOW);
  const total = d?.total || Math.abs(Number(t.amount));
  const fromMail = !!t.note?.startsWith('From email') || !!t.receipt_path?.startsWith('gmail:');
  const mm = d?.mismatch;
  const ask = !!mm && !mm.kept; // 📎 a receipt on a bank purchase with another total: its items wait for "use them anyway"
  const tag = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-4';
  const row = 'flex items-baseline justify-between gap-3';
  return (
    <li className="card relative !rounded-[24px] !p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <button className="tap -m-1 block w-[calc(100%+0.5rem)] rounded-xl p-1 text-left" onClick={onOpen} aria-label={`${d?.store || t.description || 'Receipt'}: details, edit or delete`}>
            <span className="block break-words text-[15px] font-semibold leading-snug">{d?.store || t.description || 'Receipt'}</span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{shortDate(d?.date || t.posted)} · <span aria-hidden="true">{cat.icon}</span> {cat.label}</span>
          </button>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className={`${tag} border-violet-400/30 bg-violet-500/10 text-violet-800 dark:border-violet-300/20 dark:bg-violet-300/10 dark:text-violet-100`}>{fromMail ? '✉️ From email' : t.source === 'receipt' || t.note?.startsWith('Added by hand') ? '📷 Scanned' : '📎 Receipt added'}</span>
            {t.source && t.source !== 'receipt' && !mm && <span className={`${tag} border-teal-500/30 bg-teal-500/10 text-teal-800 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-teal-100`}>🏦 Matched to your bank</span>}
            {mm && <span className={`${tag} border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100`}>⚠️ Totals differ</span>}
          </div>
        </div>
        <ReceiptThumb t={t} url={url} onView={onView} size="card" example={example} />
      </div>
      {ask && (
        <button className="tap mt-2.5 block w-full rounded-2xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-left text-[13px] text-amber-900 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100" onClick={onOpen}>
          <span className="font-semibold">Receipt total <span className="num">{money(mm.receipt)}</span> ≠ bank <span className="num">{money(mm.bank)}</span></span>
          <span className="block text-xs">Tap to use its items anyway, or remove the picture.</span>
        </button>
      )}
      {items.length > 0 && !ask && (
        <ul className="mt-2.5 border-t border-dashed border-slate-900/15 pt-1.5 dark:border-white/15" aria-label="What you bought">
          {shown.map((i, k) => {
            const u = unit(i);
            return (
              <li key={k} className={`${row} py-[3px] text-[13px] leading-snug`}>
                <span className="min-w-0 flex-1 break-words">
                  {i.name}
                  {(i.qty != null && i.qty !== 1) || u != null ? <span className="num block text-[11px] text-slate-500 dark:text-slate-400">{i.qty ?? 1} × {u != null ? money(u) : i.price != null ? money(i.price) : ''}</span> : null}
                </span>
                <span className="num shrink-0 text-right text-slate-800 dark:text-slate-100">{i.price != null ? money(i.price) : '—'}</span>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > SHOW && !ask && (
        <button className="tap mt-0.5 min-h-[36px] w-full rounded-xl text-center text-xs font-semibold text-teal-700 dark:text-teal-300" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show less' : `+${items.length - SHOW} more`}
        </button>
      )}
      <div className={`${items.length ? 'mt-1.5 border-t border-slate-900/[0.08] pt-1.5 dark:border-white/[0.08]' : 'mt-2.5 border-t border-dashed border-slate-900/15 pt-2 dark:border-white/15'} space-y-0.5`}>
        {d?.tax != null && <div className={`${row} text-[13px] text-slate-500 dark:text-slate-400`}><span>Tax</span><span className="num">{money(d.tax)}</span></div>}
        <div className={`${row} text-[15px] font-semibold`}><span>Total</span><span className="num">{money(total)}</span></div>
        {mm && <div className={`${row} text-xs text-slate-500 dark:text-slate-400`}><span>Bank charged</span><span className="num">{money(mm.bank)}</span></div>}
        {d?.card && <div className={`${row} text-xs text-slate-500 dark:text-slate-400`}><span>Card</span><span className="num">•••• {d.card}</span></div>}
        {!items.length && !ask && <p className="pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{!d ? 'Not read yet: tap the shop, then ✨ Re-read.' : fromMail ? 'No lines written on this receipt email.' : 'No lines could be read: tap the shop to add them.'}</p>}
      </div>
    </li>
  );
}

/** One purchase in a list (receipt picture on the side when there is one). */
export function SpendRow({ t, url, rules, onOpen, onView, example }: { t: SpendTx; url?: string; rules: Record<string, string>; onOpen?: () => void; onView?: () => void; example?: boolean }) {
  const cat = spendCat(categorize(t, rules));
  const d = t.details;
  const what = d?.items?.length ? d.items.slice(0, 2).map((i) => i.name).join(', ') + (d.items.length > 2 ? ` +${d.items.length - 2}` : '') : '';
  return (
    <li className="flex items-center gap-3 border-t border-slate-900/[0.06] py-2 first:border-0 dark:border-white/[0.06]">
      <ReceiptThumb t={t} url={url} onView={onView} example={example} />
      <button className="tap -my-1 flex min-h-[52px] min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left" onClick={onOpen} aria-label={`${d?.store || t.description || 'Purchase'}, ${money(-Number(t.amount))}: details, edit, add a receipt`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{d?.store || t.description || 'Purchase'}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{shortDate(t.posted)} · {cat.icon} {cat.label}{t.receipt_path || example ? ' · 📎 receipt' : ''}</span>
          {what && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{what}</span>}
        </span>
        <Money n={-Number(t.amount)} className="shrink-0 text-sm font-semibold" />
      </button>
    </li>
  );
}

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="field flex items-start justify-between gap-3 py-2 text-sm"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className="min-w-0 text-right font-semibold">{children}</span></div>
);

/** The receipt sheet's contents: picture, details read from it, the lines bought, where it came from, the buttons. */
export function ReceiptDetailsView({ t, url, rules, onMove, onView, actions, example }: {
  t: SpendTx; url?: string; rules: Record<string, string>; onMove?: (cat: string) => void; onView?: () => void; example?: boolean;
  actions?: { download?: () => void; share?: () => void; edit?: () => void; line?: () => void; reread?: () => void; del?: () => void; detach?: () => void; attach?: React.ReactNode; busy?: string };
}) {
  const d = t.details;
  const cat = categorize(t, rules);
  const items = d?.items ?? [];
  const link = t.receipt_path ? receiptLink(t.receipt_path) : null;
  const b = actions?.busy;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {(t.receipt_path || example) && <ReceiptThumb t={t} url={url} onView={onView} big example={example} />}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="label">{shortDate(d?.date || t.posted)}</p>
          <p className="truncate text-lg font-semibold">{t.source === 'receipt' ? d?.store || t.description : t.description || d?.store}</p>
          <Money n={-Number(t.amount)} className="block text-[32px] font-semibold leading-tight tracking-tight" />
          {(t.receipt_path || example) && <p className="text-[11px] text-slate-500 dark:text-slate-400">{link ? 'Tap the picture to open the email.' : 'Tap the picture for full screen.'}</p>}
          {!t.receipt_path && !example && <p className="text-[11px] text-slate-500 dark:text-slate-400">No receipt yet: 📎 add one and its items are broken down here.</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(isFile(t.receipt_path) || example) && <button className="btn flex-1" disabled={!!b} onClick={actions?.download}>{b === 'dl' ? <span className="spinner" /> : '⬇ Download'}</button>}
        {(isFile(t.receipt_path) || example) && <button className="btn flex-1" disabled={!!b} onClick={actions?.share}>{b === 'share' ? <span className="spinner" /> : '↗ Share'}</button>}
        {link && <a className="btn flex-1" href={link} target="_blank" rel="noreferrer">✉️ Open the email</a>}
      </div>
      <div>
        <Fact label="Category">
          {onMove ? (
            <select className="input min-h-[40px] w-auto max-w-[11rem] py-1.5 text-sm font-semibold" value={cat} onChange={(e) => onMove(e.target.value)} aria-label="Category">
              {SPEND_CATS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          ) : `${spendCat(cat).icon} ${spendCat(cat).label}`}
        </Fact>
        {d?.tax != null && <Fact label="Tax"><span className="num">{money(d.tax)}</span></Fact>}
        {d?.card && <Fact label="Card"><span className="num">…{d.card}</span></Fact>}
        <Fact label="Counted from">{SOURCE[t.source ?? 'bank'] ?? t.source}{t.source !== 'receipt' && t.receipt_path ? ' + 🧾 receipt' : ''}{t.account && t.source !== 'receipt' ? <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{t.account}</span> : null}</Fact>
      </div>
      {items.length > 0 && (
        <div className="panel">
          <p className="label mb-1">What you bought</p>
          <table className="w-full text-sm">
            <thead className="sr-only"><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
            <tbody>
              {items.map((i, k) => (
                <tr key={k} className="border-t border-slate-900/[0.06] first:border-0 dark:border-white/[0.06]">
                  <td className="py-1.5 pr-2">{i.name}</td>
                  <td className="num w-10 py-1.5 text-right text-slate-500 dark:text-slate-400">{i.qty != null && i.qty !== 1 ? `×${i.qty}` : ''}</td>
                  <td className="num w-20 py-1.5 text-right">{i.price != null ? money(i.price) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(t.note || d) && (
        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {t.note}{d ? `${t.note ? ' · ' : ''}${d.read === 'free' ? 'Read for free (no AI)' : d.read === 'hand' ? 'Details edited by you' : `Read by ${d.by || 'the AI'}`}` : ''}
          {t.source !== 'receipt' && t.receipt_path ? ' · Matched to the bank purchase: counted once.' : ''}
        </p>
      )}
      {actions && (
        <div className="grid grid-cols-2 gap-2">
          {actions.attach}
          {actions.line && <button className="btn" disabled={!!b} onClick={actions.line}>✎ Edit</button>}
          {actions.edit && <button className="btn" disabled={!!b} onClick={actions.edit}>{actions.line ? '✎ Receipt details' : '✎ Edit'}</button>}
          {actions.reread && isFile(t.receipt_path) && <button className="btn" disabled={!!b} onClick={actions.reread}>{b === 'reread' ? <><span className="spinner" /> Reading…</> : '✨ Re-read'}</button>}
          {actions.detach && <button className="btn" disabled={!!b} onClick={actions.detach}>{b === 'detach' ? <span className="spinner" /> : '✕ Remove receipt'}</button>}
          {actions.del && <button className="btn text-red-700 dark:text-red-300" disabled={!!b} onClick={actions.del}>🗑 Delete</button>}
        </div>
      )}
    </div>
  );
}

/** Edit what was read: shop, date, total, tax, card, the lines. */
export function ReceiptEdit({ t, onSave, onCancel }: { t: SpendTx; onSave: (d: Omit<ReceiptDetails, 'read' | 'by'>) => Promise<void>; onCancel: () => void }) {
  const d0 = t.details;
  const [d, setD] = useState({ store: d0?.store || t.description || '', date: d0?.date || t.posted, total: String(d0?.total ?? Math.abs(Number(t.amount))), tax: d0?.tax != null ? String(d0.tax) : '', card: d0?.card ?? '' });
  const [items, setItems] = useState<{ name: string; qty: string; price: string }[]>((d0?.items ?? []).map((i) => ({ name: i.name, qty: i.qty != null ? String(i.qty) : '', price: i.price != null ? String(i.price) : '' })));
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));
  const save = async () => {
    setBusy(true);
    try {
      const list: ReceiptItem[] = items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim().slice(0, 60), qty: num(i.qty), price: num(i.price) }));
      await onSave({ store: d.store.trim().slice(0, 120), date: d.date, total: Math.max(0, num(d.total) ?? 0), tax: num(d.tax), card: /^\d{4}$/.test(d.card) ? d.card : null, items: list });
    } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold">Shop<input className="input mt-1 w-full" value={d.store} onChange={(e) => setD({ ...d, store: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">Date<input className="input mt-1 w-full" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Total $<input className="input mt-1 w-full" type="number" inputMode="decimal" value={d.total} onChange={(e) => setD({ ...d, total: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Tax $<input className="input mt-1 w-full" type="number" inputMode="decimal" value={d.tax} onChange={(e) => setD({ ...d, tax: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Card (last 4)<input className="input mt-1 w-full" inputMode="numeric" maxLength={4} value={d.card} onChange={(e) => setD({ ...d, card: e.target.value.replace(/\D/g, '') })} /></label>
      </div>
      {t.source !== 'receipt' && <p className="text-[11px] text-slate-500 dark:text-slate-400">This purchase also came from your bank: Spending keeps the bank’s amount and date.</p>}
      <div className="space-y-2">
        <p className="text-sm font-semibold">What you bought</p>
        {items.map((i, k) => (
          <div key={k} className="flex items-center gap-1.5">
            <input className="input min-w-0 flex-1" placeholder="Item" aria-label={`Item ${k + 1}`} value={i.name} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
            <input className="input w-14" placeholder="Qty" inputMode="numeric" aria-label={`Quantity ${k + 1}`} value={i.qty} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)))} />
            <input className="input w-20" placeholder="$" inputMode="decimal" aria-label={`Price ${k + 1}`} value={i.price} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, price: e.target.value } : x)))} />
            <button className="btn h-11 w-11 shrink-0 !p-0" aria-label={`Remove item ${k + 1}`} onClick={() => setItems(items.filter((_, j) => j !== k))}>×</button>
          </div>
        ))}
        {items.length < 40 && <button className="btn text-sm" onClick={() => setItems([...items, { name: '', qty: '', price: '' }])}>＋ Add a line</button>}
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy || !d.store.trim()} onClick={() => void save()}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Full screen: the receipt (tap to zoom), with Download, Share and Delete. A PDF opens in the phone's viewer. */
export function ReceiptViewer({ t, url, onClose, onDelete }: { t: SpendTx; url?: string; onClose: () => void; onDelete?: () => void }) {
  const p = t.receipt_path!;
  const [zoom, setZoom] = useState(false);
  const [src, setSrc] = useState(url);
  const title = t.details?.store || t.description || 'Receipt';
  const pdf = usePdfThumb(p, true);
  useEffect(() => {
    if (!src && fileKind(p) === 'image') void signedUrls([p], 600).then((u) => setSrc(u[p])).catch((e) => toast('err', errText(e)));
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dl = () => void downloadFile(p, `${safeName(`receipt-${title}-${t.posted}`)}.${fileKind(p) === 'pdf' ? 'pdf' : 'jpg'}`).catch((e) => toast('err', errText(e)));
  const share = () => void shareFiles([p], `Receipt: ${title}`).catch((e) => { if ((e as Error)?.name !== 'AbortError') toast('err', errText(e)); });
  const icon = 'btn h-11 w-11 shrink-0 !rounded-full !border-white/20 !bg-white/10 !p-0 !text-white';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Receipt: ${title}`} className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 animate-[fade_.25s_ease-out]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 text-white">
        <p className="min-w-0 flex-1 truncate font-semibold">{title} · {money(-Number(t.amount))}</p>
        <button className={icon} aria-label="Download" onClick={dl}>⬇</button>
        <button className={icon} aria-label="Share" onClick={share}>↗</button>
        {onDelete && <button className={icon} aria-label="Delete" onClick={onDelete}>🗑</button>}
        <button className={icon} aria-label="Close" onClick={onClose}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>
      <div className="flex-1 overflow-auto overscroll-contain px-3 pb-6">
        {fileKind(p) === 'pdf' ? (
          <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-white/15 bg-white/5 p-6 text-center text-white">
            {pdf ? <img src={pdf} alt={`First page of the receipt from ${title}`} className="w-full rounded-xl bg-white" /> : <span className="text-5xl" aria-hidden="true">📄</span>}
            <p className="text-sm">{fileName(p)}</p>
            <button className="btn-primary" onClick={() => void openFile(p).catch((e) => toast('err', errText(e)))}>Open the PDF</button>
          </div>
        ) : src ? (
          <img src={src} alt={`Receipt from ${title}`} onClick={() => setZoom(!zoom)} className={`mx-auto block rounded-xl bg-white ${zoom ? 'w-[220%] max-w-none cursor-zoom-out' : 'w-full max-w-2xl cursor-zoom-in'}`} />
        ) : <div className="skel mx-auto aspect-[3/4] w-full max-w-2xl" />}
        <p className="mt-2 text-center text-xs text-white/60">{fileKind(p) === 'pdf' ? '' : zoom ? 'Tap to zoom out' : 'Tap to zoom in'}</p>
      </div>
    </div>,
    document.body,
  );
}

/** ✎ The purchase itself (any line, from the bank or not): shop, date, amount, note. */
export function LineEdit({ t, onSave, onCancel }: { t: SpendTx; onSave: (l: { description: string; posted: string; amount: number; note: string | null }) => Promise<void>; onCancel: () => void }) {
  const [x, setX] = useState({ description: t.description ?? '', posted: t.posted, amount: String(Math.abs(Number(t.amount))), note: t.note ?? '' });
  const [busy, setBusy] = useState(false);
  const n = Number(x.amount);
  const ok = !!x.description.trim() && /^\d{4}-\d{2}-\d{2}$/.test(x.posted) && Number.isFinite(n) && n > 0;
  const save = async () => { setBusy(true); try { await onSave({ description: x.description.trim(), posted: x.posted, amount: Math.round(n * 100) / 100, note: x.note.trim() || null }); } catch (e) { toast('err', errText(e)); } setBusy(false); };
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold">Shop<input className="input mt-1 w-full" value={x.description} onChange={(e) => setX({ ...x, description: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">Date<input className="input mt-1 w-full" type="date" value={x.posted} onChange={(e) => setX({ ...x, posted: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Amount $<input className="input mt-1 w-full" type="number" inputMode="decimal" min={0} value={x.amount} onChange={(e) => setX({ ...x, amount: e.target.value })} /></label>
      </div>
      <label className="block text-sm font-semibold">Note<textarea className="input mt-1 min-h-[72px] w-full" maxLength={300} value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} placeholder="e.g. Lunch with Sam" /></label>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">The category stays with the shop: change it on the purchase.</p>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy || !ok} onClick={() => void save()}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** A photo or PDF, shrunk on this device and put in this person's own folder. */
async function uploadReceipt(f: File, folder: string): Promise<string> {
  if (f.size > 40 * 1024 * 1024) throw new Error('This file is too big (40 MB at most).');
  const page = await shrink(f);
  if (page.file.size > 15 * 1024 * 1024) throw new Error('This file is bigger than 15 MB.');
  const path = `${folder}/${crypto.randomUUID()}-${safeName(page.name)}`;
  const up = await supabase.storage.from('docs').upload(path, page.file, { contentType: page.mime });
  if (up.error) throw new Error(up.error.message);
  if (page.url) URL.revokeObjectURL(page.url);
  return path;
}

/** 📎 Add (or replace) the receipt of one purchase: camera, photo or PDF → read once → kept on THIS line (never a second one). */
export function AttachReceipt({ t, userId, label, onBusy, onDone, className = '' }: { t: SpendTx; userId: string; label: string; onBusy: (on: boolean) => void; onDone: (r: { status: string; text: string }) => Promise<void>; className?: string }) {
  const [busy, setBusy] = useState(false);
  const add = async (f: File | undefined) => {
    if (!f || !t.id) return;
    setBusy(true); onBusy(true);
    let path = '';
    try {
      path = await uploadReceipt(f, `${userId}/receipts`);
      const r = await api<{ status: string; text: string }>('receipt', { op: 'attach', id: t.id, path });
      path = ''; // kept (or removed by the server when it was already there)
      await onDone(r);
    } catch (e) {
      if (path) void supabase.storage.from('docs').remove([path]).then(() => undefined, () => undefined);
      toast('err', errText(e));
    }
    setBusy(false); onBusy(false);
  };
  return (
    <label className={`${t.receipt_path ? 'btn' : 'btn-primary col-span-2'} cursor-pointer whitespace-nowrap focus-within:shadow-[0_0_0_4px_rgba(94,234,212,0.25)] ${busy ? 'pointer-events-none opacity-70' : ''} ${className}`}>
      {busy ? <><span className="spinner" /> Reading…</> : label}
      <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={busy} onChange={(e) => { void add(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

/** ⚠️ The receipt's total isn't the bank's: use its items anyway, or remove the picture. Also in the Guide. */
export function MismatchPanel({ t, onKeep, onRemove, busy }: { t: SpendTx; onKeep?: () => void; onRemove?: () => void; busy?: string }) {
  const mm = t.details?.mismatch;
  if (!mm || mm.kept) return null;
  return (
    <div className="panel space-y-2 !border-amber-400/60 dark:!border-amber-300/30" role="status">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">⚠️ Receipt total <span className="num">{money(mm.receipt)}</span> ≠ bank <span className="num">{money(mm.bank)}</span></p>
      <p className="text-xs text-slate-600 dark:text-slate-300">{mm.receipt ? 'Maybe a tip, a different purchase, or a total read wrong.' : 'No total could be read on it.'} Spending keeps the bank’s {money(mm.bank)} either way: nothing is counted twice.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button className="btn-primary flex-1" disabled={!!busy} onClick={onKeep}>{busy === 'keep' ? <span className="spinner" /> : 'Use its items anyway'}</button>
        <button className="btn flex-1" disabled={!!busy} onClick={onRemove}>{busy === 'detach' ? <span className="spinner" /> : 'Remove picture'}</button>
      </div>
    </div>
  );
}

/** The sheet of one purchase (from the bank or a receipt), wired to the server: edit, 📎 add / replace / remove the receipt, read again, delete. */
export function ReceiptSheet({ t, url, rules, userId, onMove, onClose, onChanged, startDelete }: {
  t: SpendTx; url?: string; rules: Record<string, string>; userId: string; onMove: (cat: string) => void; onClose: () => void; onChanged: () => Promise<void>; startDelete?: boolean;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'line' | 'delete'>(startDelete ? 'delete' : 'view');
  const [busy, setBusy] = useState('');
  const [reading, setReading] = useState(false);
  const [view, setView] = useState(false);
  const run = async (k: string, f: () => Promise<void>) => { setBusy(k); try { await f(); } catch (e) { if ((e as Error)?.name !== 'AbortError') toast('err', errText(e)); } setBusy(''); };
  const title = (t.source === 'receipt' ? t.details?.store || t.description : t.description || t.details?.store) || 'Purchase';
  const bank = t.source !== 'receipt';
  const onView = () => { const l = t.receipt_path && receiptLink(t.receipt_path); if (l) window.open(l, '_blank'); else setView(true); };
  const del = (entry: boolean) => void run('del', async () => {
    if (!t.id) return;
    if (t.receipt_path) await api('receipt', { op: 'delete', id: t.id, entry });
    else await supabase.from('transactions').delete().eq('id', t.id).then(({ error }) => { if (error) throw new Error(error.message); });
    toast('ok', entry ? 'Deleted from Spending.' : 'Receipt deleted; the purchase stays in Spending.');
    await onChanged();
    onClose();
  });
  const detach = () => void run('detach', async () => { await api('receipt', { op: 'detach', id: t.id }); toast('ok', 'Receipt removed: the purchase stays as your bank sent it.'); await onChanged(); });
  const keep = () => void run('keep', async () => { await api('receipt', { op: 'keep', id: t.id }); toast('ok', 'Its items are kept. Spending still counts the bank’s amount.'); await onChanged(); });
  const attach = t.id ? (
    <AttachReceipt t={t} userId={userId} label={t.receipt_path ? '🔁 Replace receipt' : '📎 Add receipt'} onBusy={setReading}
      onDone={async (r) => { toast(r.status === 'matched' || r.status === 'same' ? 'ok' : 'info', r.text); await onChanged(); }} />
  ) : undefined;
  return (
    <Sheet title={mode === 'edit' ? 'Edit the receipt' : mode === 'line' ? 'Edit the purchase' : title} onClose={onClose}>
      {mode === 'edit' ? (
        <ReceiptEdit t={t} onCancel={() => setMode('view')} onSave={async (details) => { await api('receipt', { op: 'edit', id: t.id, details }); toast('ok', 'Saved.'); await onChanged(); setMode('view'); onClose(); }} />
      ) : mode === 'line' ? (
        <LineEdit t={t} onCancel={() => setMode('view')} onSave={async (line) => { await api('receipt', { op: 'line', id: t.id, line }); toast('ok', 'Saved.'); await onChanged(); setMode('view'); }} />
      ) : (
        <>
          {reading && (
            <div className="panel mb-3 flex items-center gap-3" role="status" aria-live="polite">
              <div className="skel h-20 w-16 shrink-0 !rounded-xl" />
              <div className="flex-1 space-y-2"><p className="text-sm font-semibold">Reading the receipt…</p><div className="skel h-3 w-3/4" /><div className="skel h-3 w-1/2" /></div>
            </div>
          )}
          <MismatchPanel t={t} busy={busy} onKeep={keep} onRemove={detach} />
          <div className={t.details?.mismatch && !t.details.mismatch.kept ? 'mt-3' : ''}>
            <ReceiptDetailsView t={t} url={url} rules={rules} onMove={onMove} onView={onView} actions={{
              busy: busy || (reading ? 'attach' : ''),
              download: () => void run('dl', () => downloadFile(t.receipt_path!, `${safeName(`receipt-${title}-${t.posted}`)}.${fileKind(t.receipt_path!) === 'pdf' ? 'pdf' : 'jpg'}`)),
              share: () => void run('share', async () => { await shareFiles([t.receipt_path!], `Receipt: ${title}`); }),
              attach,
              line: bank ? () => setMode('line') : undefined,
              edit: t.receipt_path ? () => setMode('edit') : undefined,
              reread: () => void run('reread', async () => { const r = await api<{ by: string }>('receipt', { op: 'reread', id: t.id }); toast('ok', `Read again by ${r.by}.`); await onChanged(); }),
              detach: bank && t.receipt_path ? detach : undefined,
              del: () => setMode('delete'),
            }} />
          </div>
          {mode === 'delete' && (
            <div className="panel mt-3 space-y-2 !border-red-300 dark:!border-red-800">
              {t.receipt_path ? (
                <>
                  <p className="text-sm font-semibold">Delete this receipt?</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">Also delete the {money(-Number(t.amount))} purchase from Spending?{bank ? ' It came from your bank too.' : ''}</p>
                  <button className="btn w-full" disabled={!!busy} onClick={() => del(false)}>Delete the receipt only</button>
                  <button className="btn w-full text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => del(true)}>Delete the receipt and the purchase</button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Delete this purchase from Spending?</p>
                  <button className="btn w-full text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => del(true)}>Delete it</button>
                </>
              )}
              <button className="btn-ghost w-full" onClick={() => setMode('view')}>Cancel</button>
            </div>
          )}
        </>
      )}
      {view && isFile(t.receipt_path) && <ReceiptViewer t={t} url={url} onClose={() => setView(false)} onDelete={() => { setView(false); setMode('delete'); }} />}
    </Sheet>
  );
}

/** 📷 Add a receipt: a photo (camera or gallery) or a PDF → read and saved at once → Spending (attached to the bank purchase when it's there), written out in full. */
export function AddReceipt({ userId, onAdded, className = '' }: { userId: string; onAdded: (id?: string) => Promise<void> | void; className?: string }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    let path = '';
    try {
      path = await uploadReceipt(f, `${userId}/money`);
      const r = await api<{ status: string; text: string; id?: string }>('receipt-add', { path });
      toast('ok', r.text);
      await onAdded(r.status === 'known' ? undefined : r.id);
    } catch (e) {
      if (path) void supabase.storage.from('docs').remove([path]).then(() => undefined, () => undefined); // not kept when it couldn't be read
      toast('err', errText(e));
    }
    setBusy(false);
  };
  return (
    <label className={`btn-primary cursor-pointer focus-within:shadow-[0_0_0_4px_rgba(94,234,212,0.25)] ${busy ? 'pointer-events-none opacity-70' : ''} ${className}`}>
      {busy ? <><span className="spinner" /> Reading…</> : '📷 Add a receipt'}
      <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" disabled={busy} onChange={(e) => { void add(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

/** "Last checked: 2:40 PM" for the hourly email look. */
export function lastChecked(at: string | null | undefined): string {
  if (!at) return 'not yet';
  const d = new Date(at);
  const same = d.toLocaleDateString('en-CA') === today();
  return d.toLocaleString('en-US', same ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
