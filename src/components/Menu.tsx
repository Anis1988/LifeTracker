import { useState } from 'react';
import { MENU, MENU_MORE, menuMatch, type MenuRow } from '../lib/menu';
import { goTo } from '../lib/nav';
import { SETTINGS_INDEX } from './SettingsGrid';
import { Chevron, Empty } from './ui';
import type { SavedReport } from '../../supabase/functions/_shared/model.ts';

/**
 * ☰ Menu: every tab and its parts as tappable rows, grouped by tab (icon, name, one short line), ⭐ saved reports under
 * Reports and each Settings section under Settings (folded). A search at the top filters the rows. The Guide shows it
 * with made-up saved reports (`example`: nothing moves).
 */
type Row = MenuRow & { go?: () => void; badge?: number; extra?: string };

const SECTIONS = Object.values(SETTINGS_INDEX).filter((x) => x.id !== 'guide' && x.id !== 'apps');

function open(r: Row) {
  if (r.go) return r.go();
  if (r.tab) return goTo(r.tab, r.view, r.extra ?? '');
  location.href = r.href();
}

function MenuLine({ r, big, example, onPick, after }: { r: Row; big?: boolean; example?: boolean; onPick?: (r: Row) => void; after?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1">
      <button type="button" tabIndex={example ? -1 : undefined} onClick={() => onPick?.(r)}
        className={`tap flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 text-left ${big ? 'min-h-[60px] py-2' : 'min-h-[52px] py-1.5'}`}>
        <span className={big ? 'tile' : 'tile !h-9 !w-9 !rounded-xl !text-base'} aria-hidden="true">{r.icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block font-display font-semibold leading-snug text-slate-900 dark:text-slate-50 ${big ? 'text-[17px]' : 'text-[15px]'}`}>{r.name}</span>
          <span className="block text-[13px] leading-snug text-slate-500 dark:text-slate-400">{r.desc}</span>
        </span>
        {r.badge ? <span className="rounded-full bg-amber-400 px-2 text-[12px] font-bold leading-[22px] text-slate-900" aria-label={`${r.badge} to look at`}>{r.badge}</span> : null}
        {!after && <span aria-hidden="true" className="text-lg text-slate-400 dark:text-slate-500">›</span>}
      </button>
      {after}
    </li>
  );
}

export function MenuList({ q = '', saved, meCount = 0, example, onSearch, onSignOut }: {
  q?: string; saved: SavedReport[]; meCount?: number; example?: boolean; onSearch?: () => void; onSignOut?: () => void;
}) {
  const [setOpen, setSetOpen] = useState(false);
  const pick = example ? undefined : open;
  const query = q.trim();
  const hit = (r: Row, extra = '') => !query || menuMatch(r, query, extra);
  const sections: Row[] = SECTIONS.map((x) => ({ id: `set-${x.id}`, icon: x.icon, name: x.title, desc: `Settings → ${x.title}`, words: x.words, href: () => `#/me/settings/${x.id}`, tab: 'me', view: 'settings', extra: `/${x.id}` }));
  const savedRows: Row[] = saved.map((s) => ({ id: `rep-${s.id}`, icon: '⭐', name: s.name, desc: 'Saved report', words: 'saved report', href: () => `#/reports?saved=${s.id}`, tab: 'reports', extra: `?saved=${s.id}` }));
  const groups = MENU.map((g) => {
    const head: Row = { ...g, badge: g.id === 'me' ? meCount : 0 };
    const rows: Row[] = [...g.rows.map((r) => ({ ...r, badge: r.id === 'privacy' ? meCount : 0 })), ...(g.id === 'reports' ? savedRows : [])];
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
  return (
    <div className="space-y-3">
      {groups.map(({ head, kids, sets }) => {
        const list = kids;
        const showSets = sets.length > 0 && (query ? true : setOpen);
        return (
          <section key={head.id} className="card !px-2 !py-1.5" aria-label={head.name}>
            <ul>
              <MenuLine r={head} big example={example} onPick={pick} />
              {(list.length > 0 || showSets) && (
                <li>
                  <ul className="ml-[22px] border-l border-slate-900/[0.08] pl-2.5 dark:border-white/[0.08]">
                    {list.map((r) => (
                      <MenuLine key={r.id} r={r} example={example} onPick={pick}
                        after={r.id === 'settings' && !query ? (
                          <button type="button" tabIndex={example ? -1 : undefined} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" aria-expanded={setOpen} aria-label={setOpen ? 'Hide the Settings sections' : `Show the ${SECTIONS.length} Settings sections`} onClick={() => setSetOpen(!setOpen)}><Chevron open={setOpen} className="!h-5 !w-5" /></button>
                        ) : undefined} />
                    ))}
                    {showSets && (
                      <li>
                        <ul className="rise ml-[18px] border-l border-dashed border-slate-900/[0.1] pl-2 dark:border-white/[0.1]" aria-label="Settings sections">
                          {sets.map((r) => <MenuLine key={r.id} r={r} example={example} onPick={pick} />)}
                        </ul>
                      </li>
                    )}
                  </ul>
                </li>
              )}
            </ul>
          </section>
        );
      })}
      {more.length > 0 && (
        <section className="card !px-2 !py-1.5" aria-label="More">
          <ul>{more.map((r) => <MenuLine key={r.id} r={r} big example={example} onPick={pick} />)}</ul>
        </section>
      )}
      {!query && onSignOut !== undefined && (
        <button type="button" tabIndex={example ? -1 : undefined} className="btn w-full text-red-700 dark:text-red-300" onClick={onSignOut}>Sign out</button>
      )}
    </div>
  );
}
