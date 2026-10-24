import { hrefTo, type Tab } from './nav';
import { appsUrl } from './links';

/**
 * ☰ Menu: every tab and its parts, each with an icon, a name and one short line. The ☰ drawer lists them (with ⭐ saved
 * reports and each Settings section added there), and 💬 Ask's "open …" and the 🔎 search find them by name.
 */
export interface MenuRow { id: string; icon: string; name: string; desc: string; href: () => string; words?: string; tab?: Tab; view?: string }
export interface MenuGroup extends MenuRow { rows: MenuRow[] }

const at = (tab: Tab, view?: string) => () => hrefTo(tab, view);
export const MENU: MenuGroup[] = [
  { id: 'home', icon: '🏠', name: 'Home', desc: 'This month’s spending, Ask, what’s coming up', href: () => '#/home', tab: 'home', words: 'start main', rows: [] },
  {
    id: 'money', icon: '💸', name: 'Money', desc: 'Bills, spending, returns and the log', href: at('money'), tab: 'money', rows: [
      { id: 'bills', icon: '📋', name: 'Bills', desc: 'Regular payments, what’s due next', href: at('money', 'bills'), tab: 'money', view: 'bills', words: 'subscriptions due autopay' },
      { id: 'spending', icon: '💳', name: 'Spending', desc: 'Every purchase, budgets and receipts', href: at('money', 'spending'), tab: 'money', view: 'spending', words: 'purchases budgets receipts' },
      { id: 'returns', icon: '🧾', name: 'Returns', desc: 'Return windows and warranties', href: at('money', 'returns'), tab: 'money', view: 'returns', words: 'warranty warranties orders' },
      { id: 'log', icon: '📜', name: 'Log', desc: 'What happened to your money, newest first', href: at('money', 'log'), tab: 'money', view: 'log', words: 'money log history' },
    ],
  },
  { id: 'reports', icon: '📊', name: 'Reports', desc: 'Your spending by period, category, shop or person', href: () => '#/reports', tab: 'reports', words: 'charts report', rows: [] },
  {
    id: 'places', icon: '📍', name: 'Places', desc: 'Contacts, places near you and your list', href: at('places'), tab: 'places', rows: [
      { id: 'contacts', icon: '📇', name: 'Contacts', desc: 'Your dentist, garage, insurer…', href: at('places', 'contacts'), tab: 'places', view: 'contacts', words: 'phone people' },
      { id: 'nearby', icon: '🔎', name: 'Nearby', desc: 'Places and things to do near home', href: at('places', 'nearby'), tab: 'places', view: 'nearby', words: 'weekend things to do' },
      { id: 'list', icon: '📌', name: 'My list', desc: 'Places you want to try or have been', href: at('places', 'list'), tab: 'places', view: 'list', words: 'been there' },
    ],
  },
  {
    id: 'me', icon: '👤', name: 'Me', desc: 'Your documents, privacy and settings', href: at('me'), tab: 'me', rows: [
      { id: 'vault', icon: '📁', name: 'Vault', desc: 'Your documents, scans and expiry dates', href: at('me', 'vault'), tab: 'me', view: 'vault', words: 'documents passport licence' },
      { id: 'privacy', icon: '🛡️', name: 'Privacy', desc: 'Your name online, breaches, mailing lists', href: at('me', 'privacy'), tab: 'me', view: 'privacy', words: 'breaches credit freeze' },
      { id: 'settings', icon: '⚙️', name: 'Settings', desc: 'Every setting, one square per topic', href: at('me', 'settings'), tab: 'me', view: 'settings', words: 'options' },
    ],
  },
];
/** Below the tabs: the Inbox, the Guide and My apps (🔎 Search and Sign out are added in the ☰ drawer). */
export const MENU_MORE: MenuRow[] = [
  { id: 'inbox', icon: '🔔', name: 'Inbox', desc: 'What was added by itself, each with Undo', href: () => '#/inbox', tab: 'inbox', words: 'added undo bell' },
  { id: 'guide', icon: '📖', name: 'Guide', desc: 'How LifeTracker works, in plain words', href: () => '#/guide', tab: 'guide', words: 'help' },
  { id: 'apps', icon: '📱', name: 'My apps', desc: 'All your apps on one page', href: appsUrl, words: 'other apps cost' },
];

/** Every page by name (for "open reports" in 💬 Ask and the 🔎 search). */
export const MENU_PAGES: MenuRow[] = [...MENU.flatMap((g) => [g, ...g.rows]), ...MENU_MORE];

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
/** Does a row match what was typed (every word in its name, line or words)? */
export const menuMatch = (r: MenuRow, q: string, extra = '') => {
  const hay = fold(`${r.name} ${r.desc} ${r.words ?? ''} ${extra}`);
  return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};
