import { useState } from 'react';
import type { Finding, Paper, Sender, Settings } from '../../supabase/functions/_shared/model.ts';
import { BROKERS, BUREAUS, FREE_REPORTS, PAPER_KINDS, paperKind } from '../../supabase/functions/_shared/people.ts';
import type { WeekLine } from '../../supabase/functions/_shared/week.ts';
import { daysBetween, today } from '../../supabase/functions/_shared/money.ts';
import { shortDate, toast, errText } from './ui';
import { supabase } from '../lib/supabase';

/** Pieces of the "Me" tab. Each one is also drawn in the Guide with made-up data (no working buttons there). */

const plus = (d: string, days: number) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
const tone = (t?: WeekLine['tone']) => t === 'warn' ? 'text-amber-800 dark:text-amber-200' : t === 'good' ? 'text-emerald-800 dark:text-emerald-300' : 'text-stone-700 dark:text-slate-300';

// ---------- 📊 My week ----------
export function WeekCard({ lines, onOpen }: { lines: WeekLine[]; onOpen?: () => void }) {
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="label">📊 My week</p>
        {onOpen && <button className="btn-ghost text-xs" onClick={onOpen}>Open Me →</button>}
      </div>
      <ul className="space-y-1.5">
        {lines.map((l, i) => <li key={i} className={`flex gap-2 text-sm ${tone(l.tone)}`}><span aria-hidden="true">{l.icon}</span><span>{l.text}</span></li>)}
      </ul>
    </section>
  );
}

