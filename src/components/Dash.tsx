import { useId, useState } from 'react';
import type { Moment, Tone } from '../lib/timeline';
import { Money, shortDate, errText } from './ui';
import { daysBetween, today } from '../../supabase/functions/_shared/money.ts';

/** Home's "life at a glance" pieces (Liquid Glass 2 look). Each is also drawn in the Guide with made-up data. */

/** A progress ring: `value` 0..1 (capped), centre text, colour by tone. */
export function Ring({ value, size = 56, stroke = 6, tone = 'emerald', children, label }: { value: number; size?: number; stroke?: number; tone?: 'emerald' | 'teal' | 'amber' | 'red'; children?: React.ReactNode; label: string }) {
  const id = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  // Fine = a teal→violet glow (teal→sky for the second ring); amber and red stay plain so they stand out.
  const grad = tone === 'emerald' ? ['#2dd4bf', '#a78bfa'] : tone === 'teal' ? ['#38bdf8', '#a78bfa'] : null;
  const solid = { amber: 'stroke-amber-500 dark:stroke-amber-300', red: 'stroke-red-600 dark:stroke-red-400' }[tone as 'amber' | 'red'];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="overflow-visible">
        {grad && <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={grad[0]} /><stop offset="1" stopColor={grad[1]} /></linearGradient></defs>}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-900/[0.08] dark:stroke-white/[0.09]" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          stroke={grad ? `url(#${id})` : undefined} style={grad && size >= 90 ? { filter: `drop-shadow(0 0 6px ${grad[0]}99)` } : undefined}
          className={`ring-arc ${solid ?? ''} transition-[stroke-dasharray] duration-700`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** This month's spending against a usual month. */
export function MonthHero({ total, usual, soFarUsual, bills, monthName }: { total: number; usual: number | null; soFarUsual: number | null; bills: number; monthName: string }) {
  const share = usual ? total / usual : 0;
  const diff = soFarUsual != null ? soFarUsual - total : null;
  return (
    <section className="card rise flex items-center gap-4 !p-5">
      <Ring value={share} size={124} stroke={10} tone={share > 1 ? 'red' : share > 0.9 ? 'amber' : 'emerald'} label={usual ? `${Math.round(share * 100)}% of a usual month` : 'No usual month yet'}>
        <span className="num text-[22px] font-semibold">{usual ? `${Math.round(share * 100)}%` : '—'}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{usual ? 'of a usual month' : 'first month'}</span>
      </Ring>
      <div className="min-w-0 space-y-1">
        <p className="label">Spent in {monthName}</p>
        <Money n={total} className="block text-[32px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white" />
        {diff != null && <p className={`w-fit rounded-full px-2.5 py-1 text-xs font-extrabold ${diff >= 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}><Money n={Math.abs(diff)} /> {diff >= 0 ? 'under' : 'over'} a usual month so far</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">Bills: <Money n={bills} className="text-slate-800 dark:text-slate-200" /> a month</p>
      </div>
    </section>
  );
}

export function MiniRings({ rings }: { rings: { label: string; sub: string; value: number; text: string; tone: 'emerald' | 'teal' | 'amber' | 'red'; onClick?: () => void }[] }) {
  return (
    <div className="rise rise-1 grid grid-cols-3 gap-2.5">
      {rings.map((r) => (
        <button key={r.label} onClick={r.onClick} className="card tap flex flex-col items-center gap-1.5 !rounded-[22px] !px-2 !py-3 text-center">
          <Ring value={r.value} tone={r.tone} label={`${r.label}: ${r.text}`}><span className="num text-[13px] font-semibold">{r.text}</span></Ring>
          <span className="text-[13px] font-bold">{r.label}</span>
          <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{r.sub}</span>
        </button>
      ))}
    </div>
  );
}

const DOT: Record<Tone, string> = {
  bill: 'bg-teal-400 shadow-[0_0_10px_#2dd4bf]', warn: 'bg-amber-400 shadow-[0_0_10px_#fbbf24]', date: 'bg-pink-400 shadow-[0_0_10px_#f472b6]',
  doc: 'bg-violet-400 shadow-[0_0_10px_#a78bfa]', return: 'bg-sky-400 shadow-[0_0_10px_#38bdf8]', appt: 'bg-emerald-400 shadow-[0_0_10px_#34d399]',
};

/** 🗓️ Coming up: one line per moment, with a glowing dot by kind. */
export function TimelineList({ moments, max = 6, onAll, onOpen, title = 'Coming up' }: { moments: Moment[]; max?: number; onAll?: () => void; onOpen?: (m: Moment) => void; title?: string }) {
  const t = today();
  return (
    <section className="card rise rise-3 space-y-1">
      <div className="flex items-center justify-between">
        <p className="label">{title}</p>
        {onAll && moments.length > max && <button className="chip -my-2 border-teal-500/30 px-2.5 py-1 text-teal-800 dark:border-teal-300/30 dark:text-teal-200" onClick={onAll}>See all {moments.length}</button>}
      </div>
      {moments.length ? (
        <ul>
          {moments.slice(0, max).map((m, i) => {
            const left = daysBetween(t, m.date);
            return (
              <li key={`${m.date}${m.title}${i}`} className="rise border-t border-slate-900/[0.06] first:border-0 dark:border-white/[0.06]" style={{ animationDelay: `${0.12 + i * 0.04}s` }}>
                <button className="tap -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left" onClick={() => onOpen?.(m)}>
                  <span className="w-11 shrink-0 text-center">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{left === 0 ? 'Today' : left === 1 ? 'Tmrw' : new Date(`${m.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
                    <span className="num block text-lg font-semibold">{m.date.slice(8, 10)}</span>
                  </span>
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[m.tone]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold"><span aria-hidden="true">{m.icon} </span>{m.title}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{m.sub}{left > 1 ? ` · in ${left} days` : ''}</span>
                  </span>
                  {m.amount != null && <Money n={m.amount} className="text-sm font-semibold" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="py-2 text-sm text-slate-500 dark:text-slate-400">Nothing in the next 30 days.</p>}
    </section>
  );
}

// ---------- 💬 Ask LifeTracker ----------
export const ASK_EXAMPLES = ['How much did I spend on eating out last month?', 'Which subscriptions renew this month?', 'What could I cancel to save money?', 'When does my passport expire?'];

export function AskBar({ onAsk, disabled }: { onAsk?: (q: string) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const send = () => { if (q.trim().length >= 2) { onAsk?.(q.trim()); setQ(''); } };
  return (
    <div className="glass rise rise-2 flex min-h-[56px] items-center gap-2 rounded-[22px] pl-3.5 pr-1.5 transition-shadow focus-within:shadow-[0_0_0_4px_rgba(94,234,212,0.18),0_0_30px_-8px_#5eead4]">
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6 4.7 1.9-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.9z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
      <label className="sr-only" htmlFor="ask">Ask LifeTracker</label>
      <input id="ask" className="min-w-0 flex-1 bg-transparent py-3 text-[15px] font-medium outline-none placeholder:text-slate-400" placeholder="Ask: how much on food last month?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={disabled} maxLength={500} />
      <button className="btn-primary h-11 w-11 shrink-0 !rounded-2xl !p-0 disabled:opacity-40" onClick={send} disabled={disabled || q.trim().length < 2} aria-label="Ask">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

export interface Turn { q: string; a: string; by?: string; followUps?: string[]; error?: boolean; open?: { label: string; href: string } }

/** The conversation (inside a Sheet): questions, answers, follow-up chips. */
export function AskChat({ turns, busy, onAsk }: { turns: Turn[]; busy?: boolean; onAsk?: (q: string) => void }) {
  return (
    <div className="space-y-3">
      {!turns.length && !busy && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">Ask anything about your bills, spending, documents and dates. Answers come only from your own data.</p>
          <div className="flex flex-wrap gap-1.5">{ASK_EXAMPLES.map((x) => <button key={x} className="chip border-teal-500/30 px-3 py-1.5 text-teal-800 dark:border-teal-300/30 dark:text-teal-200" onClick={() => onAsk?.(x)}>{x}</button>)}</div>
        </div>
      )}
      {turns.map((t, i) => (
        <div key={i} className="space-y-2">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-teal-300 to-violet-400 px-3.5 py-2 text-sm font-semibold text-[#04121a]">{t.q}</p>
          <div className={`rise max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm ${t.error ? 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-200' : 'border-slate-900/[0.07] bg-white/80 dark:border-white/10 dark:bg-white/[0.05]'}`}>
            <p className="whitespace-pre-line">{t.a}</p>
            {t.open && <a href={t.open.href} className="btn-primary mt-2 w-full sm:w-auto">{t.open.label} →</a>}
            {t.by && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Answered by {t.by}</p>}
          </div>
          {i === turns.length - 1 && !!t.followUps?.length && !busy && (
            <div className="flex flex-wrap gap-1.5">{t.followUps.map((x) => <button key={x} className="chip border-slate-900/10 px-3 py-1.5 text-slate-700 dark:border-white/10 dark:text-slate-200" onClick={() => onAsk?.(x)}>{x}</button>)}</div>
          )}
        </div>
      ))}
      {busy && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="spinner" /> Thinking…</p>}
    </div>
  );
}

export const askError = (e: unknown): Turn['a'] => `Couldn’t answer: ${errText(e)}`;
export { shortDate };
