import { useState } from 'react';

/**
 * 🧭 Where things live: 4 tabs (Home · Money · Places · Me), each with its views behind one Seg.
 * Addresses: "#/<tab>/<view>[/<section>][?…]" (e.g. "#/me/settings/nearby", "#/places/contacts?c=<id>").
 * Each tab remembers its last view on this device (localStorage).
 */
export type Tab = 'home' | 'money' | 'places' | 'me' | 'inbox' | 'guide';
export const VIEWS = {
  money: ['bills', 'spending', 'returns', 'log'],
  places: ['contacts', 'nearby', 'list'],
  me: ['vault', 'privacy', 'settings'],
} as const;
export type ViewTab = keyof typeof VIEWS;
export type ViewOf<T extends ViewTab> = (typeof VIEWS)[T][number];
const TABS: Tab[] = ['home', 'money', 'places', 'me', 'inbox', 'guide'];
const hasViews = (t: string): t is ViewTab => t in VIEWS;

export function lastView<T extends ViewTab>(tab: T): ViewOf<T> {
  try {
    const v = localStorage.getItem(`lt.view.${tab}`);
    if (v && (VIEWS[tab] as readonly string[]).includes(v)) return v as ViewOf<T>;
  } catch { /* private mode */ }
  return VIEWS[tab][0] as ViewOf<T>;
}
export function rememberView(tab: ViewTab, v: string): void {
  try { localStorage.setItem(`lt.view.${tab}`, v); } catch { /* private mode */ }
}

/** The tab and view in the address ("#/me/settings/ai?x" → me, settings). */
export function parseHash(h = location.hash): { tab: Tab; view: string | null } {
  const m = h.match(/^#\/([a-z]+)(?:\/([a-z]+))?/);
  const tab = (TABS.find((t) => t === m?.[1]) ?? 'home') as Tab;
  const view = m?.[2] && hasViews(tab) && (VIEWS[tab] as readonly string[]).includes(m[2]) ? m[2] : null;
  return { tab, view };
}

/**
 * Old addresses (6 tabs) → new ones, so old links and bookmarks keep working.
 * #/contacts?c=1 → #/places/contacts?c=1 · #/contacts?nearby → #/places/nearby · #/vault?doc=1 → #/me/vault?doc=1
 * #/me → #/me/privacy · #/settings/nearby → #/me/settings/nearby · #/bills → #/money/bills
 */
export function upgradeHash(h: string): string | null {
  let m = h.match(/^#\/contacts(?=$|[/?])(.*)$/);
  if (m) return /[?&]nearby/.test(m[1]) ? '#/places/nearby' : `#/places/contacts${m[1]}`;
  if ((m = h.match(/^#\/vault(?=$|[/?])(.*)$/))) return `#/me/vault${m[1]}`;
  if ((m = h.match(/^#\/settings(?=$|[/?])(.*)$/))) return `#/me/settings${m[1]}`;
  if ((m = h.match(/^#\/bills(?=$|[/?])(.*)$/))) return `#/money/bills${m[1]}`;
  if ((m = h.match(/^#\/me(\?.*)?$/))) return `#/me/privacy${m[1] ?? ''}`;
  return null;
}

/** The address of a tab (its remembered view when none is given), plus "/section" or "?query". */
export function hrefTo(tab: Tab, view?: string, extra = ''): string {
  const v = view ?? (hasViews(tab) ? lastView(tab) : '');
  return `#/${tab}${v ? `/${v}` : ''}${extra}`;
}

/** Go there (the page opens fresh, so "?doc=…" style openers run). */
export function goTo(tab: Tab, view?: string, extra = ''): void {
  if (view && hasViews(tab)) rememberView(tab, view);
  const h = hrefTo(tab, view, extra);
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = h;
  window.scrollTo(0, 0);
}

/** A tab's Seg: starts on the view in the address, else the last one used; switching keeps the address in step. */
export function useView<T extends ViewTab>(tab: T): [ViewOf<T>, (v: ViewOf<T>) => void] {
  const [view, setView] = useState<ViewOf<T>>(() => {
    const p = parseHash();
    if (p.tab === tab && p.view) { rememberView(tab, p.view); return p.view as ViewOf<T>; }
    return lastView(tab);
  });
  const pick = (v: ViewOf<T>) => {
    setView(v);
    rememberView(tab, v);
    history.replaceState(null, '', `#/${tab}/${v}`);
  };
  return [view, pick];
}

/** A Guide topic's name in the address: "Your bills" → "your-bills" (#/guide?t=your-bills opens it). */
export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "?doc=<id>"-style value in the address, then the address is cleaned (so a refresh doesn't open it again). */
export function takeParam(name: string, keep?: string): string | null {
  const m = location.hash.match(new RegExp(`[?&]${name}(?:=([\\w-]+))?(?=&|$)`));
  if (!m) return null;
  if (keep !== undefined) history.replaceState(null, '', keep);
  return m[1] ?? '';
}