// ---------- 🕵️ your name online ----------
const VERDICT: Record<string, { label: string; cls: string }> = {
  worrying: { label: '⚠ Worrying', cls: 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-200' },
  'people-search': { label: 'People-search', cls: 'border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200' },
  profile: { label: 'Your profile', cls: 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200' },
  news: { label: 'News', cls: 'border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-200' },
  other: { label: 'Mentions you', cls: 'border-stone-300 text-stone-600 dark:border-slate-700 dark:text-slate-300' },
};
export function FindingRow({ f, onSet }: { f: Finding; onSet?: (patch: Partial<Finding>) => void }) {
  const v = VERDICT[f.verdict ?? 'other'] ?? VERDICT.other;
  return (
    <article className={`panel space-y-1.5 ${f.verdict === 'worrying' && f.status === 'new' ? '!border-red-300 dark:!border-red-800' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${v.cls}`}>{v.label}</span>
        <span className="text-xs text-stone-500 dark:text-slate-400">{f.site} · found {shortDate(f.found_at)}</span>
        {f.status !== 'new' && <span className="chip border-stone-300 text-stone-500 dark:border-slate-700 dark:text-slate-400">{f.status === 'ok' ? '✓ Fine' : f.status === 'not-me' ? 'Not me' : 'Done'}</span>}
      </div>
      <p className="text-sm font-medium">{f.url ? <a className="underline decoration-stone-300 underline-offset-2 dark:decoration-slate-600" href={f.url} target="_blank" rel="noopener noreferrer nofollow">{f.title}</a> : f.title}</p>
      {f.snippet && <p className="text-xs text-stone-600 dark:text-slate-300">{f.snippet}</p>}
      {f.why && <p className="text-xs text-stone-500 dark:text-slate-400">Why: {f.why}</p>}
      {f.verdict === 'worrying' && f.status === 'new' && (
        <p className="text-xs text-stone-600 dark:text-slate-300">What to do: report the page to the site, and ask Google to hide it with <a className="underline" href="https://myactivity.google.com/results-about-you" target="_blank" rel="noopener noreferrer">Results about you</a>. Fake profile or someone pretending to be you: report it as impersonation.</p>
      )}
      {f.status === 'new' && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button className="btn !min-h-[36px] text-xs" onClick={() => onSet?.({ status: 'ok' })}>✓ It’s fine</button>
          <button className="btn !min-h-[36px] text-xs" onClick={() => onSet?.({ status: 'not-me' })}>Not me</button>
          {f.verdict === 'worrying' && <button className="btn !min-h-[36px] text-xs" onClick={() => onSet?.({ status: 'done' })}>Reported / handled</button>}
        </div>
      )}
    </article>
  );
}

// ---------- 🧹 people-search sites ----------
const BROKER_STATUS: Record<string, { label: string; cls: string }> = {
  unknown: { label: 'Not checked', cls: 'border-stone-300 text-stone-500 dark:border-slate-700 dark:text-slate-400' },
  listed: { label: 'Lists you', cls: 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-200' },
  requested: { label: 'Removal sent', cls: 'border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200' },
  gone: { label: 'Removed', cls: 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200' },
  'not-listed': { label: 'Not listed', cls: 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200' },
};
export function BrokerList({ rows, onSet }: { rows: Finding[]; onSet?: (f: Finding, patch: Partial<Finding>) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const order = ['listed', 'requested', 'unknown', 'gone', 'not-listed'];
  const list = BROKERS.map((b) => ({ b, f: rows.find((r) => r.key === b.id) }))
    .concat(rows.filter((r) => !BROKERS.some((b) => b.id === r.key)).map((f) => ({ b: { id: f.key, name: f.title, domain: f.site ?? f.key, remove: f.url ?? `https://${f.site}`, note: 'Look for “opt out”, “remove my info” or “do not sell” at the bottom of the site.' }, f })))
    .sort((x, y) => order.indexOf(x.f?.status ?? 'unknown') - order.indexOf(y.f?.status ?? 'unknown'));
  const set = (f: Finding | undefined, status: string) => {
    if (!f) return;
    onSet?.(f, { status, check_after: status === 'requested' || status === 'gone' ? plus(today(), 90) : null });
  };
  return (
    <div className="space-y-1.5">
      {list.map(({ b, f }) => {
        const st = BROKER_STATUS[f?.status ?? 'unknown'] ?? BROKER_STATUS.unknown;
        return (
          <div key={b.id} className="panel !p-0">
            <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}>
              <span className="min-w-0 flex-1 font-medium">{b.name}</span>
              <span className={`chip shrink-0 ${st.cls}`}>{st.label}</span>
              <span aria-hidden="true" className="text-stone-400">{open === b.id ? '⌃' : '⌄'}</span>
            </button>
            {open === b.id && (
              <div className="space-y-2 px-3 pb-3 text-sm">
                {f?.url && f.status === 'listed' && <p>Your listing: <a className="break-all underline" href={f.url} target="_blank" rel="noopener noreferrer nofollow">{f.url}</a></p>}
                <ol className="list-decimal space-y-1 pl-5 text-stone-700 dark:text-slate-300">
                  <li>Search your name on {b.domain} and copy your listing’s address.</li>
                  <li>Open the <a className="underline" href={b.remove} target="_blank" rel="noopener noreferrer">removal page</a> and send the request.{'note' in b && b.note ? ` ${b.note}` : ''}</li>
                  <li>Tap “Removal sent”. LifeTracker reminds you to look again in 3 months (they often add you back).</li>
                </ol>
                <div className="flex flex-wrap gap-1.5">
                  {(['listed', 'requested', 'gone', 'not-listed'] as const).map((s) => (
                    <button key={s} className={`btn !min-h-[36px] text-xs ${f?.status === s ? '!border-emerald-600' : ''}`} onClick={() => set(f, s)}>{BROKER_STATUS[s].label}</button>
                  ))}
                </div>
                {f?.check_after && (f.status === 'requested' || f.status === 'gone') && <p className="text-xs text-stone-500">Look again from {shortDate(f.check_after)}.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- 🔓 data breaches + password check ----------
export function BreachList({ rows, onSet }: { rows: Finding[]; onSet?: (f: Finding, patch: Partial<Finding>) => void }) {
  if (!rows.length) return <p className="text-sm text-stone-500 dark:text-slate-400">No breach alerts so far.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((f) => (
        <li key={f.id} className="panel flex flex-wrap items-center gap-2 text-sm">
          <span aria-hidden="true">🔓</span>
          <span className="min-w-0 flex-1"><b>{f.key}</b> <span className="text-xs text-stone-500 dark:text-slate-400">· {shortDate(f.found_at)}</span><br /><span className="text-xs text-stone-600 dark:text-slate-300">Change that password (and anywhere you reused it), turn on two-step sign-in.</span></span>
          {f.status === 'new' ? <button className="btn !min-h-[36px] text-xs" onClick={() => onSet?.(f, { status: 'done' })}>✓ Password changed</button> : <span className="chip border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200">✓ Done</span>}
        </li>
      ))}
    </ul>
  );
}

/** Checks a password against Have I Been Pwned without sending it: only the first 5 characters of its SHA-1 code leave the phone. */
export function PasswordCheck() {
  const [pw, setPw] = useState('');
  const [res, setRes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const r = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
      if (!r.ok) throw new Error(`The check didn’t answer (HTTP ${r.status}).`);
      const line = (await r.text()).split('\n').find((l) => l.startsWith(hash.slice(5)));
      const n = line ? Number(line.split(':')[1]) : 0;
      setRes(n > 0 ? `⚠ This password has leaked ${n.toLocaleString()} times. Don’t use it anywhere.` : '✓ Not found in any known leak.');
    } catch (e) { toast('err', errText(e)); }
    setPw('');
    setBusy(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1" type="password" autoComplete="off" placeholder="Type a password to check" value={pw} onChange={(e) => { setPw(e.target.value); setRes(''); }} onKeyDown={(e) => e.key === 'Enter' && pw && void check()} aria-label="Password to check" />
        <button className="btn" disabled={!pw || busy} onClick={() => void check()}>{busy ? <span className="spinner" /> : 'Check'}</button>
      </div>
      {res && <p className={`text-sm ${res.startsWith('⚠') ? 'text-red-700 dark:text-red-300' : 'text-emerald-800 dark:text-emerald-300'}`}>{res}</p>}
      <p className="text-xs text-stone-500 dark:text-slate-400">The password never leaves your phone and isn’t saved: only the first 5 characters of a scrambled code are sent to Have I Been Pwned.</p>
    </div>
  );
}

// ---------- 📭 mailing lists ----------
export type SenderView = 'stale' | 'all' | 'done' | 'spam';
export function SenderRow({ x, days, busy, onUnsub, onKeep, onBlock }: { x: Sender; days: number; busy?: boolean; onUnsub?: () => void; onKeep?: () => void; onBlock?: () => void }) {
  const opened = x.last_opened ? `opened ${shortDate(x.last_opened)}` : 'never opened';
  const stale = !x.last_opened || daysBetween(x.last_opened, today()) > days;
  const how = x.unsub.oneClick ? 'one tap' : x.unsub.mailto ? 'by email' : x.unsub.web ? 'on their page' : null;
  const chip = { unsubscribed: ['✓ Unsubscribed', 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200'], web: ['Finish on their page', 'border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200'], kept: ['Kept', 'border-stone-300 text-stone-500 dark:border-slate-700 dark:text-slate-400'], blocked: ['⛔ Blocked', 'border-stone-300 text-stone-600 dark:border-slate-700 dark:text-slate-300'], failed: ['Failed', 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-200'], subscribed: null }[x.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-0 flex-1 basis-52">
        <p className="truncate text-sm font-medium">{x.name || x.address} {x.spam && <span className="chip border-red-300 text-red-800 dark:border-red-800 dark:text-red-200">Spam</span>} {x.auto && <span className="chip border-stone-300 text-stone-500 dark:border-slate-700 dark:text-slate-400">auto</span>}</p>
        <p className="truncate text-xs text-stone-500 dark:text-slate-400">{x.address} · {x.emails} email{x.emails === 1 ? '' : 's'} · <span className={stale ? 'text-amber-700 dark:text-amber-300' : ''}>{opened}</span></p>
        {x.sample && <p className="truncate text-xs text-stone-500 dark:text-slate-400">“{x.sample}”</p>}
        {x.error && <p className="text-xs text-red-700 dark:text-red-300">{x.error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {chip && <span className={`chip ${chip[1]}`}>{chip[0]}</span>}
        {x.status === 'web' && x.unsub.web && <a className="btn !min-h-[36px] text-xs" href={x.unsub.web} target="_blank" rel="noopener noreferrer nofollow">Open their page</a>}
        {(x.status === 'subscribed' || x.status === 'failed') && !x.spam && how && <button className="btn-primary !min-h-[36px] text-xs" disabled={busy} onClick={onUnsub}>{busy ? <span className="spinner" /> : `Unsubscribe (${how})`}</button>}
        {(x.status === 'subscribed' || x.status === 'failed') && (x.spam || !how) && <button className="btn !min-h-[36px] text-xs" disabled={busy} onClick={onBlock}>⛔ Block</button>}
        {x.status === 'subscribed' && <button className="btn-ghost text-xs" onClick={onKeep}>Keep</button>}
        {(x.status === 'kept' || x.status === 'blocked') && <button className="btn-ghost text-xs" onClick={onKeep}>Undo</button>}
      </div>
    </li>
  );
}
export function senderFilter(view: SenderView, days: number) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return (x: Sender) => view === 'spam' ? x.spam : view === 'done' ? x.status !== 'subscribed' : view === 'stale' ? x.status === 'subscribed' && !x.spam && (!x.last_opened || x.last_opened < cutoff) : true;
}

// ---------- 🪪 documents that expire ----------
export function PaperRow({ p, onOpen }: { p: Paper; onOpen?: () => void }) {
  const k = paperKind(p.kind);
  const left = p.expires ? daysBetween(today(), p.expires) : null;
  const cls = left == null ? 'text-stone-500' : left < 0 ? 'text-red-700 dark:text-red-300' : left <= 30 ? 'text-amber-700 dark:text-amber-300' : left <= 90 ? 'text-amber-700/80 dark:text-amber-200/80' : 'text-stone-500 dark:text-slate-400';
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-slate-800/60" onClick={onOpen}>
      <span className="text-2xl" aria-hidden="true">{k.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{p.name}</span>
        <span className="block truncate text-xs text-stone-500 dark:text-slate-400">{[k.label, p.holder, p.number_end && `…${p.number_end}`].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={`shrink-0 text-right text-xs ${cls}`}>
        {p.expires ? <>{shortDate(p.expires)}<br />{left! < 0 ? 'expired' : `${left} day${left === 1 ? '' : 's'}`}</> : 'no date'}
      </span>
    </button>
  );
}

export function PaperForm({ paper, userId, onSave, onDelete, onDone, read }: {
  paper: Partial<Paper>; userId: string; onSave: (p: Partial<Paper> & { name: string }) => Promise<unknown>; onDelete?: () => Promise<void>; onDone: () => void;
  read: (path: string) => Promise<{ kind: string; name: string; holder: string | null; numberEnd: string | null; expires: string | null; by: string }>;
}) {
  const [p, setP] = useState<Partial<Paper>>({ kind: 'passport', ...paper });
  const [busy, setBusy] = useState('');
  const set = (patch: Partial<Paper>) => setP((c) => ({ ...c, ...patch }));
  const photo = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return toast('err', '15 MB at most.');
    setBusy('photo');
    try {
      const ext = (f.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      const path = `${userId}/papers/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('docs').upload(path, f, { contentType: f.type || 'image/jpeg' });
      if (up.error) throw new Error(up.error.message);
      if (p.photo && p.photo !== paper.photo) await supabase.storage.from('docs').remove([p.photo]);
      set({ photo: path });
      const r = await read(path);
      set({ kind: r.kind, name: r.name || p.name || paperKind(r.kind).label, holder: r.holder ?? p.holder ?? null, number_end: r.numberEnd ?? p.number_end ?? null, expires: r.expires ?? p.expires ?? null });
      toast('ok', `Read by ${r.by}. Check the date before saving.`);
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const save = async () => {
    setBusy('save');
    try { await onSave({ ...p, name: (p.name || paperKind(p.kind ?? 'other').label).trim() }); onDone(); } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  return (
    <div className="space-y-3">
      <label className="btn w-full cursor-pointer">
        {busy === 'photo' ? <><span className="spinner" /> Reading the photo…</> : p.photo ? '📷 Photo saved · take another' : '📷 Take or pick a photo (the AI fills the form)'}
        <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => void photo(e.target.files?.[0])} disabled={!!busy} />
      </label>
      <label className="block text-sm">Kind
        <select className="input mt-1 w-full" value={p.kind} onChange={(e) => set({ kind: e.target.value })}>
          {PAPER_KINDS.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
        </select>
      </label>
      <label className="block text-sm">Name
        <input className="input mt-1 w-full" value={p.name ?? ''} placeholder={paperKind(p.kind ?? 'other').label} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Expires
          <input className="input mt-1 w-full" type="date" value={p.expires ?? ''} onChange={(e) => set({ expires: e.target.value || null })} />
        </label>
        <label className="block text-sm">Number (last 4)
          <input className="input mt-1 w-full" maxLength={4} value={p.number_end ?? ''} onChange={(e) => set({ number_end: e.target.value.slice(-4) || null })} />
        </label>
      </div>
      <label className="block text-sm">Whose (optional)
        <input className="input mt-1 w-full" value={p.holder ?? ''} placeholder="Me, a child, the car…" onChange={(e) => set({ holder: e.target.value || null })} />
      </label>
      <label className="block text-sm">Notes
        <input className="input mt-1 w-full" value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
      </label>
      <p className="text-xs text-stone-500 dark:text-slate-400">Only the last 4 characters of the number are kept. The photo stays private in your own storage.</p>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={!!busy} onClick={() => void save()}>{busy === 'save' ? <span className="spinner" /> : 'Save'}</button>
        {onDelete && <button className="btn text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => void (confirm('Delete this document?') && onDelete().then(onDone))}>Delete</button>}
      </div>
    </div>
  );
}

// ---------- 🔒 credit freeze ----------
export function CreditCard({ c, onChange }: { c: Settings['credit']; onChange?: (c: Settings['credit']) => void }) {
  const done = BUREAUS.filter((b) => c[b.id] === 'frozen').length;
  const reportDue = !c.lastReport || daysBetween(c.lastReport, today()) >= c.reportMonths * 30;
  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-700 dark:text-slate-300">A <b>credit freeze</b> is free and stops anyone from opening a loan or card in your name. You can lift it for a day when you apply for credit yourself. <b>{done} of 3</b> done.</p>
      <ul className="space-y-1.5">
        {BUREAUS.map((b) => (
          <li key={b.id} className="panel flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1"><b>{b.name}</b> · <a className="underline" href={b.freeze} target="_blank" rel="noopener noreferrer">freeze page</a></span>
            <select className="input !min-h-[36px] py-0 text-sm" value={c[b.id]} onChange={(e) => onChange?.({ ...c, [b.id]: e.target.value })} aria-label={`${b.name} freeze`}>
              <option value="unknown">Not sure</option>
              <option value="not">Not frozen</option>
              <option value="frozen">🔒 Frozen</option>
            </select>
          </li>
        ))}
      </ul>
      <div className={`panel flex flex-wrap items-center gap-2 text-sm ${reportDue ? '!border-amber-300 dark:!border-amber-700' : ''}`}>
        <span className="min-w-0 flex-1">🔎 Free credit reports at <a className="underline" href={FREE_REPORTS} target="_blank" rel="noopener noreferrer">annualcreditreport.com</a>: look for accounts you don’t know. {c.lastReport ? `Last checked ${shortDate(c.lastReport)}.` : 'Not checked yet.'}</span>
        <button className="btn !min-h-[36px] text-xs" onClick={() => onChange?.({ ...c, lastReport: today() })}>✓ Checked today</button>
      </div>
    </div>
  );
}
