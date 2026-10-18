import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/supabase';
import { Bills } from './Bills';
import { PurchaseForm, PurchaseRow, SpendingView } from '../components/Spending';
import { Empty, Seg, Sheet, errText, toast } from '../components/ui';
import { SPEND_CATS, categorize, spendCat, spendReport, type SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { matchSpend } from '../../supabase/functions/_shared/receiptText.ts';
import { KindChips, SearchBox } from '../components/Contacts';
import { AddReceipt, ReceiptSheet, ReceiptViewer, SpendLine, lastChecked, useThumbs } from '../components/Receipts';
import { MoneyLog } from '../components/MoneyLog';
import { addCycle, today } from '../../supabase/functions/_shared/money.ts';
import type { Purchase } from '../../supabase/functions/_shared/model.ts';
import { takeParam, useView } from '../lib/nav';

const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "Today", "Yesterday", "Thu, Oct 16". */
const dayName = (d: string, t = today()) => {
  if (d === t) return 'Today';
  const y = new Date(Date.parse(`${t}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  if (d === y) return 'Yesterday';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC', ...(d.slice(0, 4) !== t.slice(0, 4) ? { year: 'numeric' } : {}) });
};
/** Purchases grouped by day, newest first. */
function byDay(list: SpendTx[]): [string, SpendTx[]][] {
  const m = new Map<string, SpendTx[]>();
  for (const x of [...list].sort((a, b) => b.posted.localeCompare(a.posted) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))) m.set(x.posted, [...(m.get(x.posted) ?? []), x]);
  return [...m.entries()];
}

/** 💳 Money: your bills, what you spend, what you can still return, and the 📜 Log of what happened. */
export function MoneyPage() {
  const [view, pick] = useView('money');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Seg label="Money" options={[['bills', 'Bills'], ['spending', 'Spending'], ['returns', 'Returns'], ['log', 'Log']]} value={view} onChange={pick} />
      {view === 'bills' ? <Bills /> : view === 'spending' ? <Spending /> : view === 'log' ? <MoneyLog /> : <Returns />}
    </div>
  );
}

function Spending() {
  const st = useStore();
  const s = st.settings;
  const rules = s.spend.rules;
  const t = today(); // this phone's day, not the UTC one
  const now = t.slice(0, 7);
  const last = addCycle(`${now}-01`, 'monthly', -1).slice(0, 7);
  const [month, setMonth] = useState(now);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [many, setMany] = useState(60);
  const [open, setOpen] = useState<{ id: string; del?: boolean } | null>(null);
  const [view, setView] = useState<string | null>(null);
  const r = useMemo(() => spendReport(st.tx, rules, month, month === now ? Number(t.slice(8, 10)) : 31), [st.tx, rules, month, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (spend: typeof s.spend) => void st.saveSettings({ ...s, spend }).catch((e) => toast('err', errText(e)));
  // 🏷️ A new category for a shop: saved on the server as that shop's rule (the row, the totals and the budgets all follow; 📜 Log notes it).
  const move = async (id: string, to: string) => {
    try { await api('spend-cat', { id, cat: to }); await st.reload(); toast('ok', `Moved to ${spendCat(to).label}: that shop goes there from now on.`); } catch (e) { toast('err', errText(e)); }
  };
  // ONE list: every purchase (bank alerts, CSV, bank link, receipts). The month's, or all months while searching.
  const all = useMemo(() => st.tx.filter((x) => Number(x.amount) < 0), [st.tx]);
  const base = useMemo(() => (q.trim() ? all : all.filter((x) => x.posted.slice(0, 7) === month)), [all, q, month]);
  const catOf = useMemo(() => new Map(base.map((x) => [x, categorize(x, rules)])), [base, rules]);
  const list = useMemo(() => base.filter((x) => (cat === 'all' || catOf.get(x) === cat) && (!q.trim() || matchSpend(x, q, spendCat(catOf.get(x)!).label))), [base, cat, q, catOf]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const x of base) { const k = catOf.get(x)!; c[k] = (c[k] ?? 0) + 1; } return c; }, [base, catOf]);
  const chips = [{ id: 'all', label: 'All', n: base.length }, ...SPEND_CATS.filter((c) => counts[c.id]).map((c) => ({ id: c.id, label: `${c.icon} ${c.label}`, n: counts[c.id] }))];
  const shown = list.slice(0, many);
  const urls = useThumbs(shown);
  const byId = (id: string | null | undefined) => st.tx.find((x) => x.id === id);
  const sel = byId(open?.id);
  const viewing = byId(view);
  const onView = (x: SpendTx) => () => { if (x.receipt_path?.startsWith('gmail:')) window.open(`https://mail.google.com/mail/u/0/#all/${x.receipt_path.slice(6)}`, '_blank'); else setView(x.id ?? null); };
  const gmail = !!st.status?.google.gmail;
  // "#/money/spending?tx=<id>" (from the 🔎 search or the 📜 Log) opens that purchase.
  useEffect(() => { const id = takeParam('tx', '#/money/spending'); if (id) setOpen({ id }); }, []);
  useEffect(() => { if (cat !== 'all' && !counts[cat]) setCat('all'); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stagger space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[28px] font-semibold leading-tight">Spending</h1>
        <Seg label="Month" options={[[now, 'This month'], [last, 'Last month']]} value={month} onChange={setMonth} />
      </div>
      <SpendingView r={r} budgets={s.spend.budgets} alertAt={s.spend.alertAt} monthName={monthName(month)} cat={cat} onCat={setCat}
        onBudget={(c, n) => { const budgets = { ...s.spend.budgets }; if (n) budgets[c] = n; else delete budgets[c]; save({ ...s.spend, budgets }); toast('ok', n ? 'Budget saved: you get a heads-up near it and when it’s used up.' : 'Budget removed.'); }} />
      <section className="space-y-2" aria-label="Purchases">
        <div className="space-y-1">
          <p className="label px-1">🧾 Add a receipt</p>
          <AddReceipt userId={st.session.user.id} onAdded={async () => { await st.reload(); }} />
        </div>
        <SearchBox q={q} onChange={setQ} placeholder="Shop, item, 23.45, March…" label="Search purchases and receipts" />
        <KindChips label="Category" options={chips} value={cat} onChange={setCat} />
        <p className="label px-1" aria-live="polite">{q.trim() ? `${list.length} found in all months` : `${list.length} purchase${list.length === 1 ? '' : 's'} · ${monthName(month)}`}{cat !== 'all' ? ` · ${spendCat(cat).label}` : ''}</p>
        {list.length ? (
          <div className="card !px-3 !py-1">
            {byDay(shown).map(([day, xs]) => (
              <div key={day}>
                <p className="label border-t border-slate-900/[0.06] pb-0.5 pt-2.5 first:border-0 dark:border-white/[0.06]">{dayName(day, t)}</p>
                <ul>{xs.map((x) => <SpendLine key={x.id ?? `${x.posted}${x.description}${x.amount}`} t={x} url={x.receipt_path ? urls[x.receipt_path] : undefined} rules={rules} onOpen={() => x.id && setOpen({ id: x.id })} onView={onView(x)} />)}</ul>
              </div>
            ))}
            {list.length > many && <button className="tap min-h-[44px] w-full rounded-xl text-center text-xs font-semibold text-teal-700 dark:text-teal-300" onClick={() => setMany(many + 100)}>Show more ({list.length - many})</button>}
          </div>
        ) : <p className="card text-sm text-slate-500 dark:text-slate-400">{q.trim() || cat !== 'all' ? 'Nothing found. Try a shop, something you bought, an amount like 23.45, or a month.' : 'No purchases this month yet. Receipts in your emails come here by themselves, or 📷 take a photo of one.'}</p>}
      </section>
      <p className="text-xs text-slate-500 dark:text-slate-400">{gmail ? `📧 Your Gmail is checked every hour for receipts and bank alerts (free checks first). Last checked: ${lastChecked(st.status?.mail?.mailChecked ?? st.status?.mail?.receiptsScanned)}.` : 'Connect Gmail (Settings → Google) and receipts in your emails come here by themselves.'} A receipt that matches a bank purchase is attached to it, so nothing is counted twice. 📜 Log shows what happened to each one.</p>
      {sel && <ReceiptSheet key={sel.id} t={sel} url={sel.receipt_path ? urls[sel.receipt_path] : undefined} rules={rules} userId={st.session.user.id} startDelete={open?.del} onMove={(c) => void move(sel.id!, c)} onClose={() => setOpen(null)} onChanged={st.reload} />}
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
