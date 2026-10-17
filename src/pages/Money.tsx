import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/supabase';
import { Bills } from './Bills';
import { PurchaseForm, PurchaseRow, SpendingView } from '../components/Spending';
import { Empty, Seg, Sheet, errText, toast } from '../components/ui';
import { categorize, spendCat, spendReport, type SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { matchSpend } from '../../supabase/functions/_shared/receiptText.ts';
import { SearchBox } from '../components/Contacts';
import { AddReceipt, ReceiptCard, ReceiptSheet, ReceiptViewer, SpendRow, lastChecked, useThumbs } from '../components/Receipts';
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
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ id: string; del?: boolean } | null>(null);
  const [view, setView] = useState<string | null>(null);
  const r = useMemo(() => spendReport(st.tx, s.spend.rules, month, month === now ? Number(t.slice(8, 10)) : 31), [st.tx, s.spend.rules, month, now]);
  const save = (spend: typeof s.spend) => void st.saveSettings({ ...s, spend }).catch((e) => toast('err', errText(e)));
  const move = (key: string, cat: string) => { save({ ...s.spend, rules: { ...s.spend.rules, [key]: cat } }); toast('ok', 'Moved. That shop goes there from now on.'); };
  // 🔎 Search (on this phone): shop, items on the receipt, amount, date, category, notes, the email it came from.
  const found = useMemo(() => (q.trim() ? st.tx.filter((x) => Number(x.amount) < 0 && matchSpend(x, q, spendCat(categorize(x, s.spend.rules)).label)).slice(0, 80) : []), [q, st.tx, s.spend.rules]);
  const receipts = useMemo(() => st.tx.filter((x) => x.receipt_path && x.posted.slice(0, 7) === month), [st.tx, month]);
  const foundReceipts = found.filter((x) => x.receipt_path), foundOther = found.filter((x) => !x.receipt_path);
  const shown = q.trim() ? foundReceipts : receipts;
  const urls = useThumbs(shown);
  const byId = (id: string | null | undefined) => st.tx.find((x) => x.id === id);
  const sel = byId(open?.id);
  const viewing = byId(view);
  const onView = (x: SpendTx) => () => { if (x.receipt_path?.startsWith('gmail:')) window.open(`https://mail.google.com/mail/u/0/#all/${x.receipt_path.slice(6)}`, '_blank'); else setView(x.id ?? null); };
  const gmail = !!st.status?.google.gmail;
  const card = (x: SpendTx) => <ReceiptCard key={x.id} t={x} url={x.receipt_path ? urls[x.receipt_path] : undefined} rules={s.spend.rules} onOpen={() => x.id && setOpen({ id: x.id })} onView={onView(x)} />;
  return (
    <div className="stagger space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[28px] font-semibold leading-tight">Spending</h1>
        <Seg label="Month" options={[[now, 'This month'], [last, 'Last month']]} value={month} onChange={setMonth} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-56"><SearchBox q={q} onChange={setQ} placeholder="Shop, item, 23.45, March…" label="Search spending and receipts" /></div>
        <AddReceipt userId={st.session.user.id} className="w-full whitespace-nowrap sm:w-auto" onAdded={async () => { await st.reload(); }} />
      </div>
      {q.trim() ? (
        <>
          <p className="label px-1" aria-live="polite">{found.length ? `${found.length}${found.length === 80 ? '+' : ''} found` : 'Nothing found'}</p>
          {foundReceipts.length > 0 && <ul className="space-y-3" aria-label="Receipts found">{foundReceipts.map((x) => card(x))}</ul>}
          {foundOther.length > 0 && (
            <section className="card space-y-1">
              {foundReceipts.length > 0 && <p className="label">Other purchases</p>}
              <ul>{foundOther.map((x) => <SpendRow key={x.id ?? `${x.posted}${x.description}${x.amount}`} t={x} rules={s.spend.rules} onOpen={() => x.id && setOpen({ id: x.id })} />)}</ul>
            </section>
          )}
          {!found.length && <p className="card text-sm text-slate-500 dark:text-slate-400">Try a shop, something you bought, an amount like 23.45, or a month.</p>}
        </>
      ) : (
        <>
          <SpendingView r={r} budgets={s.spend.budgets} alertAt={s.spend.alertAt} monthName={monthName(month)}
            onBudget={(cat, n) => { const budgets = { ...s.spend.budgets }; if (n) budgets[cat] = n; else delete budgets[cat]; save({ ...s.spend, budgets }); toast('ok', n ? 'Budget saved: you get a heads-up at 80% and when it’s used up.' : 'Budget removed.'); }}
            onMove={move} />
          <div className="flex items-baseline justify-between gap-2 px-1 pt-1"><p className="label">🧾 Receipts <span className="num">· {receipts.length}</span></p><span className="text-[11px] text-slate-500 dark:text-slate-400">Tap a picture for full screen</span></div>
          {receipts.length ? <ul className="space-y-3">{receipts.map((x) => card(x))}</ul>
            : <p className="card text-sm text-slate-500 dark:text-slate-400">No receipts this month yet. Receipts in your emails come here by themselves, or tap 📷 Add a receipt.</p>}
        </>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">{gmail ? `📧 Your Gmail is checked every hour for receipts and bank alerts (free checks first). Last checked: ${lastChecked(st.status?.mail?.mailChecked ?? st.status?.mail?.receiptsScanned)}.` : 'Connect Gmail (Settings → Google) and receipts in your emails come here by themselves.'} A receipt that matches a bank purchase is attached to it, so nothing is counted twice.</p>
      {sel && <ReceiptSheet key={sel.id} t={sel} url={sel.receipt_path ? urls[sel.receipt_path] : undefined} rules={s.spend.rules} startDelete={open?.del} onMove={(cat) => move(sel.merchant || (sel.description ?? 'other').toLowerCase(), cat)} onClose={() => setOpen(null)} onChanged={st.reload} />}
      {viewing?.receipt_path && <ReceiptViewer t={viewing} url={urls[viewing.receipt_path]} onClose={() => setView(null)} onDelete={() => { setView(null); setOpen({ id: viewing.id!, del: true }); }} />}
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
