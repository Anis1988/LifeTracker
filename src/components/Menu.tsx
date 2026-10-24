import { useState } from 'react';
import { MENU, MENU_MORE, menuMatch, type MenuRow } from '../lib/menu';
import { goTo, lastView, parseHash, type Tab } from '../lib/nav';
import { SETTINGS_INDEX } from './SettingsGrid';
import { SearchBox } from './Contacts';
import { Chevron, Drawer, Empty } from './ui';
import type { SavedReport } from '../../supabase/functions/_shared/model.ts';

/**
 * ☰ Menu (a drawer from the left, opened by ☰ at the top-left of every page): each tab is one folded row (icon, name,
 * line, chevron); a tap unfolds it (one at a time) to pick one of its parts: ⭐ saved reports under Reports, and the
 * Settings sections folded again under Settings. Home is a single row. The open tab starts unfolded with its part lit.
 * The search at the top filters the rows and unfolds the groups that match. The Guide shows it with made-up saved
 * reports (`example`: nothing moves).
 */
type Row = MenuRow & { go?: () => void; badge?: number; extra?: string };

const SECTIONS = Object.values(SETTINGS_INDEX).filter((x) => x.id !== 'guide' && x.id !== 'apps');

function open(r: Row) {
  if (r.go) return r.go();
  if (r.tab) return goTo(r.tab, r.view, r.extra ?? '');
  location.href = r.href();
}

