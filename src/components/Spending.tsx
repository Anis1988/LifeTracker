import { openFile } from '../lib/vault';
import { useState } from 'react';
import { SPEND_CATS, spendCat, type SpendReport } from '../../supabase/functions/_shared/spend.ts';
import type { Purchase } from '../../supabase/functions/_shared/model.ts';
import { addCycle, daysBetween, money, today } from '../../supabase/functions/_shared/money.ts';
import { Ring } from './Dash';
import { Money, errText, shortDate, toast } from './ui';

/** 💸 One month of spending: the total against a usual month, each category with its budget, the shops. Also in the Guide. */
export function SpendingView({ r, budgets, alertAt = 0.8, onBudget, onMove, monthName }: {
  r: SpendReport; budgets: Record<string, number>; alertAt?: number; monthName: string;
  onBudget?: (cat: string, amount: number | null) => void; onMove?: (shopKey: string, cat: string) => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState('');
  const share = r.usual ? r.total / r.usual : 0;
  const max = Math.max(1, ...r.byCat.map((c) => Math.max(c.amount, c.usual ?? 0, budgets[c.id] ?? 0)));
  const save = (cat: string) => { const n = Number(val); onBudget?.(cat, val.trim() && n > 0 ? Math.round(n) : null); setEdit(null); };
  return (
    <div className="space-y-3">
      <section className="card flex items-center gap-4">
        <Ring value={share} size={100} stroke={9} tone={share > 1 ? 'red' : share > 0.9 ? 'amber' : 'emerald'} label={r.usual ? `${Math.round(share * 100)}% of a usual month` : 'No usual month yet'}>
          <span className="num text-lg font-semibold">{r.usual ? `${Math.round(share * 100)}%` : '—'}</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">of usual</span>
        </Ring>
        <div className="min-w-0">
          <p className="label">{monthName}</p>
          <Money n={r.total} className="block text-[32px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white" />
          <p className="text-xs text-slate-500 dark:text-slate-400">{r.count} purchase{r.count === 1 ? '' : 's'}{r.usual ? ` · a usual month ${money(r.usual)}` : ''} · transfers not counted</p>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between"><p className="label">By category</p><span className="text-[11px] text-slate-500 dark:text-slate-400">Tap one to set a budget</span></div>
        {r.byCat.length ? r.byCat.map((c) => {
          const cat = spendCat(c.id);
          const b = budgets[c.id];
          const over = b ? c.amount / b : 0;
          const bar = over >= 1 ? 'bg-red-500 dark:bg-red-400' : b && over >= alertAt ? 'bg-amber-500 dark:bg-amber-300' : 'bg-gradient-to-r from-teal-400 to-violet-400';
          return (
            <div key={c.id} className="space-y-1">
              <button className="tap -mx-2 flex min-h-[44px] w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-xl px-2 text-left text-sm" onClick={() => { setEdit(edit === c.id ? null : c.id); setVal(b ? String(b) : ''); }} aria-expanded={edit === c.id}>
                <span className="min-w-0 truncate font-semibold"><span aria-hidden="true">{cat.icon}</span> {cat.label}</span>
                <span className="num shrink-0 text-slate-700 dark:text-slate-200">{money(c.amount)}{b ? <span className="text-slate-500 dark:text-slate-400"> / {money(b)}</span> : ''}</span>
              </button>
              <div className="relative h-2 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/[0.08]">
                <div className={`bar-grow h-full rounded-full ${bar} transition-[width] duration-700`} style={{ width: `${Math.min(100, (c.amount / max) * 100)}%` }} />
                {c.usual != null && c.usual > 0 && <span className="absolute top-0 h-full w-0.5 bg-slate-500/70 dark:bg-slate-300/70" style={{ left: `${Math.min(99.5, (c.usual / max) * 100)}%` }} title={`Usual: ${money(c.usual)}`} />}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.usual != null ? `Usual month ${money(c.usual)}` : 'No usual month yet'}{b ? ` · ${over >= 1 ? 'budget used up' : `${Math.round(over * 100)}% of budget`}` : ''}</p>
              {edit === c.id && onBudget && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label className="text-xs text-slate-600 dark:text-slate-300" htmlFor={`b-${c.id}`}>Monthly budget $</label>
                  <input id={`b-${c.id}`} className="input w-28" type="number" inputMode="decimal" min={0} placeholder="none" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save(c.id)} />
                  <button className="btn-primary" onClick={() => save(c.id)}>Save</button>
                  {b ? <button className="btn-ghost text-xs" onClick={() => { onBudget(c.id, null); setEdit(null); }}>Remove budget</button> : null}
                </div>
              )}
            </div>
          );
        }) : <p className="text-sm text-slate-500 dark:text-slate-400">No purchases this month yet. They come from your bank alert emails (Settings → Bank & cards), your receipts, or a bank CSV (Inbox).</p>}
      </section>

      {r.top.length > 0 && (
        <section className="card space-y-1">
          <p className="label">Where it went</p>
          <ul>
            {r.top.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-900/[0.06] py-2 first:border-0 dark:border-white/[0.06]">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate text-sm font-semibold">{s.name}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{s.count} time{s.count === 1 ? '' : 's'}</span>
                </span>
                {onMove ? (
                  <select className="input py-0 text-sm" value={s.cat} onChange={(e) => onMove(s.key, e.target.value)} aria-label={`Category for ${s.name}`}>
                    {SPEND_CATS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                ) : <span className="text-xs text-slate-500 dark:text-slate-400">{spendCat(s.cat).icon} {spendCat(s.cat).label}</span>}
                <Money n={s.amount} className="text-sm font-semibold" />
              </li>
            ))}
          </ul>
          {onMove && <p className="text-[11px] text-slate-500 dark:text-slate-400">Wrong category? Pick the right one: that shop always goes there from now on.</p>}
        </section>
      )}
    </div>
  );
}

