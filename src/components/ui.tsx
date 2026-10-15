import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { money } from '../../supabase/functions/_shared/money.ts';

export function Money({ n, currency = 'USD', className = '' }: { n: number; currency?: string; className?: string }) {
  return <span className={`num ${className}`}>{money(n, currency)}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field flex min-h-[56px] flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** A chevron that turns when its section opens. */
export function Chevron({ open, className = '' }: { open?: boolean; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-500 [transition-timing-function:var(--spring)] ${open ? 'rotate-180' : ''} ${className}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;
}

/** Nothing here yet: a small floating glass orb above the words. */
export function Empty({ icon, children, className = '' }: { icon: string; children: ReactNode; className?: string }) {
  return (
    <div className={`card flex flex-col items-center gap-3 px-6 py-8 text-center ${className}`}>
      <span className="orb" aria-hidden="true">{icon}</span>
      <div className="max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">{children}</div>
    </div>
  );
}

/** Loading: a shimmering outline of a page (hero, three rings, a list). */
export function Skeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2"><div className="skel h-3 w-28" /><div className="skel h-7 w-48" /></div>
      <div className="card flex items-center gap-4"><div className="skel h-[124px] w-[124px] shrink-0 !rounded-full" /><div className="flex-1 space-y-2.5"><div className="skel h-3 w-24" /><div className="skel h-8 w-36" /><div className="skel h-5 w-full !rounded-full" /></div></div>
      <div className="grid grid-cols-3 gap-2.5">{[0, 1, 2].map((i) => <div key={i} className="card flex flex-col items-center gap-2 !py-3"><div className="skel h-14 w-14 !rounded-full" /><div className="skel h-3 w-14" /></div>)}</div>
      <div className="card space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><div className="skel h-11 w-11 shrink-0 !rounded-2xl" /><div className="flex-1 space-y-2"><div className="skel h-3.5 w-2/3" /><div className="skel h-3 w-1/3" /></div><div className="skel h-4 w-14" /></div>)}</div>
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className="switch">
      <span />
    </button>
  );
}

/** Segmented switch: a glass thumb slides to the picked option. */
export function Seg<T extends string>({ options, value, onChange, label, className = '' }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div className={`seg ${className}`} role="tablist" aria-label={label} style={{ '--i': i, '--n': options.length } as CSSProperties}>
      <span className="thumb" aria-hidden="true" />
      {options.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

/** A section that opens and closes (closed by default, like the owner's other apps). */
export function Fold({ title, subtitle, icon, open: start = false, children }: { title: string; subtitle?: string; icon?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(start);
  return (
    <section className="card !p-0">
      <button className="tap flex min-h-[64px] w-full items-center gap-3 rounded-[26px] px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon && <span className="tile" aria-hidden="true">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[16.5px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>}
        </span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${open ? 'border-teal-500/30 bg-teal-500/10' : 'border-slate-900/[0.06] bg-slate-900/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]'}`}><Chevron open={open} className={open ? '!text-teal-600 dark:!text-teal-300' : ''} /></span>
      </button>
      {open && <div className="rise space-y-2 border-t border-slate-900/[0.07] px-4 pb-4 pt-3 dark:border-white/[0.08]">{children}</div>}
    </section>
  );
}

/** A panel that slides up from the bottom on phones (centred on big screens). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  // Drawn on the page itself (a portal): inside a glass card, "fixed" would be trapped in that card.
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/45 backdrop-blur-md animate-[fade_.3s_ease-out] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="sheet max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[32px] border border-b-0 border-white/70 bg-[#f4f7fb]/95 px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b1020]/95 dark:shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] sm:max-w-lg sm:rounded-[32px] sm:border-b sm:pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 -mx-4 mb-2 bg-gradient-to-b from-[#f4f7fb] from-70% to-[#f4f7fb]/0 px-4 pb-3 pt-2.5 dark:from-[#0b1020] dark:to-[#0b1020]/0">
          <div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-slate-900/15 dark:bg-white/20 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-[21px] font-semibold">{title}</h2>
            <button className="btn h-11 w-11 shrink-0 !rounded-full !p-0" aria-label="Close" onClick={onClose}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------- toasts ----------
type Toast = { id: number; kind: 'ok' | 'err' | 'info'; text: string };
let toasts: Toast[] = [];
const subs = new Set<(t: Toast[]) => void>();
export function toast(kind: Toast['kind'], text: string) {
  const t = { id: Date.now() + Math.random(), kind, text };
  toasts = [...toasts, t];
  subs.forEach((f) => f(toasts));
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); subs.forEach((f) => f(toasts)); }, kind === 'err' ? 7000 : 3500);
}
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => { subs.add(setList); return () => void subs.delete(setList); }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(12px+env(safe-area-inset-top,0px))] z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-md rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-[popin_.45s_cubic-bezier(.34,1.56,.64,1)] ${t.kind === 'err' ? 'bg-red-700/90' : t.kind === 'ok' ? 'bg-teal-800/90' : 'bg-slate-800/90'}`}>{t.text}</div>
      ))}
    </div>
  );
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const shortDate = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.slice(0, 4) !== String(new Date().getFullYear()) ? { year: 'numeric' } : {}) }) : '');

/** A short list of values (names, emails…): type and press Enter or ＋, tap × to remove. */
export function ListInput({ values, onChange, placeholder, type = 'text', max = 5, label }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; type?: string; max?: number; label: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v || values.includes(v) || values.length >= max) return setText('');
    onChange([...values, v]);
    setText('');
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1" type={type} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={label} disabled={values.length >= max} />
        <button className="btn" onClick={add} disabled={!text.trim() || values.length >= max} aria-label={`Add ${label}`}>＋</button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="chip py-0 pl-3 border-teal-500/25 bg-teal-500/10 text-slate-700 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-slate-200">
              {v}<button className="-mr-1 ml-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base text-slate-400 hover:text-red-600 dark:text-slate-500" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
