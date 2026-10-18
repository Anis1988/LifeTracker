import { useStore } from '../lib/store';
import { goTo } from '../lib/nav';
import { AddReceipt } from './Receipts';
import { Sheet } from './ui';

/** What ＋ can add: each opens the usual way of adding it, on its own page. */
export const QUICK_ADDS = [
  { id: 'bill', icon: '📋', title: 'A bill', sub: 'Money → Bills, typed by hand', go: () => goTo('money', 'bills', '?add') },
  { id: 'billdoc', icon: '📄', title: 'A bill as a photo or PDF', sub: 'Read at once (🔔 Inbox)', go: () => goTo('inbox', undefined, '?add') },
  { id: 'doc', icon: '📁', title: 'A document to the Vault', sub: 'Scan it: read and saved by itself', go: () => goTo('me', 'vault', '?add') },
  { id: 'place', icon: '📍', title: 'A place', sub: 'Find it nearby, then ＋ My list', go: () => goTo('places', 'nearby', '?find') },
  { id: 'contact', icon: '📇', title: 'A contact', sub: 'Dentist, garage, insurer…', go: () => goTo('places', 'contacts', '?add') },
] as const;

export function QuickAddList({ onPick, example }: { onPick?: (go: () => void) => void; example?: boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {QUICK_ADDS.map((x) => (
        <li key={x.id}>
          <button type="button" className="card tap flex min-h-[64px] w-full items-center gap-3 !px-3 !py-2.5 text-left" tabIndex={example ? -1 : undefined} onClick={() => onPick?.(x.go)}>
            <span className="tile" aria-hidden="true">{x.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[15.5px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{x.title}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{x.sub}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** ＋ in the tab bar (phones) or the header (big screens): add anything from anywhere. */
export function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const st = useStore();
  return (
    <Sheet title="Add" onClose={onClose}>
      <div className="space-y-3">
        <AddReceipt userId={st.session.user.id} className="w-full" onAdded={async () => { await st.reload(); onClose(); goTo('money', 'spending'); }} />
        <p className="px-1 text-xs text-slate-500 dark:text-slate-400">🧾 A receipt: 📷 take a photo (the camera opens) or 🖼️ choose a photo or PDF; it’s read and goes to Money → Spending.</p>
        <QuickAddList onPick={(go) => { onClose(); go(); }} />
      </div>
    </Sheet>
  );
}

/** The ＋ button itself (round, accent gradient). */
export function PlusIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
