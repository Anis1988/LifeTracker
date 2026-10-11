import { useState } from 'react';

/** How to turn on purchase-alert emails at each bank (menus can move a little; the words to look for stay). */
export const BANK_STEPS: { bank: string; steps: string[] }[] = [
  { bank: 'Bank of America', steps: [
    'Open the Bank of America app (or bankofamerica.com) → Menu → Security & Alerts (or “Alerts”) → Settings.',
    'Pick each credit and debit card → turn on the “Purchase” / “Transaction” alert (card purchases).',
    'Set the amount to $0.01 (so every purchase is sent) and choose Email as the delivery.',
  ] },
  { bank: 'SoFi', steps: [
    'Open the SoFi app → your profile (top) → Settings → Notifications (or “Alerts”).',
    'Turn on purchase / transaction alerts for your SoFi debit and credit card.',
    'Choose Email (keep push if you like), for any amount.',
  ] },
  { bank: 'Capital One', steps: [
    'Open the Capital One app → pick your card → Profile → Settings → Alerts (or “Manage alerts” on capitalone.com).',
    'Turn on “Transaction alerts” / “Purchase made”, amount $0 or $0.01.',
    'Choose Email as the delivery. Do it for each card.',
  ] },
];

/** Settings: the bank alert emails part (also drawn in the Guide with made-up numbers). */
export function AlertBanks({ gmail, read, banks, last, onConnect }: { gmail: boolean; read: number; banks: string[]; last?: string | null; onConnect?: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className={`panel text-sm ${gmail ? '' : '!border-amber-300 dark:!border-amber-700'}`}>
        {gmail ? (
          <p>📧 <b>{read}</b> purchase{read === 1 ? '' : 's'} read from alert emails{banks.length ? ` (${banks.join(', ')})` : ''}.{last ? ` Last checked ${new Date(last).toLocaleString()}.` : ' Checked every morning.'}</p>
        ) : (
          <div className="space-y-2">
            <p>To read your bank’s alert emails, connect Gmail first (read-only).</p>
            {onConnect && <button className="btn-primary" onClick={onConnect}>✉️ Connect Gmail</button>}
          </div>
        )}
      </div>
      <p className="text-sm font-medium">Turn on purchase alerts by email, once per bank:</p>
      {BANK_STEPS.map((b) => (
        <div key={b.bank} className="panel !p-0">
          <button className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium" aria-expanded={open === b.bank} onClick={() => setOpen(open === b.bank ? null : b.bank)}>
            <span>{banks.includes(b.bank) ? '✅' : '🏦'} {b.bank}</span><span aria-hidden="true" className="text-stone-400">{open === b.bank ? '⌃' : '⌄'}</span>
          </button>
          {open === b.bank && <ol className="list-decimal space-y-1 px-3 pb-3 pl-8 text-sm text-stone-700 dark:text-slate-300">{b.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
        </div>
      ))}
      <p className="text-xs text-stone-500">Other banks work too if they email you for each purchase. Only purchases are read (deposits, payments and statements are skipped), with free patterns: no AI, nothing paid. A ✅ shows a bank whose alerts were read.</p>
    </div>
  );
}
