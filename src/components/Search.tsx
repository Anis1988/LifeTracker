import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useVaultOpen } from '../pages/Vault';
import { KINDS, buildIndex, dataOf, marks, queryWords, searchIndex, type Hit, type HitGroup, type HitKind, type LogLine } from '../lib/search';
import { KindChips } from './Contacts';
import { Empty, Sheet } from './ui';
import { PersonChip, personEdge, usePeople } from './Person';
import { nameAddresses, personFor } from '../../supabase/functions/_shared/mailPeople.ts';

/** The matched words, lit with the accent glow (readable in light and dark). */
export function Highlight({ text, words }: { text: string; words: string[] }) {
  const m = marks(text, words);
  if (!m.length) return <>{text}</>;
  const out: (string | JSX.Element)[] = [];
  let at = 0;
  m.forEach(([a, b], i) => { if (a > at) out.push(text.slice(at, a)); out.push(<mark key={i} className="hl">{text.slice(a, b)}</mark>); at = b; });
  if (at < text.length) out.push(text.slice(at));
  return <>{out.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</>;
}

/** The results, grouped by section (icon, name, how many): each row opens the thing itself. */
export function SearchResults({ groups, q, active = -1, onPick, example }: { groups: HitGroup[]; q: string; active?: number; onPick?: (h: Hit) => void; example?: boolean }) {
  const { words } = queryWords(q);
  const people = usePeople();
  let n = -1;
  return (
    <div className="space-y-3" aria-live="polite">
      {groups.map((g) => (
        <section key={g.kind} className="card !px-2 !py-2" aria-label={g.label}>
          <h3 className="flex items-center gap-2 px-2 pb-1.5 pt-1">
            <span className="tile !h-7 !w-7 !rounded-lg !text-sm" aria-hidden="true">{g.icon}</span>
            <span className="label !text-slate-700 dark:!text-slate-200">{g.label}</span>
            <span className="num ml-auto rounded-full bg-teal-500/10 px-2 text-[11px] font-semibold text-teal-800 dark:bg-teal-300/10 dark:text-teal-200">{g.hits.length + g.more}</span>
          </h3>
          <ul>
            {g.hits.map((h) => {
              n++;
              const on = n === active;
              const who = h.src ? personFor(h.src, people) : null; // 👥 found in Roza's / Anis's email
              return (
                <li key={h.id}>
                  <a id={`sr-${n}`} href={example ? undefined : h.href} tabIndex={example ? -1 : undefined} onClick={() => onPick?.(h)} data-active={on || undefined}
                    className={`qrow tap flex min-h-[56px] items-center gap-3 rounded-2xl px-2 py-2 ${h.locked ? 'bg-amber-400/10' : ''} ${personEdge(who)}`}>
                    <span className="tile !h-10 !w-10 !rounded-xl !text-lg" aria-hidden="true">{h.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block break-words text-[15.5px] font-semibold leading-snug text-slate-900 dark:text-slate-50"><Highlight text={nameAddresses(h.title, people)} words={words} />{who && <> <PersonChip p={who} className="align-[2px]" /></>}</span>
                      <span className="block truncate text-[13px] leading-snug text-slate-600 dark:text-slate-300">
                        {h.snippet ? <Highlight text={h.snippet} words={words} /> : <Highlight text={h.sub} words={words} />}
                      </span>
                    </span>
                    {(h.amount || h.date) && (
                      <span className="num flex shrink-0 flex-col items-end text-right leading-tight">
                        {h.amount && <span className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-50">{h.amount}</span>}
                        {h.date && <span className="text-[11px] text-slate-500 dark:text-slate-400">{h.date}</span>}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
          {g.more > 0 && <p className="px-2 pb-1 text-[12px] text-slate-500 dark:text-slate-400">+{g.more} more: pick “{g.label}” above, or type a little more.</p>}
        </section>
      ))}
    </div>
  );
}

const RECENT = 'lt.searchRecent';
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : []; } catch { return []; } };
const saveRecent = (q: string) => {
  const t = q.trim();
  if (t.length < 2) return;
  try { localStorage.setItem(RECENT, JSON.stringify([t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8))); } catch { /* private mode */ }
};

/** The big search field: glowing focus ring, ✕ to clear. */
function QueryField({ q, onChange, onKey, active }: { q: string; onChange: (q: string) => void; onKey?: (e: KeyboardEvent<HTMLInputElement>) => void; active?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 60); return () => clearTimeout(t); }, []);
  return (
    <div className="relative">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-[22px] w-[22px] -translate-y-1/2 text-teal-600 dark:text-teal-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input ref={ref} className="input qfield w-full pl-12 pr-14" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
        placeholder="Search everything…" value={q} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} aria-label="Search everything"
        aria-controls="search-results" aria-activedescendant={active != null && active >= 0 ? `sr-${active}` : undefined} />
      {q && <button className="btn-ghost absolute right-1 top-1/2 h-11 w-11 -translate-y-1/2 !rounded-full !p-0 text-lg text-slate-500 dark:text-slate-400" aria-label="Clear the search" onClick={() => { onChange(''); ref.current?.focus(); }}>✕</button>}
    </div>
  );
}

/** 🔎 Search everything on this phone, as you type. No AI, nothing sent (the money log is read once, like Money → Log). */
export function SearchSheet({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const vaultOpen = useVaultOpen();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [kind, setKind] = useState<HitKind | 'all'>('all');
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(readRecent);
  const [log, setLog] = useState<LogLine[] | undefined>(undefined);
  useEffect(() => { const t = setTimeout(() => setDq(q), 110); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let live = true;
    void supabase.from('money_log').select('id, at, kind, text, data').order('at', { ascending: false }).limit(1000)
      .then(({ data }) => { if (live) setLog((data as LogLine[] | null) ?? []); }, () => undefined);
    return () => { live = false; };
  }, []);
  const ix = useMemo(() => buildIndex(dataOf(st, log), { vaultOpen }), [st, log, vaultOpen]);
  const all = useMemo(() => searchIndex(ix, dq, { kind: 'all' }), [ix, dq]);
  const groups = useMemo(() => (kind === 'all' ? all : searchIndex(ix, dq, { kind })), [ix, dq, kind, all]);
  const hits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  useEffect(() => setActive(-1), [dq, kind]);
  useEffect(() => { if (active >= 0) document.getElementById(`sr-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const typed = queryWords(dq).words.join('').length >= 2;
  const pick = () => { saveRecent(q); onClose(); };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    else if (e.key === 'Enter') {
      const i = active >= 0 ? active : hits.length ? 0 : -1;
      if (i >= 0) { e.preventDefault(); document.getElementById(`sr-${i}`)?.click(); }
    }
  };
  const chips = [{ id: 'all', label: 'All', n: all.reduce((s, g) => s + (g.hits[0]?.locked ? 0 : g.hits.length + g.more), 0) },
    ...all.filter((g) => !g.hits[0]?.locked).map((g) => ({ id: g.kind, label: `${g.icon} ${g.label}`, n: g.hits.length + g.more }))];
  if (kind !== 'all' && !chips.some((c) => c.id === kind)) chips.push({ id: kind, label: `${KINDS.find((k) => k.kind === kind)!.icon} ${KINDS.find((k) => k.kind === kind)!.label}`, n: 0 });

  return (
    <Sheet title="Search everything" onClose={onClose} wide head={<div className="mt-3"><QueryField q={q} onChange={setQ} onKey={key} active={active} /></div>}>
      <div id="search-results" className="space-y-3">
        {typed && <KindChips label="Show" options={chips} value={kind} onChange={(k) => setKind(k as HitKind | 'all')} />}
        {!typed && kind === 'all' ? (
          <div className="space-y-4 pt-1">
            {recent.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><p className="label">Recent</p><button className="btn-ghost !min-h-[36px] text-xs" onClick={() => { try { localStorage.removeItem(RECENT); } catch { /* private mode */ } setRecent([]); }}>Clear</button></div>
                <div className="flex flex-wrap gap-1.5">{recent.map((r) => <button key={r} className="chip border-slate-900/10 text-slate-700 dark:border-white/10 dark:text-slate-200" onClick={() => setQ(r)}>↺ {r}</button>)}</div>
              </div>
            )}
            <div className="space-y-1.5">
              <p className="label">Look in</p>
              <div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <button key={k.kind} className="chip border-slate-900/10 text-slate-700 dark:border-white/10 dark:text-slate-200" onClick={() => setKind(k.kind)}>{k.icon} {k.label}</button>)}</div>
            </div>
            <Empty icon="🔎">Type anything: a shop, “latte”, <span className="num">25</span> for $25.00, a phone number, a name, a document, a setting (“zip”, “PIN”). Every word must be there. No AI, nothing sent.</Empty>
            <p className="hidden text-center text-xs text-slate-500 dark:text-slate-400 sm:block"><kbd className="num">/</kbd> or <kbd className="num">Ctrl K</kbd> opens search anywhere · <kbd className="num">↑ ↓</kbd> to move · <kbd className="num">Enter</kbd> to open</p>
          </div>
        ) : (
          <>
            {!typed && <KindChips label="Show" options={[{ id: 'all', label: 'All', n: 0 }, ...KINDS.map((k) => ({ id: k.kind, label: `${k.icon} ${k.label}`, n: searchIndex(ix, '', { kind: k.kind })[0]?.hits.length ?? 0 }))]} value={kind} onChange={(k) => setKind(k as HitKind | 'all')} />}
            {groups.length && hits.some((h) => !h.locked)
              ? <SearchResults groups={groups} q={dq} active={active} onPick={pick} />
              : <>
                <Empty icon="🫧">Nothing matches “{dq || KINDS.find((k) => k.kind === kind)?.label}”{kind !== 'all' && typed ? ' here. Try All.' : '.'} Try fewer words, or part of a word.</Empty>
                {groups.length > 0 && <SearchResults groups={groups} q={dq} active={active} onPick={pick} />}
              </>}
            {kind === 'log' || kind === 'all' ? log === undefined && <p className="text-center text-xs text-slate-500 dark:text-slate-400">Reading the money log…</p> : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
