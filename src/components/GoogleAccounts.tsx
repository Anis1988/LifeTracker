import { useState } from 'react';
import { Toggle } from './ui';
import { lastChecked } from './Receipts';
import { PersonChip, SWATCH } from './Person';
import { PERSON_COLORS, personOf, type PersonColor } from '../../supabase/functions/_shared/mailPeople.ts';

/** One extra Gmail account as the server reports it (no secrets). */
export interface GoogleExtra { kind: string; email: string | null; on: boolean; gmail: boolean; mailbox: boolean; lastScan: string | null; lastError: string | null; connectedAt: string | null; person?: { name?: string; color?: string } | null }

/**
 * ✉️ Settings → Google: every mailbox LifeTracker watches. The main account (Calendar + Gmail) first, then the extra
 * Gmail accounts, each with its own on/off, last look and Disconnect. Also drawn in the Guide with made-up accounts.
 */
/** 👥 The name + colour shown on entries from this mailbox ("● Roza"). */
export function PersonEdit({ email, main, saved, onSave, busy }: { email: string; main: boolean; saved?: unknown; onSave?: (name: string, color: PersonColor) => void; busy?: boolean }) {
  const p = personOf(email, main, saved);
  const [name, setName] = useState(p.name);
  const changed = name.trim() && name.trim() !== p.name;
  return (
    <div className="space-y-1.5 rounded-2xl border border-slate-900/[0.07] px-2.5 py-2 dark:border-white/[0.08]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">On its entries:</span>
        <PersonChip p={{ ...p, name: name.trim() || p.name }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1 basis-28" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} aria-label={`Name for ${email}`} placeholder="Name" />
        {changed && <button className="btn px-3 text-xs" disabled={busy} onClick={() => onSave?.(name.trim(), p.color)}>Save</button>}
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Colour for ${p.name}`}>
        {PERSON_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={p.color === c} aria-label={c} disabled={busy} onClick={() => onSave?.(name.trim() || p.name, c)}
            className={`tap grid h-11 w-11 place-items-center rounded-full border ${p.color === c ? 'border-slate-900/40 dark:border-white/50' : 'border-transparent'}`}>
            <span className={`h-6 w-6 rounded-full ${SWATCH[c]}`} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function GoogleAccounts({ main, extras, busy, canAdd, onAdd, onToggle, onDisconnect, onMailbox, onPerson }: {
  main: { email: string | null; gmail: boolean; calendar: boolean; lastScan: string | null; person?: { name?: string; color?: string } | null } | null;
  extras: GoogleExtra[];
  busy?: string;
  canAdd: boolean;
  onAdd?: () => void;
  onToggle?: (kind: string, on: boolean) => void;
  onDisconnect?: (x: GoogleExtra) => void;
  onMailbox?: (x: GoogleExtra) => void;
  onPerson?: (kind: string, name: string, color: PersonColor) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="label">Mailboxes watched</p>
      <ul className="space-y-2">
        {main && (
          <li className="panel space-y-2 text-sm">
            <div className="flex items-start gap-3">
              <span className="tile" aria-hidden="true">📅</span>
              <div className="min-w-0 flex-1">
                <p className="break-all font-semibold">{main.email ?? 'Your Google account'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Main · {[main.calendar && 'Calendar', main.gmail && 'Gmail'].filter(Boolean).join(' + ') || 'connected'}{main.gmail ? ` · last look ${lastChecked(main.lastScan)}` : ''}</p>
              </div>
            </div>
            {main.email && <PersonEdit key={`${main.email}${JSON.stringify(main.person)}`} email={main.email} main saved={main.person} busy={!!busy} onSave={(n, c) => onPerson?.('google', n, c)} />}
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
            {x.email && <PersonEdit key={`${x.email}${JSON.stringify(x.person)}`} email={x.email} main={false} saved={x.person} busy={!!busy} onSave={(n, c) => onPerson?.(x.kind, n, c)} />}
            <div className="flex flex-wrap gap-2">
              {!x.mailbox && <button className="btn" disabled={!!busy} onClick={() => onMailbox?.(x)}>📭 Manage its mailing lists too</button>}
              <button className="btn text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => onDisconnect?.(x)}>{busy === x.kind ? <span className="spinner" /> : 'Disconnect'}</button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn w-full" disabled={!!busy || !canAdd} onClick={onAdd}>{busy === 'google-add' ? <span className="spinner" /> : '＋ Add another Google account'}</button>
      <p className="text-xs text-slate-500 dark:text-slate-400">Each extra account is read the same way as the main one, at every email check (bank alerts, receipts, bills, orders, appointments, documents, contacts, data breaches, mailing lists), read-only. Its appointments still go in your main LifeTracker calendar. Entries found there carry the mailbox’s name in its colour (like “● Roza”), so you can see whose they are; pick the name and colour above.</p>
    </div>
  );
}
