import { useState, type ReactNode } from 'react';
import { SPEND_CATS, spendCat, type SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { money } from '../../supabase/functions/_shared/money.ts';
import type { MailPerson } from '../../supabase/functions/_shared/mailPeople.ts';
import { NO_FILTER, SOURCES, SOURCE_LABEL, catsText, changeOf, dayText, filterChips, rangeOf, type Period, type PeriodKind, type Report, type ReportFilter, type Source } from '../../supabase/functions/_shared/report.ts';
import type { SavedReport } from '../../supabase/functions/_shared/model.ts';
import { Money, Sheet, useStrip } from './ui';
import { PersonFilter, SWATCH } from './Person';
import { SpendLine } from './Receipts';
import { SearchBox } from './Contacts';

/**
 * 📊 Money → Reports, the pieces (the page is src/pages/Reports.tsx; the Guide shows them with made-up data):
 * the 💬 question box, the filter bar with ⭐ saved reports, and the report itself (total vs before, by category, over
 * time, top shops, who spent it, the purchases). Bars are one teal (amounts, not identities) with their values written
 * on them; people keep their own colours next to their names. Tapping a bar narrows the report to it.
 */

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
const BAR = 'bg-teal-600 dark:bg-teal-300';
const sameFilter = (a: ReportFilter, b: ReportFilter) => JSON.stringify(a) === JSON.stringify(b);
export const isDefault = (f: ReportFilter) => sameFilter({ ...NO_FILTER, ...f, vs: f.vs ?? null }, NO_FILTER);

// ---------- 💬 question box ----------
export interface ReportTurn { q: string; a: string; by?: string; at: string }
export const REPORT_EXAMPLES = ['How much on food this month?', 'Top shops last month', 'Compare groceries this month vs last', 'Average on eating out, last 6 months'];

export function ReportAsk({ onAsk, busy, example }: { onAsk?: (q: string) => void; busy?: boolean; example?: boolean }) {
  const [q, setQ] = useState('');
  const send = () => { if (q.trim().length >= 2) { onAsk?.(q.trim()); setQ(''); } };
  return (
    <div className="glass flex min-h-[56px] items-center gap-2 rounded-[22px] pl-3.5 pr-1.5 transition-shadow focus-within:shadow-[0_0_0_4px_rgba(94,234,212,0.18),0_0_30px_-8px_#5eead4]">
      <span aria-hidden="true" className="text-lg">💬</span>
      <label className="sr-only" htmlFor="report-ask">Ask about your spending</label>
      <input id="report-ask" className="min-w-0 flex-1 bg-transparent py-3 text-[15px] font-medium outline-none placeholder:text-slate-400" placeholder="Ask about your spending…" value={q} tabIndex={example ? -1 : undefined}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={busy} maxLength={300} enterKeyHint="search" />
      <button className="btn-primary h-11 w-11 shrink-0 !rounded-2xl !p-0 disabled:opacity-40" tabIndex={example ? -1 : undefined} onClick={send} disabled={busy || q.trim().length < 2} aria-label="Ask">
        {busy ? <span className="spinner" /> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
      </button>
    </div>
  );
}

/** The latest question, its one-line answer and "Understood as" chips (tap one to change it, ✕ to drop it). */
export function ReportAnswer({ turn, answer, chips, onChip, onDrop, busy }: {
  turn: ReportTurn | null; answer: string; chips: { key: string; text: string }[]; onChip?: (key: string) => void; onDrop?: (key: string) => void; busy?: boolean;
}) {
  if (!turn && !busy) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {turn && <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-teal-300 to-violet-400 px-3.5 py-2 text-sm font-semibold text-[#04121a]">{turn.q}</p>}
      {busy ? <p className="text-sm text-slate-500 dark:text-slate-400"><span className="spinner" /> Working out what you mean…</p> : turn && (
        <div className="rise max-w-[94%] rounded-2xl rounded-bl-md border border-slate-900/[0.07] bg-white/80 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.05]">
          <p className="font-semibold leading-snug">{answer}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="label">Understood as</span>
            {chips.map((c) => (
              <span key={c.key} className="inline-flex items-center rounded-full border border-teal-500/30 bg-teal-500/10 text-xs font-semibold text-teal-900 dark:border-teal-300/25 dark:bg-teal-300/10 dark:text-teal-100">
                <button className="tap min-h-[32px] rounded-full pl-2.5 pr-1" onClick={() => onChip?.(c.key)} aria-label={`Change ${c.text}`}>{c.text}</button>
                {c.key !== 'period' && <button className="tap flex h-8 w-7 items-center justify-center rounded-full text-teal-700/70 dark:text-teal-200/70" onClick={() => onDrop?.(c.key)} aria-label={`Remove ${c.text}`}>✕</button>}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{turn.by ? `Question read by ${turn.by} (names only, never your amounts) · the numbers are worked out on your phone` : 'Read on your phone · free, no AI'}</p>
        </div>
      )}
    </div>
  );
}

// ---------- filter bar ----------
export type FilterKey = 'period' | 'cats' | 'shop' | 'sources' | 'min' | 'vs' | 'person';
const PERIOD_OPTS: [PeriodKind, string][] = [['this-month', 'This month'], ['last-month', 'Last month'], ['last-3', 'Last 3 months'], ['last-6', 'Last 6 months'], ['last-12', 'Last 12 months'], ['this-year', 'This year'], ['this-week', 'This week'], ['last-week', 'Last week'], ['last-year', 'Last year']];

function BarChip({ on, onClick, children, label }: { on: boolean; onClick?: () => void; children: ReactNode; label: string }) {
  return (
    <button type="button" className={`chip tap gap-1 px-3 py-1.5 ${on ? 'border-teal-500/40 bg-teal-500/10 text-teal-900 dark:border-teal-300/30 dark:bg-teal-300/10 dark:text-teal-100' : 'border-slate-900/10 text-slate-600 dark:border-white/10 dark:text-slate-300'}`} onClick={onClick} aria-label={label} aria-haspopup="dialog">
      {children}<span aria-hidden="true" className="text-[10px] opacity-60">▾</span>
    </button>
  );
}

export function FilterBar({ f, t, onOpen, onChange, onReset, saved, onSaved, onSave, example }: {
  f: ReportFilter; t: string; onOpen?: (k: FilterKey) => void; onChange?: (f: ReportFilter) => void; onReset?: () => void;
  saved: SavedReport[]; onSaved?: (s: SavedReport) => void; onSave?: () => void; example?: boolean;
}) {
  const ref = useStrip<HTMLDivElement>(JSON.stringify(f));
  const range = rangeOf(f.period, t);
  const cur = saved.find((s) => sameFilter({ ...s.filter, vs: s.filter.vs ?? null }, { ...f, vs: f.vs ?? null }));
  return (
    <section className="space-y-1.5" aria-label="Report filters">
      <div ref={ref} className="strip -mx-4 gap-1.5 px-4 py-0.5">
        <BarChip on label={`Period: ${range.label}`} onClick={() => onOpen?.('period')}>📅 {range.label}</BarChip>
        <BarChip on={!!f.cats.length} label="Category" onClick={() => onOpen?.('cats')}>🏷️ {f.cats.length ? (catsText(f.cats) === 'Food' ? 'Food' : f.cats.length === 1 ? spendCat(f.cats[0]).label : `${f.cats.length} categories`) : 'All categories'}</BarChip>
        <BarChip on={!!f.shop} label="Shop or item" onClick={() => onOpen?.('shop')}>🔎 {f.shop || 'Shop'}</BarChip>
        <BarChip on={!!f.sources.length} label="Source" onClick={() => onOpen?.('sources')}>{f.sources.length ? f.sources.map((s) => SOURCE_LABEL[s].split(' ')[0]).join('') : '📥'} {f.sources.length === 1 ? SOURCE_LABEL[f.sources[0]].split(' ').slice(1).join(' ') : f.sources.length ? 'Sources' : 'All sources'}</BarChip>
        <BarChip on={f.min != null} label="Smallest amount" onClick={() => onOpen?.('min')}>{f.min != null ? `≥ ${money(f.min)}` : '≥ Any amount'}</BarChip>
        {!isDefault(f) && <button type="button" className="chip tap border-slate-900/10 px-3 py-1.5 text-slate-600 dark:border-white/10 dark:text-slate-300" onClick={onReset} tabIndex={example ? -1 : undefined}>↺ Reset</button>}
      </div>
      <PersonFilter value={f.person} onChange={(person) => onChange?.({ ...f, person })} />
      <div className="strip -mx-4 gap-1.5 px-4 py-0.5" role="group" aria-label="Saved reports">
        {saved.map((s) => (
          <button key={s.id} type="button" aria-pressed={cur?.id === s.id} onClick={() => onSaved?.(s)}
            className={`chip tap px-3 py-1.5 ${cur?.id === s.id ? 'border-violet-500/40 bg-violet-500/10 text-violet-900 dark:border-violet-300/30 dark:bg-violet-300/10 dark:text-violet-100' : 'border-slate-900/10 text-slate-600 dark:border-white/10 dark:text-slate-300'}`}>⭐ {s.name}</button>
        ))}
        {!cur && <button type="button" className="chip tap border-dashed border-violet-500/40 px-3 py-1.5 font-semibold text-violet-800 dark:border-violet-300/30 dark:text-violet-200" onClick={onSave}>⭐ Save this report</button>}
      </div>
    </section>
  );
}

/** One sheet per filter (from the bar, or from an "Understood as" chip). */
export function FilterSheet({ k, f, t, shops, cats, onChange, onClose }: {
  k: FilterKey; f: ReportFilter; t: string; shops: string[]; cats: { id: string; n: number }[]; onChange: (f: ReportFilter) => void; onClose: () => void;
}) {
  const [from, setFrom] = useState(f.period.kind === 'custom' ? rangeOf(f.period, t).from : rangeOf({ kind: 'this-month' }, t).from);
  const [to, setTo] = useState(f.period.kind === 'custom' ? rangeOf(f.period, t).to : t);
  const [shop, setShop] = useState(f.shop);
  const [min, setMin] = useState(f.min != null ? String(f.min) : '');
  const set = (p: Partial<ReportFilter>, close = true) => { onChange({ ...f, ...p }); if (close) onClose(); };
  const pick = (p: Period) => set({ period: p, vs: null });
  const opt = (on: boolean) => `chip tap px-3.5 py-2 ${on ? 'border-teal-500/40 bg-teal-500/10 text-teal-900 dark:border-teal-300/30 dark:bg-teal-300/10 dark:text-teal-100' : 'border-slate-900/10 text-slate-700 dark:border-white/10 dark:text-slate-200'}`;
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - i, 1)); return d.toISOString().slice(0, 7); });
  if (k === 'period' || k === 'vs') return (
    <Sheet title={k === 'vs' ? 'Compare with' : '📅 Period'} onClose={onClose}>
      <div className="space-y-4">
        {k === 'vs' && <button className="btn w-full" onClick={() => set({ vs: null })}>The same stretch just before (usual)</button>}
        {k === 'period' && <div className="flex flex-wrap gap-1.5">{PERIOD_OPTS.map(([v, l]) => <button key={v} className={opt(f.period.kind === v)} aria-pressed={f.period.kind === v} onClick={() => pick({ kind: v })}>{l}</button>)}</div>}
        <div className="space-y-1.5">
          <p className="label px-1">A month</p>
          <div className="flex flex-wrap gap-1.5">{months.map((m) => { const on = (k === 'vs' ? f.vs : f.period)?.kind === 'month' && (k === 'vs' ? f.vs : f.period)?.month === m; return <button key={m} className={opt(on)} aria-pressed={on} onClick={() => (k === 'vs' ? set({ vs: { kind: 'month', month: m } }) : pick({ kind: 'month', month: m }))}>{rangeOf({ kind: 'month', month: m }, t).label}</button>; })}</div>
        </div>
        <div className="space-y-1.5">
          <p className="label px-1">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-slate-500 dark:text-slate-400">From<input className="input w-full" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="space-y-1 text-xs text-slate-500 dark:text-slate-400">To<input className="input w-full" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <button className="btn-primary w-full" disabled={!from || !to} onClick={() => (k === 'vs' ? set({ vs: { kind: 'custom', from, to } }) : pick({ kind: 'custom', from, to }))}>Show {dayText(from || t, t)} – {dayText(to || t, t)}</button>
        </div>
      </div>
    </Sheet>
  );
  if (k === 'cats') {
    const has = new Set(f.cats);
    const toggle = (id: string) => set({ cats: has.has(id) ? f.cats.filter((c) => c !== id) : [...f.cats, id] }, false);
    const n = Object.fromEntries(cats.map((c) => [c.id, c.n]));
    return (
      <Sheet title="🏷️ Categories" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pick one or more. None picked = everything (transfers are left out unless you pick them).</p>
          <div className="flex flex-wrap gap-1.5">
            <button className={opt(!f.cats.length)} aria-pressed={!f.cats.length} onClick={() => set({ cats: [] }, false)}>All</button>
            <button className={opt(catsText(f.cats) === 'Food')} aria-pressed={catsText(f.cats) === 'Food'} onClick={() => set({ cats: ['groceries', 'dining'] }, false)}>🍽️ Food (groceries + eating out)</button>
            {SPEND_CATS.map((c) => <button key={c.id} className={opt(has.has(c.id))} aria-pressed={has.has(c.id)} onClick={() => toggle(c.id)}><span aria-hidden="true">{c.icon}</span> {c.label}{n[c.id] ? <span className="num text-[11px] opacity-60">{n[c.id]}</span> : null}</button>)}
          </div>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </Sheet>
    );
  }
  if (k === 'shop') {
    const s = shop.trim().toLowerCase();
    const list = shops.filter((x) => !s || x.toLowerCase().includes(s)).slice(0, 12);
    return (
      <Sheet title="🔎 Shop or item" onClose={onClose}>
        <div className="space-y-3">
          <SearchBox q={shop} onChange={setShop} placeholder="Amazon, Kroger, latte…" label="Shop or item" />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => set({ shop: shop.trim().toLowerCase().slice(0, 60) })}>{shop.trim() ? `Show “${shop.trim()}”` : 'Any shop'}</button>
            {f.shop && <button className="btn" onClick={() => set({ shop: '' })}>Clear</button>}
          </div>
          {list.length > 0 && <div className="space-y-1"><p className="label px-1">Your shops</p><div className="flex flex-wrap gap-1.5">{list.map((x) => <button key={x} className={opt(false)} onClick={() => set({ shop: x.toLowerCase() })}>{x}</button>)}</div></div>}
          <p className="text-xs text-slate-500 dark:text-slate-400">Matches words in the shop’s name, or anything on its receipt (e.g. “latte”).</p>
        </div>
      </Sheet>
    );
  }
  if (k === 'sources') {
    const toggle = (s: Source) => set({ sources: f.sources.includes(s) ? f.sources.filter((x) => x !== s) : [...f.sources, s] }, false);
    return (
      <Sheet title="📥 Where it came from" onClose={onClose}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button className={opt(!f.sources.length)} aria-pressed={!f.sources.length} onClick={() => set({ sources: [] }, false)}>All</button>
            {SOURCES.map((s) => <button key={s} className={opt(f.sources.includes(s))} aria-pressed={f.sources.includes(s)} onClick={() => toggle(s)}>{SOURCE_LABEL[s]}</button>)}
          </div>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Smallest amount" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">Only purchases of at least this much.</p>
        <div className="flex flex-wrap gap-1.5">{[10, 25, 50, 100, 250].map((n) => <button key={n} className={opt(f.min === n)} aria-pressed={f.min === n} onClick={() => set({ min: n })}>≥ {money(n)}</button>)}</div>
        <div className="flex items-center gap-2"><span className="text-slate-500">$</span><input className="input min-w-0 flex-1" type="number" inputMode="decimal" min={0} placeholder="Any amount" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Smallest amount" /></div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={() => set({ min: Number(min) > 0 ? Math.round(Number(min) * 100) / 100 : null })}>Show</button>
          {f.min != null && <button className="btn" onClick={() => set({ min: null })}>Any amount</button>}
        </div>
      </div>
    </Sheet>
  );
}

// ---------- the report ----------
export function ReportView({ r, f, rules, people, t, onPick, onOpen, urls, loading, example, many = 40, onMore }: {
  r: Report; f: ReportFilter; rules: Record<string, string>; people: MailPerson[]; t: string;
  onPick?: (p: Partial<ReportFilter>) => void; onOpen?: (x: SpendTx) => void; urls?: Record<string, string>; loading?: boolean; example?: boolean; many?: number; onMore?: () => void;
}) {
  const ch = changeOf(r);
  const months = r.buckets.length > 1 && r.step === 'month';
  if (!r.count && !loading) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
        <span className="orb" aria-hidden="true">📊</span>
        <p className="max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">Nothing matches {r.range.label.toLowerCase()}{f.cats.length ? ` in ${catsText(f.cats)}` : ''}{f.shop ? ` at “${f.shop}”` : ''}. Try a longer period, or ↺ Reset.</p>
        {r.prevTotal > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{r.prev.label.charAt(0).toUpperCase() + r.prev.label.slice(1)}: {money(r.prevTotal)}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <section className="card">
        <p className="label">{r.range.label}{r.range.label !== r.range.short ? ` · ${r.range.short}` : ''}{f.cats.length ? ` · ${catsText(f.cats)}` : ''}{f.person !== 'all' ? ` · ${people.find((p) => p.email === f.person)?.name ?? ''}` : ''}</p>
        {loading ? <div className="skel mt-2 h-9 w-40" /> : <Money n={r.total} className="block text-[36px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white" />}
        {ch ? (
          <p className="mt-0.5 text-sm font-semibold">
            <span className={ch.dir === 'up' ? 'text-rose-700 dark:text-rose-300' : ch.dir === 'down' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}><span aria-hidden="true">{ch.dir === 'up' ? '▲ ' : ch.dir === 'down' ? '▼ ' : '＝ '}</span>{ch.text}</span>
            <span className="font-normal text-slate-500 dark:text-slate-400"> ({money(r.prevTotal)}, {r.prev.short})</span>
          </p>
        ) : <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Nothing {r.prev.label} to compare with.</p>}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.count} purchase{r.count === 1 ? '' : 's'} · {money(r.perPurchase)} each on average{r.buckets.length > 1 && r.step === 'month' ? ` · ${money(r.perMonth)} a month` : ''}{!f.cats.includes('transfers') ? ' · transfers not counted' : ''}</p>
      </section>

      {r.people.length > 1 && <PersonSplit r={r} onPick={example ? undefined : (person) => onPick?.({ person })} />}

      <div className="grid gap-3 lg:grid-cols-2">
        <HBars title="By category" rows={r.byCat.map((c) => ({ id: c.id, label: <><span aria-hidden="true">{spendCat(c.id).icon}</span> {spendCat(c.id).label}</>, name: spendCat(c.id).label, amount: c.amount, sub: `${c.count}` }))} total={r.total}
          on={f.cats.length === 1 ? f.cats[0] : null} onPick={example ? undefined : (id) => onPick?.({ cats: f.cats.length === 1 && f.cats[0] === id ? [] : [id] })} hint="Tap one to see only it" />
        <HBars title="Top shops" rows={r.shops.map((s) => ({ id: s.key, label: s.name, name: s.name, amount: s.amount, sub: `${s.count}` }))} total={r.total}
          on={f.shop || null} onPick={example ? undefined : (id) => { const s = r.shops.find((x) => x.key === id); onPick?.({ shop: f.shop === id ? '' : (s?.key ?? id) }); }} hint="Tap one to see only it" />
      </div>

      {r.buckets.length > 1 && <TimeBars r={r} months={months} t={t} />}

      <section className="card !px-3 !py-1" aria-label="Purchases in this report">
        <p className="label px-1 pb-0.5 pt-2.5">{r.count} purchase{r.count === 1 ? '' : 's'}</p>
        {groupByDay(r.list.slice(0, many)).map(([day, xs]) => (
          <div key={day}>
            <p className="label border-t border-slate-900/[0.06] pb-0.5 pt-2.5 dark:border-white/[0.06]">{dayText(day, t)}</p>
            <ul>{xs.map((x) => <SpendLine key={x.id ?? `${x.posted}${x.description}${x.amount}`} t={x} rules={rules} url={x.receipt_path ? urls?.[x.receipt_path] : undefined} example={example} onOpen={() => onOpen?.(x)} />)}</ul>
          </div>
        ))}
        {r.list.length > many && onMore && <button className="tap min-h-[44px] w-full rounded-xl text-center text-xs font-semibold text-teal-700 dark:text-teal-300" onClick={onMore}>Show more ({r.list.length - many})</button>}
      </section>
    </div>
  );
}
function groupByDay(list: SpendTx[]): [string, SpendTx[]][] {
  const m = new Map<string, SpendTx[]>();
  for (const x of list) m.set(x.posted, [...(m.get(x.posted) ?? []), x]);
  return [...m.entries()];
}

/** Horizontal bars, biggest first: label, amount and share written on each (a table you can read without the bars). */
function HBars({ title, rows, total, on, onPick, hint }: { title: string; rows: { id: string; label: ReactNode; name: string; amount: number; sub: string }[]; total: number; on: string | null; onPick?: (id: string) => void; hint?: string }) {
  const max = Math.max(1, ...rows.map((x) => x.amount));
  if (!rows.length) return null;
  return (
    <section className="card !py-2.5">
      <div className="flex items-baseline justify-between gap-2"><p className="label">{title}</p>{hint && onPick && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}</div>
      <ul className="mt-1">
        {rows.map((x) => {
          const sel = on === x.id;
          return (
            <li key={x.id}>
              <button className={`tap -mx-2 block min-h-[44px] w-[calc(100%+1rem)] rounded-xl px-2 py-1 text-left ${sel ? 'bg-teal-500/10 ring-1 ring-teal-500/40 dark:bg-teal-300/10 dark:ring-teal-300/30' : ''}`} onClick={() => onPick?.(x.id)} disabled={!onPick} aria-pressed={sel}
                aria-label={`${x.name}: ${money(x.amount)}, ${pct(x.amount, total)}% of the total, ${x.sub} purchases`}>
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{x.label}</span>
                  <span className="shrink-0"><span className="num font-semibold text-slate-800 dark:text-slate-100">{money(x.amount)}</span> <span className="num text-xs text-slate-500 dark:text-slate-400">{pct(x.amount, total)}%</span></span>
                </span>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/[0.08]">
                  <span className={`bar-grow block h-full rounded-full ${BAR}`} style={{ width: `${Math.max(1.5, (x.amount / max) * 100)}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Over time: one column per day / week / month (tap or hover one for its amount; the biggest is labelled). */
function TimeBars({ r, months, t }: { r: Report; months: boolean; t: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...r.buckets.map((b) => b.amount));
  const top = r.buckets.reduce((a, b, i) => (b.amount > r.buckets[a].amount ? i : a), 0);
  const n = r.buckets.length;
  const every = Math.ceil(n / 7);
  const show = sel ?? top;
  const b = r.buckets[show];
  const word = r.step === 'day' ? dayText(b.key, t) : r.step === 'week' ? `Week of ${dayText(b.key, t)}` : rangeOf({ kind: 'month', month: b.key }, t).label;
  return (
    <section className="card !pb-3 !pt-2.5" aria-label={`Spending by ${r.step}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">By {r.step}</p>
        <p className="text-xs" aria-live="polite"><span className="text-slate-500 dark:text-slate-400">{sel == null ? 'Biggest: ' : ''}{word} </span><span className="num font-semibold">{money(b.amount)}</span></p>
      </div>
      <div className="mt-3 flex h-[132px] items-end gap-[2px] border-b border-slate-900/10 dark:border-white/10" role="list" onMouseLeave={() => setSel(null)}>
        {r.buckets.map((x, i) => (
          <button key={x.key} role="listitem" type="button" className="group relative flex h-full min-w-0 flex-1 items-end" onClick={() => setSel(sel === i ? null : i)} onMouseEnter={() => setSel(i)}
            aria-label={`${r.step === 'week' ? 'Week of ' : ''}${r.step === 'month' ? rangeOf({ kind: 'month', month: x.key }, t).label : dayText(x.key, t)}: ${money(x.amount)}`}>
            <span className={`col-grow block w-full rounded-t-[4px] ${BAR} ${i === show ? '' : 'opacity-55 group-hover:opacity-80'}`} style={{ height: `${x.amount > 0 ? Math.max(2, (x.amount / max) * 100) : 0}%`, animationDelay: `${Math.min(i, 30) * 12}ms` }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]" aria-hidden="true">
        {r.buckets.map((x, i) => <span key={x.key} className="num min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-slate-500 dark:text-slate-400">{(i % every === 0 || months) && (n <= 12 || i % every === 0) ? x.label : ''}</span>)}
      </div>
    </section>
  );
}

/** 👥 Who spent it: one bar split by person (their colour + name + amount), tap a name to see only theirs. */
function PersonSplit({ r, onPick }: { r: Report; onPick?: (email: string) => void }) {
  const total = r.people.reduce((a, p) => a + p.amount, 0) || 1;
  return (
    <section className="card !py-2.5" aria-label="Who spent it">
      <p className="label">Who spent it</p>
      <div className="mt-2 flex h-3 gap-[2px] overflow-hidden rounded-full">
        {r.people.filter((p) => p.amount > 0).map((p) => <span key={p.id} className={`bar-grow block h-full first:rounded-l-full last:rounded-r-full ${p.color ? SWATCH[p.color] : 'bg-slate-400 dark:bg-slate-500'}`} style={{ width: `${(p.amount / total) * 100}%` }} />)}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5">
        {r.people.map((p) => (
          <li key={p.id}>
            <button type="button" className="tap flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm" disabled={!onPick || p.id === 'none'} onClick={() => onPick?.(p.id)} aria-label={`${p.name}: ${money(p.amount)}, ${pct(p.amount, total)}%${p.id !== 'none' ? ': see only theirs' : ''}`}>
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${p.color ? SWATCH[p.color] : 'bg-slate-400 dark:bg-slate-500'}`} />
              <span className="font-semibold">{p.name}</span><span className="num">{money(p.amount)}</span><span className="num text-xs text-slate-500 dark:text-slate-400">{pct(p.amount, total)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** ⭐ Save this report: a name, then it's a chip on every device. */
export function SaveSheet({ f, people, t, saved, onSave, onDelete, onClose }: { f: ReportFilter; people: MailPerson[]; t: string; saved: SavedReport[]; onSave: (name: string) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const guess = filterChips(f, people, t).map((c) => c.text.replace(/^\S+\s/, '')).join(' · ').slice(0, 40);
  const [name, setName] = useState(guess);
  return (
    <Sheet title="⭐ Save this report" onClose={onClose}>
      <div className="space-y-3">
        <input className="input w-full" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name" placeholder="e.g. Roza’s groceries" />
        <button className="btn-primary w-full" disabled={!name.trim() || saved.length >= 20} onClick={() => onSave(name.trim())}>Save</button>
        <p className="text-xs text-slate-500 dark:text-slate-400">Saved reports keep their filters (a period like “This month” always means the current one) and are the same on all your devices.</p>
        {saved.length > 0 && (
          <div className="space-y-1">
            <p className="label px-1">Saved</p>
            {saved.map((s) => (
              <div key={s.id} className="field flex items-center justify-between gap-2 py-1 text-sm">
                <span className="min-w-0 truncate font-semibold">⭐ {s.name}</span>
                <button className="btn-ghost text-xs text-red-700 dark:text-red-300" onClick={() => onDelete(s.id)} aria-label={`Remove ${s.name}`}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Earlier questions on this phone (the last 10): tap to ask again. */
export function ReportHistory({ turns, onAsk, onClear }: { turns: ReportTurn[]; onAsk: (q: string) => void; onClear?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!turns.length) return null;
  return (
    <div>
      <button className="tap min-h-[44px] rounded-xl px-1 text-xs font-semibold text-slate-600 dark:text-slate-300" aria-expanded={open} onClick={() => setOpen(!open)}>🕘 Earlier questions ({turns.length}) {open ? '▴' : '▾'}</button>
      {open && (
        <ul className="rise space-y-1">
          {turns.map((x, i) => (
            <li key={i}><button className="tap w-full rounded-xl border border-slate-900/[0.06] px-3 py-2 text-left text-sm dark:border-white/[0.08]" onClick={() => onAsk(x.q)}><span className="block font-semibold">{x.q}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{x.a}</span></button></li>
          ))}
          {onClear && <li><button className="btn-ghost text-xs" onClick={onClear}>Clear</button></li>}
        </ul>
      )}
    </div>
  );
}
