import { useState } from 'react';
import type { Moment, Tone } from '../lib/timeline';
import { Money, shortDate, errText } from './ui';
import { daysBetween, today } from '../../supabase/functions/_shared/money.ts';

/** Home's "life at a glance" pieces (Aurora look). Each is also drawn in the Guide with made-up data. */

/** A progress ring: `value` 0..1 (capped), centre text, colour by tone. */
export function Ring({ value, size = 56, stroke = 6, tone = 'emerald', children, label }: { value: number; size?: number; stroke?: number; tone?: 'emerald' | 'teal' | 'amber' | 'red'; children?: React.ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  const color = { emerald: 'stroke-emerald-600 dark:stroke-emerald-400', teal: 'stroke-teal-600 dark:stroke-teal-300', amber: 'stroke-amber-500 dark:stroke-amber-300', red: 'stroke-red-600 dark:stroke-red-400' }[tone];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-900/[0.08] dark:stroke-white/[0.08]" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className={`${color} transition-[stroke-dasharray] duration-700`} />
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
    <section className="card rise flex items-center gap-4">
      <Ring value={share} size={124} stroke={10} tone={share > 1 ? 'red' : share > 0.9 ? 'amber' : 'emerald'} label={usual ? `${Math.round(share * 100)}% of a usual month` : 'No usual month yet'}>
        <span className="num text-[22px] font-semibold">{usual ? `${Math.round(share * 100)}%` : '—'}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{usual ? 'of a usual month' : 'first month'}</span>
      </Ring>
      <div className="min-w-0 space-y-1">
        <p className="label">Spent in {monthName}</p>
        <Money n={total} className="block text-[30px] font-semibold tracking-tight text-slate-900 dark:text-white" />
        {diff != null && <p className={`text-sm font-semibold ${diff >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}><Money n={Math.abs(diff)} /> {diff >= 0 ? 'under' : 'over'} a usual month so far</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">Bills: <Money n={bills} className="text-slate-800 dark:text-slate-200" /> a month</p>
      </div>
    </section>
  );
}

export function MiniRings({ rings }: { rings: { label: string; sub: string; value: number; text: string; tone: 'emerald' | 'teal' | 'amber' | 'red'; onClick?: () => void }[] }) {
  return (
    <div className="rise grid grid-cols-3 gap-2.5">
      {rings.map((r) => (
        <button key={r.label} onClick={r.onClick} className="card flex flex-col items-center gap-1.5 !rounded-[22px] !px-2 !py-3 text-center">
          <Ring value={r.value} tone={r.tone} label={`${r.label}: ${r.text}`}><span className="num text-[13px] font-semibold">{r.text}</span></Ring>
          <span className="text-xs font-bold">{r.label}</span>
          <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{r.sub}</span>
        </button>
      ))}
    </div>
  );
}

const DOT: Record<Tone, string> = {
  bill: 'bg-emerald-500 shadow-[0_0_10px_#10b981]', warn: 'bg-amber-400 shadow-[0_0_10px_#fbbf24]', date: 'bg-pink-400 shadow-[0_0_10px_#f472b6]',
  doc: 'bg-violet-400 shadow-[0_0_10px_#a78bfa]', return: 'bg-teal-400 shadow-[0_0_10px_#2dd4bf]',
};

/** 🗓️ Coming up: one line per moment, with a glowing dot by kind. */
export function TimelineList({ moments, max = 6, onAll, onOpen, title = 'Coming up' }: { moments: Moment[]; max?: number; onAll?: () => void; onOpen?: (m: Moment) => void; title?: string }) {
  const t = today();
  return (
    <section className="card rise space-y-1">
      <div className="flex items-baseline justify-between">
        <p className="label">{title}</p>
        {onAll && moments.length > max && <button className="text-xs font-bold text-emerald-700 dark:text-emerald-300" onClick={onAll}>See all {moments.length}</button>}
      </div>
      {moments.length ? (
        <ul>
          {moments.slice(0, max).map((m, i) => {
            const left = daysBetween(t, m.date);
            return (
              <li key={`${m.date}${m.title}${i}`} className="border-t border-slate-900/[0.06] first:border-0 dark:border-white/[0.06]">
                <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => onOpen?.(m)}>
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
    <div className="rise flex min-h-[54px] items-center gap-2 rounded-[20px] border border-emerald-600/30 bg-white/70 pl-3.5 pr-1.5 backdrop-blur-xl dark:border-emerald-400/30 dark:bg-white/[0.05]">
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6 4.7 1.9-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.9z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
      <label className="sr-only" htmlFor="ask">Ask LifeTracker</label>
      <input id="ask" className="min-w-0 flex-1 bg-transparent py-3 text-[15px] font-medium outline-none placeholder:text-slate-400" placeholder="Ask: how much on food last month?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={disabled} maxLength={500} />
      <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white transition active:scale-95 disabled:opacity-40 dark:bg-emerald-400 dark:text-emerald-950" onClick={send} disabled={disabled || q.trim().length < 2} aria-label="Ask">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

export interface Turn { q: string; a: string; by?: string; followUps?: string[]; error?: boolean }

/** The conversation (inside a Sheet): questions, answers, follow-up chips. */
export function AskChat({ turns, busy, onAsk }: { turns: Turn[]; busy?: boolean; onAsk?: (q: string) => void }) {
  return (
    <div className="space-y-3">
      {!turns.length && !busy && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">Ask anything about your bills, spending, documents and dates. Answers come only from your own data.</p>
          <div className="flex flex-wrap gap-1.5">{ASK_EXAMPLES.map((x) => <button key={x} className="chip border-emerald-600/30 px-3 py-1.5 text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-200" onClick={() => onAsk?.(x)}>{x}</button>)}</div>
        </div>
      )}
      {turns.map((t, i) => (
        <div key={i} className="space-y-2">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white dark:bg-emerald-400 dark:text-emerald-950">{t.q}</p>
          <div className={`max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm ${t.error ? 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-200' : 'border-slate-900/[0.07] bg-white/80 dark:border-white/10 dark:bg-white/[0.05]'}`}>
            <p className="whitespace-pre-line">{t.a}</p>
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
