import { useEffect, useState, type ReactNode } from 'react';
import { money } from '../../supabase/functions/_shared/money.ts';

export function Money({ n, currency = 'USD', className = '' }: { n: number; currency?: string; className?: string }) {
  return <span className={`num ${className}`}>{money(n, currency)}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-stone-800 dark:text-slate-100">{label}</p>
        {hint && <p className="text-xs text-stone-500 dark:text-slate-400">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition disabled:opacity-40 ${on ? 'bg-emerald-700 dark:bg-emerald-600' : 'bg-stone-300 dark:bg-slate-700'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

/** A section that opens and closes (closed by default, like the owner's other apps). */
export function Fold({ title, subtitle, icon, open: start = false, children }: { title: string; subtitle?: string; icon?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(start);
  return (
    <section className="card !p-0">
      <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon && <span className="text-xl" aria-hidden="true">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] font-semibold text-stone-900 dark:text-slate-50">{title}</span>
          {subtitle && <span className="block truncate text-xs text-stone-500 dark:text-slate-400">{subtitle}</span>}
        </span>
        <span aria-hidden="true" className={`text-stone-400 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && <div className="space-y-2 border-t border-stone-200 px-4 pb-4 pt-3 dark:border-slate-800">{children}</div>}
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
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm animate-[fade_.2s_ease-out] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-white/60 bg-[#f8faf9] p-4 pb-8 shadow-2xl animate-[pop_.25s_ease-out] dark:border-white/10 dark:bg-[#0c1220] sm:max-w-lg sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="btn-ghost text-lg" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
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
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-lg ${t.kind === 'err' ? 'bg-red-700 text-white' : t.kind === 'ok' ? 'bg-emerald-800 text-white' : 'bg-stone-800 text-white'}`}>{t.text}</div>
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
            <span key={v} className="chip border-stone-300 bg-white text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {v}<button className="ml-0.5 text-stone-400 hover:text-red-600" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
