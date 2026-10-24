import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadOlderTx, useStore } from '../lib/store';
import { api } from '../lib/supabase';
import { errText, toast } from '../components/ui';
import { takeParam } from '../lib/nav';
import { usePeople } from '../components/Person';
import { ReceiptSheet, useThumbs } from '../components/Receipts';
import { FilterBar, FilterSheet, REPORT_EXAMPLES, ReportAnswer, ReportAsk, ReportHistory, ReportView, SaveSheet, type FilterKey, type ReportTurn } from '../components/Reports';
import { NO_FILTER, PERIODS, SOURCES, addDays, answerOf, buildReport, filterChips, parseQuestion, prevRangeOf, rangeOf, shopName, type AiFilter, type Focus, type Period, type ReportFilter } from '../../supabase/functions/_shared/report.ts';
import { categorize, spendCat, type SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { today } from '../../supabase/functions/_shared/money.ts';

/**
 * 📊 Reports (its own tab, #/reports; "#/reports?saved=<id>" opens a ⭐ saved one): everything worked out on this phone from the purchases already loaded (older months are read
 * when a longer period is picked, with your sign-in). The filter and the questions are remembered on this device;
 * ⭐ saved reports in Settings (all devices). Only a question the free reader can't understand goes to the AI, which
 * gets names only and sends back a filter.
 */
const KF = 'lt.report.filter', KC = 'lt.report.chat';
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const tidy = (f: Partial<ReportFilter> | null | undefined): ReportFilter => ({
  ...NO_FILTER, ...f,
  period: f?.period && PERIODS.includes(f.period.kind) ? f.period : NO_FILTER.period,
  vs: f?.vs && PERIODS.includes(f.vs.kind) ? f.vs : null,
  cats: Array.isArray(f?.cats) ? f.cats : [], sources: Array.isArray(f?.sources) ? f.sources.filter((s) => SOURCES.includes(s)) : [],
  shop: typeof f?.shop === 'string' ? f.shop : '', person: typeof f?.person === 'string' ? f.person : 'all', min: typeof f?.min === 'number' ? f.min : null,
});
const STORE_DAYS = 199; // the store keeps ~200 days of purchases

/** The AI's filter (names) → the report's filter (addresses). */
function fromAi(a: AiFilter, people: { email: string; name: string }[]): { f: ReportFilter; focus: Focus } {
  const per = (p: AiFilter['period'] | null): Period | null => (p ? { kind: p.kind, ...(p.month ? { month: p.month } : {}), ...(p.from ? { from: p.from } : {}), ...(p.to ? { to: p.to } : {}) } : null);
  return {
    f: tidy({ period: per(a.period)!, vs: per(a.vs), cats: a.cats, person: people.find((p) => p.name.toLowerCase() === a.person.toLowerCase())?.email ?? 'all', shop: a.shop, sources: a.sources, min: a.min }),
    focus: a.focus,
  };
}

export function Reports() {
  const st = useStore();
  const s = st.settings;
  const rules = s.spend.rules;
  const people = usePeople();
  const t = today();
  const [f, setF] = useState<ReportFilter>(() => tidy(read<Partial<ReportFilter> | null>(KF, null)));
  const [focus, setFocus] = useState<Focus>('total');
  const [turns, setTurns] = useState<ReportTurn[]>(() => read<ReportTurn[]>(KC, []).slice(0, 10));
  const [latest, setLatest] = useState<ReportTurn | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<FilterKey | 'save' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [many, setMany] = useState(5); // the purchases: top 5, then "Show all"
  // 📅 older months than the store keeps: read once per stretch, with your sign-in (Row Level Security)
  const [older, setOlder] = useState<{ from: string; rows: SpendTx[] }>({ from: addDays(t, -STORE_DAYS), rows: [] });
  const [loading, setLoading] = useState(false);
  const need = useMemo(() => { const a = rangeOf(f.period, t).from, b = prevRangeOf(f.period, t, f.vs).from; return a < b ? a : b; }, [f.period, f.vs, t]);
  useEffect(() => {
    if (need >= older.from) return;
    let on = true;
    setLoading(true);
    loadOlderTx(need, addDays(older.from, -1))
      .then((rows) => { if (on) setOlder((o) => ({ from: need, rows: [...o.rows, ...rows] })); })
      .catch((e) => toast('err', `Couldn’t load older months: ${errText(e)}`))
      .finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [need]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...st.tx, ...older.rows].filter((x) => Number(x.amount) < 0 && (!x.id || (!seen.has(x.id) && !!seen.add(x.id))));
  }, [st.tx, older.rows]);

  useEffect(() => write(KF, f), [f]);
  useEffect(() => setMany(5), [f]);
  // "#/reports?saved=<id>" (☰ Menu) opens that ⭐ saved report.
  useEffect(() => {
    const id = takeParam('saved', '#/reports');
    const x = id ? s.reports.saved.find((r) => r.id === id) : null;
    if (x) { setF(tidy(x.filter)); setFocus('total'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => buildReport(all, f, { rules, people, today: t }), [all, f, rules, people, t]);
  const answer = useMemo(() => answerOf(r, f, focus, people), [r, f, focus, people]);
  // the latest answer follows the chips you change; the history keeps the newest wording
  useEffect(() => {
    if (!latest || loading || busy) return;
    setTurns((cur) => { const next = [{ ...latest, a: answer }, ...cur.filter((x) => x.q !== latest.q)].slice(0, 10); write(KC, next); return next; });
  }, [answer, latest, loading, busy]);

  // what the question reader can match: your shops (most used first) and things on your receipts
  const shops = useMemo(() => {
    const n = new Map<string, number>();
    for (const x of all) { const k = shopName(x); n.set(k, (n.get(k) ?? 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [all]);
  const items = useMemo(() => [...new Set(all.flatMap((x) => (x.details?.items ?? []).map((i) => i.name)))].slice(0, 2000), [all]);
  const catCounts = useMemo(() => {
    const range = rangeOf(f.period, t), c: Record<string, number> = {};
    for (const x of all) if (x.posted >= range.from && x.posted <= range.to) { const k = categorize(x, rules); c[k] = (c[k] ?? 0) + 1; }
    return Object.entries(c).map(([id, n]) => ({ id, n }));
  }, [all, f.period, rules, t]);

  const ask = useCallback(async (q: string) => {
    const p = parseQuestion(q, { people, shops, items, today: t });
    if (p.understood) {
      setF(p.filter); setFocus(p.focus); setLatest({ q, a: '', at: new Date().toISOString() });
      return;
    }
    // 🤖 only now: the free AI first (Claude last), names only, kept per question
    setBusy(true); setLatest({ q, a: '', at: new Date().toISOString() });
    try {
      const a = await api<{ filter: AiFilter; by: string; cached: boolean }>('report-filter', { question: q, people: people.map((x) => x.name), shops: shops.slice(0, 100).map((x) => x.slice(0, 60)) });
      if (!a.filter.understood) { toast('info', 'That doesn’t look like a spending question. Try “how much on groceries last month”.'); setLatest(null); return; }
      const g = fromAi(a.filter, people);
      setF(g.f); setFocus(g.focus); setLatest({ q, a: '', by: a.cached ? `${a.by} (remembered, free)` : a.by, at: new Date().toISOString() });
    } catch (e) {
      toast('err', `Couldn’t read that question: ${errText(e)}. Try simpler words, like “groceries last month”.`);
      setLatest(null);
    } finally { setBusy(false); }
  }, [people, shops, items, t]);

  const change = (next: ReportFilter) => setF(next);
  const drop = (k: string) => setF((cur) => ({ ...cur, ...(k === 'vs' ? { vs: null } : k === 'cats' ? { cats: [] } : k === 'person' ? { person: 'all' } : k === 'shop' ? { shop: '' } : k === 'sources' ? { sources: [] } : k === 'min' ? { min: null } : {}) }));
  const saveReports = (saved: typeof s.reports.saved) => void st.saveSettings({ ...s, reports: { saved } }).catch((e) => toast('err', errText(e)));
  const shown = r.list.slice(0, many);
  const urls = useThumbs(shown);
  const sel = all.find((x) => x.id === open);
  const move = async (id: string, to: string) => {
    try { await api('spend-cat', { id, cat: to }); await st.reload(); toast('ok', `Moved to ${spendCat(to).label}: that shop goes there from now on.`); } catch (e) { toast('err', errText(e)); }
  };

  return (
    <div className="stagger mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight">Reports</h1>
        <p className="text-[15px] text-slate-600 dark:text-slate-300">Your spending, your way: ask, or change the filters.</p>
      </div>
      <section className="card space-y-3" aria-label="Ask about your spending">
        <ReportAsk onAsk={(q) => void ask(q)} busy={busy} />
        {!latest && !busy && <div className="strip -mx-4 gap-1.5 px-4">{REPORT_EXAMPLES.map((x) => <button key={x} className="chip tap border-teal-500/30 px-3 py-1.5 text-teal-800 dark:border-teal-300/30 dark:text-teal-200" onClick={() => void ask(x)}>{x}</button>)}</div>}
        <ReportAnswer turn={latest} answer={answer} busy={busy} chips={filterChips(f, people, t)} onChip={(k) => setSheet(k as FilterKey)} onDrop={drop} />
        <ReportHistory turns={turns.filter((x) => x.q !== latest?.q)} onAsk={(q) => void ask(q)} onClear={() => { setTurns([]); write(KC, []); }} />
      </section>
      <FilterBar f={f} t={t} people={people} onOpen={setSheet} onChange={change} onReset={() => { setF(NO_FILTER); setFocus('total'); }} saved={s.reports.saved}
        onSaved={(x) => { setF(tidy(x.filter)); setFocus('total'); }} onSave={() => setSheet('save')} />
      <ReportView r={r} f={f} rules={rules} people={people} t={t} loading={loading} urls={urls} many={many} onMore={() => setMany(many <= 5 ? 100 : many + 100)}
        onPick={(p) => setF((cur) => ({ ...cur, ...p }))} onOpen={(x) => x.id && setOpen(x.id)} />
      <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">Worked out on your phone from your purchases (no AI). The same purchases, categories and people as Spending; transfers count only when you pick them.</p>
      {sheet === 'save' ? (
        <SaveSheet f={f} people={people} t={t} saved={s.reports.saved} onClose={() => setSheet(null)}
          onSave={(name) => { saveReports([...s.reports.saved, { id: crypto.randomUUID?.() ?? String(Date.now()), name, filter: f }]); toast('ok', `Saved “${name}”: it’s a ⭐ chip on all your devices.`); setSheet(null); }}
          onDelete={(id) => saveReports(s.reports.saved.filter((x) => x.id !== id))} />
      ) : sheet && sheet !== 'person' ? (
        <FilterSheet k={sheet} f={f} t={t} shops={shops.slice(0, 200)} cats={catCounts} onChange={change} onClose={() => setSheet(null)} />
      ) : null}
      {sel && <ReceiptSheet key={sel.id} t={sel} url={sel.receipt_path ? urls[sel.receipt_path] : undefined} rules={rules} userId={st.session.user.id} onMove={(c) => void move(sel.id!, c)} onClose={() => setOpen(null)} onChanged={st.reload} />}
    </div>
  );
}