/** Where we are now (tab, view, Settings section), to light the right row. */
export function hereNow(): { tab: Tab; view: string | null; section: string | null } {
  const p = parseHash();
  const view = p.view ?? (p.tab === 'money' || p.tab === 'places' || p.tab === 'me' ? lastView(p.tab) : null);
  const section = p.tab === 'me' && view === 'settings' ? location.hash.match(/^#\/me\/settings\/([a-z]+)/)?.[1] ?? null : null;
  return { tab: p.tab, view, section };
}

function MenuLine({ r, big, example, onPick, current, after }: { r: Row; big?: boolean; example?: boolean; onPick?: (r: Row) => void; current?: boolean; after?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1">
      <button type="button" tabIndex={example ? -1 : undefined} onClick={() => onPick?.(r)} aria-current={current ? 'page' : undefined}
        className={`tap flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 text-left ${big ? 'min-h-[60px] py-2' : 'min-h-[48px] py-1.5'} ${current ? 'bg-teal-500/[0.12] ring-1 ring-teal-500/40 dark:bg-teal-300/[0.1] dark:ring-teal-300/40' : ''}`}>
        <span className={big ? 'tile' : 'tile !h-9 !w-9 !rounded-xl !text-base'} aria-hidden="true">{r.icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block font-display font-semibold leading-snug ${current ? 'text-teal-800 dark:text-teal-100' : 'text-slate-900 dark:text-slate-50'} ${big ? 'text-[17px]' : 'text-[15px]'}`}>{r.name}</span>
          <span className="block text-[13px] leading-snug text-slate-500 dark:text-slate-400">{r.desc}</span>
        </span>
        {r.badge ? <span className="rounded-full bg-amber-400 px-2 text-[12px] font-bold leading-[22px] text-slate-900" aria-label={`${r.badge} to look at`}>{r.badge}</span> : null}
        {!after && <span aria-hidden="true" className="text-lg text-slate-400 dark:text-slate-500">›</span>}
      </button>
      {after}
    </li>
  );
}

/** A tab's folded row: tap to unfold its parts (aria-expanded). */
function GroupHead({ r, open: isOpen, here, example, onToggle }: { r: Row; open: boolean; here: boolean; example?: boolean; onToggle: () => void }) {
  return (
    <button type="button" tabIndex={example ? -1 : undefined} onClick={onToggle} aria-expanded={isOpen} aria-controls={`menu-${r.id}`}
      className="tap flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-2 py-2 text-left">
      <span className="tile" aria-hidden="true">{r.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-display text-[17px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
          {r.name}{here && <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shadow-[0_0_8px_#5eead4] dark:bg-teal-300" aria-label="(you are here)" />}
        </span>
        <span className="block text-[13px] leading-snug text-slate-500 dark:text-slate-400">{r.desc}</span>
      </span>
      {r.badge ? <span className="rounded-full bg-amber-400 px-2 text-[12px] font-bold leading-[22px] text-slate-900" aria-label={`${r.badge} to look at`}>{r.badge}</span> : null}
      <Chevron open={isOpen} className="!h-5 !w-5" />
    </button>
  );
}

export function MenuList({ q = '', saved, meCount = 0, example, here, startOpen, onSearch, onSignOut, onDone }: {
  q?: string; saved: SavedReport[]; meCount?: number; example?: boolean;
  /** Where we are (lights the row); the Guide passes a made-up place. */
  here?: { tab: Tab; view: string | null; section?: string | null };
  /** Which group starts unfolded (default: the open tab's). */
  startOpen?: string | null;
  onSearch?: () => void; onSignOut?: () => void;
  /** After a pick (the drawer closes). */
  onDone?: () => void;
}) {
  const at = here ?? (example ? { tab: 'home' as Tab, view: null } : hereNow());
  const [openId, setOpenId] = useState<string | null>(() => startOpen !== undefined ? startOpen : at.tab === 'home' ? null : at.tab);
  const [setOpen, setSetOpen] = useState(() => startOpen === undefined && !!at.section);
  const pick = example ? undefined : (r: Row) => { open(r); onDone?.(); };
  const query = q.trim();
  const hit = (r: Row, extra = '') => !query || menuMatch(r, query, extra);
  const sections: Row[] = SECTIONS.map((x) => ({ id: `set-${x.id}`, icon: x.icon, name: x.title, desc: `Settings → ${x.title}`, words: x.words, href: () => `#/me/settings/${x.id}`, tab: 'me', view: 'settings', extra: `/${x.id}` }));
  const reportRow: Row = { id: 'report', icon: '📊', name: 'Report', desc: 'This month’s spending, filters and charts', words: 'charts report', href: () => '#/reports', tab: 'reports' };
  const savedRows: Row[] = saved.map((s) => ({ id: `rep-${s.id}`, icon: '⭐', name: s.name, desc: 'Saved report', words: 'saved report', href: () => `#/reports?saved=${s.id}`, tab: 'reports', extra: `?saved=${s.id}` }));
  const groups = MENU.map((g) => {
    const head: Row = { ...g, badge: g.id === 'me' ? meCount : 0 };
    const rows: Row[] = g.id === 'reports' ? [reportRow, ...savedRows] : g.rows.map((r) => ({ ...r, badge: r.id === 'privacy' ? meCount : 0 }));
    const headHit = !!query && hit(head);
    const kids = !query || headHit ? rows : rows.filter((r) => hit(r));
    const sets = g.id !== 'me' ? [] : query ? sections.filter((r) => hit(r)) : sections;
    return { head, kids, sets, show: !query || headHit || kids.length > 0 || sets.length > 0 };
  }).filter((g) => g.show);
  const more: Row[] = [
    ...MENU_MORE,
    { id: 'search', icon: '🔎', name: 'Search', desc: 'Find anything on this phone', words: 'find look', href: () => '#/home', go: onSearch },
  ].filter((r) => hit(r));
  if (!groups.length && !more.length) return <Empty icon="☰">No page called “{query}”. Try 🔎 Search: it looks inside every page.</Empty>;
  const isHere = (r: Row) => {
    if (!r.tab || r.tab !== at.tab || r.id.startsWith('rep-')) return false;
    if (r.id.startsWith('set-')) return r.extra === `/${at.section}`;
    return r.id === 'report' || (r.view === at.view && !(r.id === 'settings' && at.section));
  };
  return (
    <div className="space-y-2">
      <section className="card !px-2 !py-1.5" aria-label="Tabs">
        <ul>
          {groups.map(({ head, kids, sets }) => {
            if (head.id === 'home') return <MenuLine key="home" r={head} big example={example} onPick={pick} current={at.tab === 'home'} />;
            const unfolded = !!query || openId === head.id;
            const showSets = sets.length > 0 && (query ? true : setOpen);
            return (
              <li key={head.id}>
                <GroupHead r={head} open={unfolded} here={at.tab === head.id} example={example} onToggle={() => setOpenId(openId === head.id ? null : head.id)} />
                {unfolded && (
                  <ul id={`menu-${head.id}`} className="rise mb-1 ml-[22px] border-l border-slate-900/[0.08] pl-2.5 dark:border-white/[0.08]" aria-label={head.name}>
                    {kids.map((r) => (
                      <MenuLine key={r.id} r={r} example={example} onPick={pick} current={isHere(r)}
                        after={r.id === 'settings' && !query ? (
                          <button type="button" tabIndex={example ? -1 : undefined} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" aria-expanded={setOpen} aria-label={setOpen ? 'Hide the Settings sections' : `Show the ${SECTIONS.length} Settings sections`} onClick={() => setSetOpen(!setOpen)}><Chevron open={setOpen} className="!h-5 !w-5" /></button>
                        ) : undefined} />
                    ))}
                    {showSets && (
                      <li>
                        <ul className="rise ml-[18px] border-l border-dashed border-slate-900/[0.1] pl-2 dark:border-white/[0.1]" aria-label="Settings sections">
                          {sets.map((r) => <MenuLine key={r.id} r={r} example={example} onPick={pick} current={isHere(r)} />)}
                        </ul>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {more.length > 0 && (
        <section className="card !px-2 !py-1.5" aria-label="More">
          <ul>{more.map((r) => <MenuLine key={r.id} r={r} example={example} onPick={pick} current={!!r.tab && r.tab === at.tab} />)}</ul>
        </section>
      )}
      {!query && onSignOut !== undefined && (
        <button type="button" tabIndex={example ? -1 : undefined} className="btn w-full text-red-700 dark:text-red-300" onClick={onSignOut}>Sign out</button>
      )}
    </div>
  );
}

/** ☰ The menu drawer: search on top, the folded tabs, then Inbox · Guide · My apps · Search and Sign out. */
export function MenuDrawer({ saved, meCount, onClose, onSearch, onSignOut }: { saved: SavedReport[]; meCount: number; onClose: () => void; onSearch: () => void; onSignOut: () => void }) {
  const [q, setQ] = useState('');
  return (
    <Drawer title="Menu" onClose={onClose} head={<div className="mt-3"><SearchBox q={q} onChange={setQ} placeholder="Find a page: bills, vault, zip…" label="Find a page" /></div>}>
      <MenuList q={q} saved={saved} meCount={meCount} onDone={onClose} onSearch={() => { onClose(); onSearch(); }} onSignOut={onSignOut} />
    </Drawer>
  );
}
