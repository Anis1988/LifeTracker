import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useVaultOpen } from '../pages/Vault';
import { searchAll, type HitGroup } from '../lib/search';
import { SearchBox } from './Contacts';
import { Empty, Sheet } from './ui';

/** The results, grouped by kind: each row opens the thing itself (or the right page). */
export function SearchResults({ groups, q, locked, onPick, example }: { groups: HitGroup[]; q: string; locked?: boolean; onPick?: () => void; example?: boolean }) {
  if (q.trim().length < 2) return <p className="px-1 text-sm text-slate-500 dark:text-slate-400">Type 2 letters or more: a bill, a shop, “latte”, 23.45, a contact, a place, a document, an appointment or a setting (“zip”, “PIN”).</p>;
  if (!groups.length) return <Empty icon="🔎">Nothing on this phone matches “{q}”.{locked ? ' Your Vault is locked: open it to search your documents too.' : ''}</Empty>;
  return (
    <div className="space-y-3" aria-live="polite">
      {groups.map((g) => (
        <section key={g.kind} className="card !px-2 !py-2">
          <p className="label px-2 pb-1 pt-1">{g.label} <span className="num">· {g.hits.length + g.more}</span></p>
          <ul>
            {g.hits.map((h) => (
              <li key={h.id}>
                <a href={example ? undefined : h.href} onClick={onPick} className="tap flex min-h-[52px] items-center gap-3 rounded-2xl px-2 py-1.5">
                  <span className="tile !h-9 !w-9 !rounded-xl !text-base" aria-hidden="true">{h.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-50">{h.title}</span>
                    {h.sub && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{h.sub}</span>}
                  </span>
                  <span aria-hidden="true" className="text-teal-600 dark:text-teal-300">→</span>
                </a>
              </li>
            ))}
          </ul>
          {g.more > 0 && <p className="px-2 pb-1 text-[11px] text-slate-500 dark:text-slate-400">+{g.more} more: type a little more to narrow it down.</p>}
        </section>
      ))}
      {locked && <p className="px-1 text-xs text-slate-500 dark:text-slate-400">🔒 Your Vault is locked, so documents aren’t searched.</p>}
    </div>
  );
}

/** 🔎 The search in the header: everything already on this phone, as you type. No AI, nothing sent. */
export function SearchSheet({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const vaultOpen = useVaultOpen();
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => box.current?.querySelector('input')?.focus(), 60); return () => clearTimeout(t); }, []);
  const groups = useMemo(() => searchAll({ items: st.items, tx: st.tx, contacts: st.contacts, places: st.places, papers: st.papers, appts: st.appts, rules: st.settings.spend.rules }, q, { vaultOpen }),
    [st.items, st.tx, st.contacts, st.places, st.papers, st.appts, st.settings.spend.rules, q, vaultOpen]);
  return (
    <Sheet title="Search everything" onClose={onClose}>
      <div className="space-y-3">
        <div ref={box}><SearchBox q={q} onChange={setQ} placeholder="Bill, shop, contact, place, document…" label="Search everything" /></div>
        <SearchResults groups={groups} q={q} locked={!vaultOpen && st.papers.length > 0} onPick={onClose} />
      </div>
    </Sheet>
  );
}
