import { useMemo, useState } from 'react';
import { CATEGORIES, CYCLES, catOf, type Category, type Cycle, type Item } from '../../supabase/functions/_shared/model.ts';
import { amortize, daysBetween, dueDates, loanPayment, monthly, nextDue, today } from '../../supabase/functions/_shared/money.ts';
import { Field, Money, Toggle, errText, shortDate, toast } from './ui';

const cycleWord: Record<Cycle, string> = { weekly: '/wk', biweekly: '/2 wk', monthly: '/mo', quarterly: '/3 mo', semiannual: '/6 mo', yearly: '/yr', once: ' once' };

/** One bill in a list. Also drawn in the Guide with made-up data. */
export function ItemRow({ i, onOpen }: { i: Item; onOpen?: () => void }) {
  const due = nextDue(i);
  const days = due ? daysBetween(today(), due) : null;
  const up = i.price_history?.length ? i.price_history[i.price_history.length - 1] : null;
  return (
    <button className="tap flex min-h-[60px] w-full items-center gap-3 rounded-[20px] px-2 py-2.5 text-left hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04]" onClick={onOpen}>
      <span className="tile" aria-hidden="true">{catOf(i.category).icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={`truncate font-semibold ${i.status !== 'active' ? 'text-slate-400 dark:text-slate-500 line-through' : ''}`}>{i.name}</span>
          {i.trial_ends && i.trial_ends >= today() && <span className="chip border-amber-300 bg-amber-500/10 text-amber-800 dark:border-amber-700 dark:bg-amber-400/10 dark:text-amber-200">trial</span>}
          {up && <span className="chip border-red-200 bg-red-500/10 text-red-700 dark:border-red-800 dark:bg-red-400/10 dark:text-red-200" title="Price changed">↑ price</span>}
        </span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {i.status === 'cancelled' ? 'Cancelled' : i.status === 'paused' ? 'Paused' : due ? `${days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Next ${shortDate(due)}`}${i.autopay ? ' · autopay' : ' · pay yourself'}` : 'No due date yet'}
          {i.ends_on && i.status === 'active' ? ` · renews ${shortDate(i.ends_on)}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Money n={Number(i.amount)} currency={i.currency} className="block font-semibold text-slate-900 dark:text-white" />
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{cycleWord[i.cycle]}</span>
      </span>
    </button>
  );
}

/** Totals for the active bills: per month, per year, and by category. */
export function Totals({ items }: { items: Item[] }) {
  const active = items.filter((i) => i.status === 'active');
  const m = active.reduce((t, i) => t + monthly(i), 0);
  const byCat = CATEGORIES.map((c) => ({ c, v: active.filter((i) => i.category === c.id).reduce((t, i) => t + monthly(i), 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const saved = items.filter((i) => i.status === 'cancelled').reduce((t, i) => t + monthly(i), 0);
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Every month</p>
          <Money n={m} className="block text-[40px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white" />
          <p className="text-sm text-slate-500 dark:text-slate-400"><Money n={m * 12} /> a year · {active.length} active</p>
        </div>
        {saved > 0 && <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-200">✂️ Cancelled: you save <Money n={saved * 12} /> a year</p>}
      </div>
      {byCat.length > 0 && (
        <div className="space-y-1.5">
          {byCat.map(({ c, v }) => (
            <div key={c.id}>
              <div className="flex justify-between text-sm"><span>{c.icon} {c.label}</span><span className="num text-slate-600 dark:text-slate-300"><Money n={v} />/mo</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/[0.08]"><div className="bar-grow h-full rounded-full bg-gradient-to-r from-teal-400 to-violet-400" style={{ width: `${(v / m) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The next 30 days of payments, by date. */
export function Upcoming({ items, days = 30, onOpen }: { items: Item[]; days?: number; onOpen?: (i: Item) => void }) {
  const t = today();
  const end = new Date(Date.parse(`${t}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
  const rows = items.filter((i) => i.status === 'active').flatMap((i) => dueDates(i, t, end).map((d) => ({ d, i }))).sort((a, b) => a.d.localeCompare(b.d));
  const total = rows.reduce((s, r) => s + Number(r.i.amount), 0);
  return (
    <section className="card space-y-2">
      <div className="flex items-baseline justify-between"><p className="label">Next {days} days</p><Money n={total} className="text-sm font-semibold" /></div>
      {rows.length ? (
        <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.06]">
          {rows.slice(0, 25).map(({ d, i }) => (
            <li key={i.id + d}>
              <button className="tap flex min-h-[44px] w-full items-center gap-3 rounded-xl py-2 text-left" onClick={() => onOpen?.(i)}>
                <span className="w-14 shrink-0 text-xs text-slate-500 dark:text-slate-400">{d === t ? 'Today' : shortDate(d)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{catOf(i.category).icon} {i.name}{!i.autopay && <span className="ml-1.5 chip border-amber-300 text-amber-800 dark:text-amber-200">pay</span>}</span>
                <Money n={Number(i.amount)} className="text-sm" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500 dark:text-slate-400">Nothing due. Add your bills, or link your bank so they are found for you.</p>}
    </section>
  );
}

// ---------- 🏠 mortgage & loans ----------
/** Payoff date, total interest, and what an extra payment each month saves. Also drawn in the Guide. */
export function LoanCalc({ balance, rate, payment, extra = 0, onExtra }: { balance: number; rate: number; payment: number; extra?: number; onExtra?: (n: number) => void }) {
  const [x, setX] = useState(extra);
  const base = useMemo(() => amortize(balance, rate, payment), [balance, rate, payment]);
  const withX = useMemo(() => amortize(balance, rate, payment, x), [balance, rate, payment, x]);
  if (!(balance > 0) || !(payment > 0)) return <p className="text-sm text-slate-500 dark:text-slate-400">Add the balance, rate and monthly payment to see your payoff date.</p>;
  if (payment <= (balance * rate) / 1200) return <p className="text-sm text-red-700">The payment doesn’t cover the interest: check the numbers.</p>;
  const years = (n: number) => `${Math.floor(n / 12)} yr ${n % 12} mo`;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="panel"><p className="label">Paid off</p><p className="font-semibold">{shortDate(base.payoff)}</p><p className="text-xs text-slate-500 dark:text-slate-400">{years(base.months)}</p></div>
        <div className="panel"><p className="label">Interest left</p><Money n={base.interest} className="font-semibold" /></div>
      </div>
      <Field label="Extra each month" hint="Paid on top, straight off the balance.">
        <input className="input w-28" type="number" inputMode="decimal" min={0} step={50} value={x || ''} placeholder="0"
          onChange={(e) => setX(Math.max(0, Number(e.target.value) || 0))} onBlur={() => onExtra?.(x)} aria-label="Extra each month" />
      </Field>
      {x > 0 && (
        <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100">
          With <Money n={x} /> extra a month: paid off <b>{shortDate(withX.payoff)}</b>, {years(base.months - withX.months)} sooner, and you save <b><Money n={base.interest - withX.interest} /></b> in interest.
        </p>
      )}
    </div>
  );
}

// ---------- add / edit ----------
const empty = (category: Category = 'subscription'): Partial<Item> => ({
  name: '', category, amount: 0, currency: 'USD', cycle: category === 'insurance' ? 'yearly' : 'monthly', next_due: null, ends_on: null, trial_ends: null,
  autopay: true, status: 'active', merchant: null, account: null, website: null, notes: null, details: {}, source: 'manual', price_history: [], calendar: {},
});

export function ItemForm({ item, onSave, onDelete, onDone }: {
  item?: Partial<Item>; onSave: (i: Partial<Item> & { name: string }) => Promise<unknown>; onDelete?: () => Promise<void>; onDone: () => void;
}) {
  const [f, setF] = useState<Partial<Item>>({ ...empty(item?.category as Category), ...item });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Item>) => setF((x) => ({ ...x, ...p }));
  const det = (p: Partial<Item['details']>) => setF((x) => ({ ...x, details: { ...x.details, ...p } }));
  const d = f.details ?? {};
  const loan = f.category === 'mortgage' || f.category === 'loan';
  const save = async () => {
    if (!f.name?.trim()) return toast('err', 'Give it a name.');
    setBusy(true);
    try {
      await onSave({ ...f, name: f.name.trim(), amount: Number(f.amount) || 0 } as Partial<Item> & { name: string });
      onDone();
    } catch (e) {
      toast('err', errText(e));
    } finally {
      setBusy(false);
    }
  };
  const date = (k: 'next_due' | 'ends_on' | 'trial_ends', label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="input w-40" type="date" value={f[k] ?? ''} onChange={(e) => set({ [k]: e.target.value || null })} aria-label={label} />
    </Field>
  );
  const num = (v: number | undefined, on: (n: number | undefined) => void, label: string, step = 1, w = 'w-32') => (
    <input className={`input ${w}`} type="number" inputMode="decimal" step={step} value={v ?? ''} onChange={(e) => on(e.target.value === '' ? undefined : Number(e.target.value))} aria-label={label} />
  );
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5 pb-2">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" onClick={() => set({ category: c.id })}
            className={`chip !py-1 ${f.category === c.id ? 'bg-gradient-to-br from-teal-300 to-violet-400 !border-transparent text-[#04121a] shadow-[0_0_18px_-6px_#5eead4]' : 'border-slate-900/10 dark:border-white/10 text-slate-700 dark:text-slate-300 dark:border-slate-700 dark:text-slate-300'}`}>{c.icon} {c.label}</button>
        ))}
      </div>
      <input className="input w-full text-lg" placeholder="Name, e.g. Netflix" value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <label className="text-xs text-slate-500 dark:text-slate-400">Amount<input className="input mt-1 w-full" type="number" inputMode="decimal" step="0.01" value={f.amount || ''} onChange={(e) => set({ amount: Number(e.target.value) })} /></label>
        <label className="text-xs text-slate-500 dark:text-slate-400">How often<select className="input mt-1 w-full" value={f.cycle} onChange={(e) => set({ cycle: e.target.value as Cycle })}>{CYCLES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      </div>
      {date('next_due', 'Next payment', 'Moves forward by itself after each payment.')}
      <Field label="Autopay" hint="Off = you get a heads-up to pay it.">
        <Toggle on={!!f.autopay} onChange={(v) => set({ autopay: v })} label="Autopay" />
      </Field>
      {date('ends_on', loan ? 'Paid off / ends' : 'Renews or ends', 'Contract end, policy renewal… you get a heads-up before.')}
      {f.category === 'subscription' && date('trial_ends', 'Free trial ends', 'A reminder before it starts charging.')}

      {loan && (
        <div className="panel mt-2 space-y-1">
          <p className="label">{f.category === 'mortgage' ? '🏠 Mortgage' : '🏦 Loan'}</p>
          <Field label="Balance owed">{num(d.balance, (n) => det({ balance: n }), 'Balance', 100)}</Field>
          <Field label="Interest rate (%)">{num(d.rate, (n) => det({ rate: n }), 'Rate', 0.01, 'w-24')}</Field>
          <Field label="Of the payment: taxes & insurance (escrow)" hint="Leave empty if none.">{num(d.escrow, (n) => det({ escrow: n }), 'Escrow', 10, 'w-28')}</Field>
          <LoanCalc balance={d.balance ?? 0} rate={d.rate ?? 0} payment={(Number(f.amount) || 0) - (d.escrow ?? 0)} extra={d.extra} onExtra={(n) => det({ extra: n })} />
          {!f.amount && d.balance && d.rate ? <p className="text-xs text-slate-500 dark:text-slate-400">A 30-year loan of this size would be about <Money n={loanPayment(d.balance, d.rate, 360)} />/month.</p> : null}
        </div>
      )}
      {f.category === 'insurance' && (
        <div className="panel mt-2 space-y-1">
          <p className="label">🛡️ Policy</p>
          <Field label="Insurer"><input className="input w-44" value={d.insurer ?? ''} onChange={(e) => det({ insurer: e.target.value || undefined })} aria-label="Insurer" /></Field>
          <Field label="Policy number"><input className="input w-44" value={d.policyNumber ?? ''} onChange={(e) => det({ policyNumber: e.target.value || undefined })} aria-label="Policy number" /></Field>
          <Field label="Deductible">{num(d.deductible, (n) => det({ deductible: n }), 'Deductible', 50)}</Field>
          <label className="block text-xs text-slate-500 dark:text-slate-400">What it covers<textarea className="input mt-1 w-full py-2" rows={2} value={d.coverage ?? ''} onChange={(e) => det({ coverage: e.target.value || undefined })} /></label>
        </div>
      )}

      <details className="pt-2">
        <summary className="text-sm font-semibold text-slate-600 dark:text-slate-300">More (bank name, account, website, notes)</summary>
        <div className="space-y-1 pt-2">
          <Field label="Name on the bank statement" hint="So charges are matched to this bill, e.g. NETFLIX.COM"><input className="input w-44" value={f.merchant ?? ''} onChange={(e) => set({ merchant: e.target.value || null })} aria-label="Bank name" /></Field>
          <Field label="Paid from" hint="Card or account"><input className="input w-44" value={f.account ?? ''} onChange={(e) => set({ account: e.target.value || null })} aria-label="Paid from" /></Field>
          <Field label="Website" hint="Where to manage or cancel it"><input className="input w-44" value={f.website ?? ''} onChange={(e) => set({ website: e.target.value || null })} aria-label="Website" /></Field>
          <textarea className="input w-full py-2" rows={2} placeholder="Notes" value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} aria-label="Notes" />
        </div>
      </details>

      {!!f.price_history?.length && (
        <p className="pt-2 text-xs text-slate-500 dark:text-slate-400">Price changes: {f.price_history.map((p) => `${shortDate(p.date)} $${p.amount}`).join(' · ')}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-3">
        <button className="btn-primary flex-1" disabled={busy} onClick={() => void save()}>{busy ? <span className="spinner" /> : 'Save'}</button>
        {f.id && f.status === 'active' && <button className="btn" disabled={busy} onClick={() => set({ status: 'cancelled' })}>✂️ Mark cancelled</button>}
        {f.id && f.status !== 'active' && <button className="btn" disabled={busy} onClick={() => set({ status: 'active' })}>Active again</button>}
        {onDelete && <button className="btn text-red-700 dark:text-red-300" disabled={busy} onClick={() => { if (confirm('Delete this bill for good?')) void onDelete().then(onDone).catch((e) => toast('err', errText(e))); }}>🗑</button>}
      </div>
      {f.id && f.status === 'active' && f.website && <a className="btn-ghost mt-1" href={f.website} target="_blank" rel="noopener noreferrer">↗ Manage or cancel on their site</a>}
    </div>
  );
}
