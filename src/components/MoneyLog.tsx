import { useEffect, useMemo, useState } from 'react';
import { api, supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { goTo } from '../lib/nav';
import { today } from '../../supabase/functions/_shared/money.ts';
import { KindChips, SearchBox } from './Contacts';
import { Empty, Skeleton, errText, toast } from './ui';

/**
 * 📜 Money → Log (owner's request, like the Trading app): short time-stamped lines on what happened to your money,
 * newest first. Written by the server only (table `money_log`, kept 180 days); read here with Row Level Security.
 */
export interface LogRow { id: string; at: string; kind: 'purchase' | 'receipt' | 'bill' | 'change'; ref: string | null; text: string; data: { tx?: string; item?: string } & Record<string, unknown> }
export const LOG_KINDS: { id: 'all' | LogRow['kind']; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'purchase', label: '💳 Purchases' }, { id: 'receipt', label: '🧾 Receipts' }, { id: 'bill', label: '📋 Bills' }, { id: 'change', label: '✎ Changes' },
];

const stamp = (at: string) => {
  const d = new Date(at);
  const day = d.toLocaleDateString('en-CA') === today() ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  return `${day} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** The lines themselves (also in the Guide with made-up lines and no working taps). */
export function LogLines({ rows, onOpen, example }: { rows: LogRow[]; onOpen?: (r: LogRow) => void; example?: boolean }) {
  return (
    <ol className="card !px-2 !py-1.5" aria-label="Money log, newest first">
      {rows.map((r) => (
        <li key={r.id} className="border-t border-slate-900/[0.06] first:border-0 dark:border-white/[0.06]">
          <button className="tap flex min-h-[44px] w-full items-baseline gap-2 rounded-xl px-1.5 py-1.5 text-left" tabIndex={example ? -1 : undefined} onClick={() => onOpen?.(r)}>
            <time dateTime={r.at} className="num w-[92px] shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{stamp(r.at)}</time>
            <span className="min-w-0 flex-1 break-words text-[13px] leading-snug text-slate-800 dark:text-slate-100">{r.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function MoneyLog() {
  const st = useStore();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('all');
  useEffect(() => {
    let live = true;
    void (async () => {
      // First open this month: "added" lines for the purchases already there (once, on the server, no AI).
      const month = today().slice(0, 7);
      let done = '';
      try { done = localStorage.getItem('lt.logBackfill') ?? ''; } catch { /* private mode */ }
      if (done !== month) {
        try { await api('money-log', { op: 'backfill', month }); localStorage.setItem('lt.logBackfill', month); } catch { /* shown without it */ }
      }
      const { data, error } = await supabase.from('money_log').select('id, at, kind, ref, text, data').order('at', { ascending: false }).limit(1000);
      if (!live) return;
      if (error) toast('err', errText(error.message));
      setRows((data as LogRow[] | null) ?? []);
    })();
    return () => { live = false; };
  }, []);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => (rows ?? []).filter((r) => (kind === 'all' || r.kind === kind) && words.every((w) => `${r.text} ${stamp(r.at)}`.toLowerCase().includes(w))), [rows, kind, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = (k: string) => (rows ?? []).filter((r) => k === 'all' || r.kind === k).length;
  // Tap a line: open the purchase or the bill, when it's still there.
  const open = (r: LogRow) => {
    const tx = r.data?.tx, item = r.data?.item;
    if (tx && st.tx.some((x) => x.id === tx)) goTo('money', 'spending', `?tx=${tx}`);
    else if (item && st.items.some((x) => x.id === item)) goTo('money', 'bills', `?item=${item}`);
    else toast('info', tx || item ? 'That one isn’t there any more (deleted, undone, or older than Spending shows).' : 'Nothing to open for this line.');
  };
  return (
    <div className="stagger space-y-3">
      <h1 className="text-[28px] font-semibold leading-tight">Log</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">What happened to your money, newest first: where each purchase came from, the category it counts in, receipts, changes and bills. Tap a line to open it. Kept 180 days.</p>
      <SearchBox q={q} onChange={setQ} placeholder="Shop, receipt, category, Oct 18…" label="Search the log" />
      <KindChips label="Show" options={LOG_KINDS.map((k) => ({ id: k.id, label: k.label, n: n(k.id) }))} value={kind} onChange={setKind} />
      {rows === null ? <Skeleton /> : shown.length ? <LogLines rows={shown.slice(0, 400)} onOpen={open} />
        : <Empty icon="📜">{rows.length ? 'Nothing matches.' : 'Nothing yet. New purchases, receipts, changes and bills are written here as they happen.'}</Empty>}
    </div>
  );
}
