import { openFile } from '../lib/vault';
import { useState } from 'react';
import { SPEND_CATS, spendCat, type SpendReport } from '../../supabase/functions/_shared/spend.ts';
import type { Purchase } from '../../supabase/functions/_shared/model.ts';
import { addCycle, daysBetween, money, today } from '../../supabase/functions/_shared/money.ts';
import { Ring } from './Dash';
import { PersonChip, personEdge, usePersonFor } from './Person';
import { Money, Sheet, errText, shortDate, toast } from './ui';

/**
 * 💸 The month at the top of Spending: the total against a usual month (ring), then a compact line per category (the
 * same categories the list's chips show; tap one to show only its purchases), with its budget. 🎯 Budgets edits them.
 * Also in the Guide.
 */
export function SpendingView({ r, budgets, alertAt = 0.8, onBudget, monthName, cat, onCat }: {
  r: SpendReport; budgets: Record<string, number>; alertAt?: number; monthName: string;
  onBudget?: (cat: string, amount: number | null) => void; cat?: string; onCat?: (cat: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const share = r.usual ? r.total / r.usual : 0;
  const shown = r.byCat.filter((c) => c.amount > 0 || budgets[c.id]);
  const max = Math.max(1, ...shown.map((c) => Math.max(c.amount, budgets[c.id] ?? 0)));
  return (
    <div className="space-y-3">
      <section className="card flex items-center gap-4">
        <Ring value={share} size={92} stroke={9} tone={share > 1 ? 'red' : share > 0.9 ? 'amber' : 'emerald'} label={r.usual ? `${Math.round(share * 100)}% of a usual month` : 'No usual month yet'}>
          <span className="num text-lg font-semibold">{r.usual ? `${Math.round(share * 100)}%` : '—'}</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">of usual</span>
        </Ring>
        <div className="min-w-0">
          <p className="label">{monthName}</p>
          <Money n={r.total} className="block text-[32px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white" />
          <p className="text-xs text-slate-500 dark:text-slate-400">{r.count} purchase{r.count === 1 ? '' : 's'}{r.usual ? ` · a usual month ${money(r.usual)}` : ''} · transfers not counted</p>
        </div>
      </section>

      <section className="card !py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="label">By category</p>
          {onBudget && <button className="btn-ghost tap min-h-[44px] text-xs font-semibold" onClick={() => setEdit(true)}>🎯 Budgets</button>}
        </div>
        {shown.length ? (
          <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {shown.map((c) => {
              const k = spendCat(c.id);
              const b = budgets[c.id];
              const over = b ? c.amount / b : 0;
              const bar = over >= 1 ? 'bg-red-500 dark:bg-red-400' : b && over >= alertAt ? 'bg-amber-500 dark:bg-amber-300' : 'bg-gradient-to-r from-teal-400 to-violet-400';
              const on = cat === c.id;
              return (
                <li key={c.id}>
                  <button className={`tap -mx-2 block min-h-[44px] w-[calc(100%+1rem)] rounded-xl px-2 py-1 text-left ${on ? 'bg-teal-500/10 ring-1 ring-teal-500/40 dark:bg-teal-300/10 dark:ring-teal-300/30' : ''}`} onClick={() => onCat?.(on ? 'all' : c.id)} aria-pressed={on} aria-label={`${k.label} ${money(c.amount)}${b ? ` of ${money(b)}` : ''}: ${on ? 'show all purchases' : 'show only these purchases'}`}>
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-semibold"><span aria-hidden="true">{k.icon}</span> {k.label}</span>
                      <span className="num shrink-0 text-slate-700 dark:text-slate-200">{money(c.amount)}{b ? <span className="text-slate-500 dark:text-slate-400"> / {money(b)}</span> : ''}</span>
                    </span>
                    <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/[0.08]" title={c.usual != null ? `Usual: ${money(c.usual)}` : undefined}>
                      <span className={`bar-grow block h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, (c.amount / max) * 100)}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="py-1 text-sm text-slate-500 dark:text-slate-400">No purchases this month yet. They come from your bank alert emails (Settings → Bank & cards), your receipts, or a bank CSV (Inbox).</p>}
      </section>
      {edit && onBudget && <BudgetSheet r={r} budgets={budgets} onBudget={onBudget} onClose={() => setEdit(false)} />}
    </div>
  );
}

/** 🎯 Monthly budgets per category: a heads-up at 80% (Settings) and when it's used up. */
function BudgetSheet({ r, budgets, onBudget, onClose }: { r: SpendReport; budgets: Record<string, number>; onBudget: (cat: string, amount: number | null) => void; onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(SPEND_CATS.map((c) => [c.id, budgets[c.id] ? String(budgets[c.id]) : ''])));
  const spent = (id: string) => r.byCat.find((c) => c.id === id);
  const save = () => {
    for (const c of SPEND_CATS) {
      const n = Number(vals[c.id]);
      const want = vals[c.id].trim() && n > 0 ? Math.round(n) : null;
      if ((budgets[c.id] ?? null) !== want) onBudget(c.id, want);
    }
    onClose();
  };
  return (
    <Sheet title="🎯 Monthly budgets" onClose={onClose}>
      <div className="space-y-1">
        <p className="pb-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no budget. You get a heads-up near it and when it’s used up.</p>
        {SPEND_CATS.filter((c) => c.id !== 'transfers').map((c) => {
          const x = spent(c.id);
          return (
            <label key={c.id} className="field flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-semibold"><span aria-hidden="true">{c.icon}</span> {c.label}</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{x ? `${money(x.amount)} now${x.usual != null ? ` · usual ${money(x.usual)}` : ''}` : 'Nothing yet'}</span></span>
              <span className="flex shrink-0 items-center gap-1 text-slate-500 dark:text-slate-400">$<input className="input w-24" type="number" inputMode="decimal" min={0} placeholder="none" value={vals[c.id]} onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} aria-label={`${c.label} monthly budget`} /></span>
            </label>
          );
        })}
        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1" onClick={save}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- 🧾 returns & warranties ----------
export function PurchaseRow({ p, onSet, onOpen }: { p: Purchase; onSet?: (patch: Partial<Purchase>) => void; onOpen?: () => void }) {
  const t = today();
  const left = p.return_by ? daysBetween(t, p.return_by) : null;
  const wLeft = p.warranty_ends ? daysBetween(t, p.warranty_ends) : null;
  const who = usePersonFor(p); // 👥 whose order email it came from
  const tone = left == null || left < 0 || p.status !== 'keep' ? 'border-slate-900/10 text-slate-500 dark:border-white/10 dark:text-slate-400' : left <= 3 ? 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-200' : left <= 10 ? 'border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200' : 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200';
  return (
    <div className={`panel space-y-2 ${personEdge(who)}`}>
      <button className="tap -m-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-2xl p-1 text-left" onClick={onOpen}>
        <span className="tile" aria-hidden="true">🧾</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.store}{p.item ? ` · ${p.item}` : ''}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Bought {shortDate(p.bought)}{p.amount != null ? ` · ${money(Number(p.amount))}` : ''}{p.status === 'returning' ? ' · returning' : p.status === 'returned' ? ' · returned' : p.status === 'kept' ? ' · kept' : ''}</span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <PersonChip p={who} />
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
