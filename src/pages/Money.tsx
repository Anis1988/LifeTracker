import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/supabase';
import { Bills } from './Bills';
import { PurchaseForm, PurchaseRow, SpendingView } from '../components/Spending';
import { Empty, Seg, Sheet, errText, toast } from '../components/ui';
import { spendReport } from '../../supabase/functions/_shared/spend.ts';
import { addCycle, today } from '../../supabase/functions/_shared/money.ts';
import type { Purchase } from '../../supabase/functions/_shared/model.ts';

type View = 'bills' | 'spending' | 'returns';
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 💳 Money: your bills, what you spend, and what you can still return. */
export function MoneyPage() {
  const [view, setView] = useState<View>(() => (sessionStorage.getItem('lt.money') as View | null) ?? 'bills');
  const pick = (v: View) => { setView(v); try { sessionStorage.setItem('lt.money', v); } catch { /* private mode */ } };
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Seg label="Money" options={[['bills', 'Bills'], ['spending', 'Spending'], ['returns', 'Returns']]} value={view} onChange={pick} />
      {view === 'bills' ? <Bills /> : view === 'spending' ? <Spending /> : <Returns />}
    </div>
  );
}

function Spending() {
  const st = useStore();
  const s = st.settings;
  const t = today(); // this phone's day, not the UTC one
  const now = t.slice(0, 7);
  const last = addCycle(`${now}-01`, 'monthly', -1).slice(0, 7);
  const [month, setMonth] = useState(now);
  const r = useMemo(() => spendReport(st.tx, s.spend.rules, month, month === now ? Number(t.slice(8, 10)) : 31), [st.tx, s.spend.rules, month, now]);
  const save = (spend: typeof s.spend) => void st.saveSettings({ ...s, spend }).catch((e) => toast('err', errText(e)));
  return (
    <div className="stagger space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[28px] font-semibold leading-tight">Spending</h1>
        <Seg label="Month" options={[[now, 'This month'], [last, 'Last month']]} value={month} onChange={setMonth} />
      </div>
      <SpendingView r={r} budgets={s.spend.budgets} alertAt={s.spend.alertAt} monthName={monthName(month)}
        onBudget={(cat, n) => { const budgets = { ...s.spend.budgets }; if (n) budgets[cat] = n; else delete budgets[cat]; save({ ...s.spend, budgets }); toast('ok', n ? 'Budget saved: you get a heads-up at 80% and when it’s used up.' : 'Budget removed.'); }}
        onMove={(key, cat) => { save({ ...s.spend, rules: { ...s.spend.rules, [key]: cat } }); toast('ok', 'Moved. That shop goes there from now on.'); }} />
    </div>
  );
}

function Returns() {
  const st = useStore();
  const [open, setOpen] = useState<Partial<Purchase> | null>(null);
  const [busy, setBusy] = useState(false);
  const list = [...st.purchases].sort((a, b) => {
    const rank = (p: Purchase) => (p.status === 'keep' ? 0 : p.status === 'returning' ? 1 : 2);
    return rank(a) - rank(b) || (a.return_by ?? '9').localeCompare(b.return_by ?? '9');
  });
  const scan = async () => {
    setBusy(true);
    try {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'purchases' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'No new order emails.');
      await st.reload();
    } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  return (
    <div className="stagger space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="w-full text-[28px] font-semibold leading-tight sm:mr-auto sm:w-auto">Returns & warranties</h1>
        <button className="btn flex-1 sm:flex-none" disabled={busy || !st.status?.google.gmail} onClick={() => void scan()}>{busy ? <><span className="spinner" /> Reading…</> : 'Check Gmail'}</button>
        <button className="btn-primary flex-1 sm:flex-none" onClick={() => setOpen({})}>＋ Add</button>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">Order emails in Gmail are read every morning (a free check first, then the AI). You get a heads-up 3 days before a return window closes, and a month before a warranty ends.</p>
      {list.length ? <div className="space-y-2">{list.map((p) => <PurchaseRow key={p.id} p={p} onOpen={() => setOpen(p)} onSet={(patch) => void st.savePurchase({ ...p, ...patch }).catch((e) => toast('err', errText(e)))} />)}</div>
        : <Empty icon="🧾">Nothing yet. Purchases appear here from your order emails, or tap ＋ Add.</Empty>}
      {open && (
        <Sheet title={open.id ? open.store ?? 'Purchase' : 'Add a purchase'} onClose={() => setOpen(null)}>
          <PurchaseForm p={open} onSave={st.savePurchase} onDelete={open.id ? () => st.deletePurchase(open.id!) : undefined} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </div>
  );
}
