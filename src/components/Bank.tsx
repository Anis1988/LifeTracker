import type { Status } from '../lib/store';

type PlaidBank = NonNullable<Status['plaid']>[number];

/** One bank connected through Plaid: its accounts, last read, and any problem. Also drawn in the Guide (no buttons). */
export function BankCard({ p, busy, onLogin, onDisconnect }: { p: PlaidBank; busy?: boolean; onLogin?: () => void; onDisconnect?: () => void }) {
  return (
    <div className="panel space-y-1">
      <div className="flex items-center justify-between gap-2">
        <b>{p.institution}</b>
        <span className="text-xs text-stone-500">{p.lastSync ? `read ${new Date(p.lastSync).toLocaleString()}` : 'not read yet'}</span>
      </div>
      <ul className="space-y-0.5 text-sm">
        {p.accounts.map((a) => <li key={a.name} className="flex justify-between gap-2"><span className="truncate">{a.name}</span><span className="num">{a.balance.toLocaleString('en-US', { style: 'currency', currency: a.currency || 'USD' })}</span></li>)}
      </ul>
      {p.error && <p className="text-xs text-amber-800 dark:text-amber-200">⚠ {p.error}</p>}
      {(onLogin || onDisconnect) && (
        <div className="flex flex-wrap gap-2">
          {p.needsLogin && onLogin && <button className="btn-primary" disabled={busy} onClick={onLogin}>Log in again</button>}
          {onDisconnect && <button className="btn text-red-700 dark:text-red-300" disabled={busy} onClick={onDisconnect}>Disconnect</button>}
        </div>
      )}
    </div>
  );
}