// ---------- 🧾 returns & warranties ----------
export function PurchaseRow({ p, onSet, onOpen }: { p: Purchase; onSet?: (patch: Partial<Purchase>) => void; onOpen?: () => void }) {
  const t = today();
  const left = p.return_by ? daysBetween(t, p.return_by) : null;
  const wLeft = p.warranty_ends ? daysBetween(t, p.warranty_ends) : null;
  const tone = left == null || left < 0 || p.status !== 'keep' ? 'border-slate-900/10 text-slate-500 dark:border-white/10 dark:text-slate-400' : left <= 3 ? 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-200' : left <= 10 ? 'border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200' : 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200';
  return (
    <div className="panel space-y-2">
      <button className="tap -m-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-2xl p-1 text-left" onClick={onOpen}>
        <span className="tile" aria-hidden="true">🧾</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.store}{p.item ? ` · ${p.item}` : ''}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Bought {shortDate(p.bought)}{p.amount != null ? ` · ${money(Number(p.amount))}` : ''}{p.status === 'returning' ? ' · returning' : p.status === 'returned' ? ' · returned' : p.status === 'kept' ? ' · kept' : ''}</span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        {p.return_by && <span className={`chip ${tone}`}>{left! < 0 ? `Return window closed ${shortDate(p.return_by)}` : `Return by ${shortDate(p.return_by)}${p.status === 'keep' ? ` · ${left} day${left === 1 ? '' : 's'}` : ''}`}</span>}
        {p.warranty_ends && <span className={`chip ${wLeft! < 0 ? 'border-slate-900/10 text-slate-500 dark:border-white/10 dark:text-slate-400' : 'border-violet-300 text-violet-800 dark:border-violet-800 dark:text-violet-200'}`}>🛡️ Warranty to {shortDate(p.warranty_ends)}</span>}
        {!p.return_by && !p.warranty_ends && <span className="text-xs text-slate-500 dark:text-slate-400">No return date known: tap to add one.</span>}
      </div>
      {onSet && p.status === 'keep' && left != null && left >= 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button className="btn text-xs" onClick={() => onSet({ status: 'returning' })}>Returning it</button>
          <button className="btn text-xs" onClick={() => onSet({ status: 'kept' })}>Keeping it</button>
        </div>
      )}
      {onSet && p.status === 'returning' && <button className="btn text-xs" onClick={() => onSet({ status: 'returned' })}>✓ Returned</button>}
      {p.notes && <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.notes}</p>}
      {p.file && <button className="btn text-xs" onClick={() => void openFile(p.file!).catch((e) => toast('err', errText(e)))}>📎 Receipt</button>}
    </div>
  );
}

export function PurchaseForm({ p, onSave, onDelete, onDone }: { p: Partial<Purchase>; onSave: (p: Partial<Purchase> & { store: string }) => Promise<unknown>; onDelete?: () => Promise<void>; onDone: () => void }) {
  const [x, setX] = useState<Partial<Purchase>>({ bought: today(), status: 'keep', ...p });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Purchase>) => setX((c) => ({ ...c, ...patch }));
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
  const addMonths = (d: string, n: number) => addCycle(d, 'monthly', n); // Jan 31 + 1 month = Feb 28, not Mar 3
  const save = async () => { setBusy(true); try { await onSave({ ...x, store: (x.store ?? '').trim() }); onDone(); } catch (e) { toast('err', errText(e)); } finally { setBusy(false); } };
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold">Store<input className="input mt-1 w-full" value={x.store ?? ''} onChange={(e) => set({ store: e.target.value })} placeholder="e.g. Best Buy" /></label>
      <label className="block text-sm font-semibold">What you bought<input className="input mt-1 w-full" value={x.item ?? ''} onChange={(e) => set({ item: e.target.value || null })} placeholder="e.g. Headphones" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">Price $<input className="input mt-1 w-full" type="number" inputMode="decimal" value={x.amount ?? ''} onChange={(e) => set({ amount: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label className="block text-sm font-semibold">Bought on<input className="input mt-1 w-full" type="date" value={x.bought ?? ''} onChange={(e) => set({ bought: e.target.value })} /></label>
      </div>
      <label className="block text-sm font-semibold">Return by<input className="input mt-1 w-full" type="date" value={x.return_by ?? ''} onChange={(e) => set({ return_by: e.target.value || null })} /></label>
      <div className="flex flex-wrap gap-1.5">{[14, 30, 60, 90].map((d) => <button key={d} className="chip border-slate-900/10 px-3 py-1.5 dark:border-white/10" onClick={() => set({ return_by: addDays(x.bought ?? today(), d) })}>{d} days</button>)}</div>
      <label className="block text-sm font-semibold">Warranty until<input className="input mt-1 w-full" type="date" value={x.warranty_ends ?? ''} onChange={(e) => set({ warranty_ends: e.target.value || null })} /></label>
      <div className="flex flex-wrap gap-1.5">{[12, 24, 36].map((m) => <button key={m} className="chip border-slate-900/10 px-3 py-1.5 dark:border-white/10" onClick={() => set({ warranty_ends: addMonths(x.bought ?? today(), m) })}>{m / 12} year{m > 12 ? 's' : ''}</button>)}</div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy || !(x.store ?? '').trim()} onClick={() => void save()}>{busy ? <span className="spinner" /> : 'Save'}</button>
        {onDelete && <button className="btn text-red-700 dark:text-red-300" onClick={() => void (confirm('Delete this purchase?') && onDelete().then(onDone).catch((e) => toast('err', errText(e))))}>Delete</button>}
      </div>
    </div>
  );
}
