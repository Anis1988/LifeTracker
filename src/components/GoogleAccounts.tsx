import { Toggle } from './ui';
import { lastChecked } from './Receipts';

/** One extra Gmail account as the server reports it (no secrets). */
export interface GoogleExtra { kind: string; email: string | null; on: boolean; gmail: boolean; mailbox: boolean; lastScan: string | null; lastError: string | null; connectedAt: string | null }

/**
 * ✉️ Settings → Google: every mailbox LifeTracker watches. The main account (Calendar + Gmail) first, then the extra
 * Gmail accounts, each with its own on/off, last look and Disconnect. Also drawn in the Guide with made-up accounts.
 */
export function GoogleAccounts({ main, extras, busy, canAdd, onAdd, onToggle, onDisconnect, onMailbox }: {
  main: { email: string | null; gmail: boolean; calendar: boolean; lastScan: string | null } | null;
  extras: GoogleExtra[];
  busy?: string;
  canAdd: boolean;
  onAdd?: () => void;
  onToggle?: (kind: string, on: boolean) => void;
  onDisconnect?: (x: GoogleExtra) => void;
  onMailbox?: (x: GoogleExtra) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="label">Mailboxes watched</p>
      <ul className="space-y-2">
        {main && (
          <li className="panel flex items-start gap-3 text-sm">
            <span className="tile" aria-hidden="true">📅</span>
            <div className="min-w-0 flex-1">
              <p className="break-all font-semibold">{main.email ?? 'Your Google account'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Main · {[main.calendar && 'Calendar', main.gmail && 'Gmail'].filter(Boolean).join(' + ') || 'connected'}{main.gmail ? ` · last look ${lastChecked(main.lastScan)}` : ''}</p>
            </div>
          </li>
        )}
        {extras.map((x) => (
          <li key={x.kind} className={`panel space-y-2 text-sm ${x.on ? '' : 'opacity-70'}`}>
            <div className="flex items-start gap-3">
              <span className="tile" aria-hidden="true">✉️</span>
              <div className="min-w-0 flex-1">
                <p className="break-all font-semibold">{x.email ?? 'Gmail account'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{x.on ? `Gmail only · last look ${lastChecked(x.lastScan)}` : 'Switched off: not read'}{x.mailbox ? ' · manages mailing lists' : ''}</p>
                {x.on && x.lastError && <p className="text-xs text-amber-800 dark:text-amber-200">⚠ {x.lastError.replace(/^[^:]*\([^)]*\):\s*/, '')}</p>}
              </div>
              <Toggle on={x.on} disabled={!!busy} onChange={(v) => onToggle?.(x.kind, v)} label={`Read ${x.email ?? 'this account'}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              {!x.mailbox && <button className="btn" disabled={!!busy} onClick={() => onMailbox?.(x)}>📭 Manage its mailing lists too</button>}
              <button className="btn text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => onDisconnect?.(x)}>{busy === x.kind ? <span className="spinner" /> : 'Disconnect'}</button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn w-full" disabled={!!busy || !canAdd} onClick={onAdd}>{busy === 'google-add' ? <span className="spinner" /> : '＋ Add another Google account'}</button>
      <p className="text-xs text-slate-500 dark:text-slate-400">Each extra account is read the same way as the main one, at every email check (bank alerts, receipts, bills, orders, appointments, documents, contacts, data breaches, mailing lists), read-only. Its appointments still go in your main LifeTracker calendar. Things found there say which mailbox, e.g. “From email (work@…)”.</p>
    </div>
  );
}
