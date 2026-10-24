import { Fragment, type CSSProperties } from 'react';
import { PlusIcon } from './QuickAdd';
import type { Tab } from '../lib/nav';

// The tabs (line icons, like the rest of the Liquid Glass look). Wide screens show them all in the header; phones get
// Home · Money · ＋ · Reports · Menu at the bottom (Places and Me are in ☰ Menu there). 🔔 Inbox and 🔎 search sit in the header.
const ICON = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  money: 'M3 7h18v12H3zM3 11h18M7 15h3M16 7V5H5v2',
  reports: 'M3 21h18M6.5 17v-5M11.5 17V7M16.5 17v-8M21 17V4',
  places: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
};
export const TABS = [
  { id: 'home', label: 'Home', icon: ICON.home },
  { id: 'money', label: 'Money', icon: ICON.money },
  { id: 'reports', label: 'Reports', icon: ICON.reports },
  { id: 'places', label: 'Places', icon: ICON.places },
  { id: 'me', label: 'Me', icon: ICON.me },
  { id: 'menu', label: 'Menu', icon: ICON.menu },
] as const;
/** The phone bar: 4 tabs and ＋ in the middle. */
export const BAR_TABS = TABS.filter((t) => t.id !== 'places' && t.id !== 'me');
/** Which bar button is lit: Places, Me and the Guide are reached from the Menu, so the Menu lights up for them. */
const barOf = (t: Tab): Tab => (t === 'places' || t === 'me' || t === 'guide' ? 'menu' : t);
export const Icon = ({ d, className = 'h-[22px] w-[22px]' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>
);

/** Phones: a floating glass tab bar within thumb reach; a glass pill slides to the open tab; ＋ in the middle. */
export function PhoneTabBar({ tab, onGo, onAdd, badge = () => 0, example }: { tab: Tab; onGo?: (t: Tab) => void; onAdd?: () => void; badge?: (t: Tab) => number; example?: boolean }) {
  // 5 slots: the 4 tabs and ＋ in the middle; the glass pill skips ＋.
  const slot = (i: number) => (i < 2 ? i : i + 1);
  const lit = barOf(tab);
  const at = BAR_TABS.findIndex((t) => t.id === lit);
  return (
    <nav aria-label="Tabs" style={example ? undefined : { bottom: 'calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }} className={`glass tabbar relative flex rounded-[30px] p-1.5 ${example ? '' : '!fixed inset-x-3 z-30 mx-auto max-w-md sm:hidden'}`}>
      <span aria-hidden="true" className="tabpill" style={{ '--i': slot(Math.max(0, at)), '--n': BAR_TABS.length + 1, opacity: at < 0 ? 0 : 1 } as CSSProperties} />
      {BAR_TABS.map((t, i) => (
        <Fragment key={t.id}>
          {i === 2 && (
            <span className="z-[1] flex flex-1 basis-0 items-center justify-center">
              <button onClick={onAdd} aria-label="Add" aria-haspopup="dialog" tabIndex={example ? -1 : undefined} className="btn-primary h-12 w-12 !rounded-[18px] !p-0 shadow-[0_8px_24px_-8px_rgba(94,234,212,0.9)]"><PlusIcon /></button>
            </span>
          )}
          <button onClick={() => onGo?.(t.id)} aria-current={lit === t.id ? 'page' : undefined} tabIndex={example ? -1 : undefined} className={`tap tabbtn relative z-[1] flex h-[54px] flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] font-bold ${lit === t.id ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon d={t.icon} />{t.label}
            {badge(t.id) ? <span className="absolute right-[14%] top-1 min-w-[18px] rounded-full bg-amber-400 px-1.5 text-center text-[10px] font-bold leading-[18px] text-slate-900 shadow-[0_0_12px_-2px_rgba(251,191,36,0.9)] ring-2 ring-white/70 animate-[pulse_2.4s_ease-in-out_infinite] dark:ring-[#0b1020]/80">{badge(t.id)}</span> : null}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
