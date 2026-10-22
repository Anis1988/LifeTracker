import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { personFor, personOf, type MailPerson, type MailSrc, type PersonColor } from '../../supabase/functions/_shared/mailPeople.ts';
import type { Status } from '../lib/store';

/**
 * 👥 Whose mailbox an entry came from: a small "● Roza" chip on the row, and a soft tinted left edge for anyone but the
 * main account, so their entries stand out. Name + colour per mailbox live on the server (Settings → Google).
 * The colour is always next to the name (never colour alone); the address is never shown on a row.
 */
export const PeopleCtx = createContext<MailPerson[]>([]);
export const usePeople = () => useContext(PeopleCtx);
export function usePersonFor(r: MailSrc | null | undefined): MailPerson | null {
  const people = usePeople();
  return r ? personFor(r, people) : null;
}

/** The mailboxes from the server's status: main first, then the extras. */
export function peopleOf(status: Status | null | undefined): MailPerson[] {
  if (!status) return [];
  const out: MailPerson[] = [];
  if (status.google.connected && status.google.email) out.push(personOf(status.google.email, true, status.google.person));
  for (const x of status.googleExtras ?? []) if (x.email && !out.some((p) => p.email === x.email!.toLowerCase())) out.push(personOf(x.email, false, x.person));
  return out;
}
export function PeopleProvider({ status, children }: { status: Status | null | undefined; children: ReactNode }) {
  const people = useMemo(() => peopleOf(status), [status]);
  return <PeopleCtx.Provider value={people}>{children}</PeopleCtx.Provider>;
}

const DOT: Record<PersonColor, string> = {
  teal: 'bg-teal-500 dark:bg-teal-300', pink: 'bg-pink-500 dark:bg-pink-300', violet: 'bg-violet-500 dark:bg-violet-300',
  amber: 'bg-amber-500 dark:bg-amber-300', sky: 'bg-sky-500 dark:bg-sky-300', lime: 'bg-lime-600 dark:bg-lime-300',
};
const CHIP: Record<PersonColor, string> = {
  teal: 'border-teal-500/35 bg-teal-500/10 text-teal-900 dark:border-teal-300/30 dark:bg-teal-300/10 dark:text-teal-100',
  pink: 'border-pink-500/35 bg-pink-500/10 text-pink-900 dark:border-pink-300/30 dark:bg-pink-300/10 dark:text-pink-100',
  violet: 'border-violet-500/35 bg-violet-500/10 text-violet-900 dark:border-violet-300/30 dark:bg-violet-300/10 dark:text-violet-100',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100',
  sky: 'border-sky-500/35 bg-sky-500/10 text-sky-900 dark:border-sky-300/30 dark:bg-sky-300/10 dark:text-sky-100',
  lime: 'border-lime-600/40 bg-lime-500/10 text-lime-900 dark:border-lime-300/30 dark:bg-lime-300/10 dark:text-lime-100',
};
const EDGE: Record<PersonColor, string> = {
  teal: 'shadow-[inset_3px_0_0_rgba(20,184,166,0.75)] bg-teal-500/[0.05] dark:bg-teal-300/[0.05]',
  pink: 'shadow-[inset_3px_0_0_rgba(236,72,153,0.75)] bg-pink-500/[0.05] dark:bg-pink-300/[0.06]',
  violet: 'shadow-[inset_3px_0_0_rgba(139,92,246,0.75)] bg-violet-500/[0.05] dark:bg-violet-300/[0.06]',
  amber: 'shadow-[inset_3px_0_0_rgba(245,158,11,0.8)] bg-amber-500/[0.05] dark:bg-amber-300/[0.05]',
  sky: 'shadow-[inset_3px_0_0_rgba(14,165,233,0.75)] bg-sky-500/[0.05] dark:bg-sky-300/[0.05]',
  lime: 'shadow-[inset_3px_0_0_rgba(101,163,13,0.8)] bg-lime-500/[0.05] dark:bg-lime-300/[0.05]',
};
export const SWATCH = DOT;

/** "● Roza": the person's name with their colour. */
export function PersonChip({ p, className = '' }: { p: MailPerson | null | undefined; className?: string }) {
  if (!p) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10.5px] font-bold leading-4 ${CHIP[p.color]} ${className}`} title={`From ${p.name}’s email`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[p.color]}`} />{p.name}<span className="sr-only"> (from their email)</span>
    </span>
  );
}

/** The soft left edge for someone else's mailbox (not the main account): add to the row's classes. */
// Every mailbox gets its coloured edge (owner's request: Roza pink, Anis blue).
export const personEdge = (p: MailPerson | null | undefined) => (p ? `${EDGE[p.color]} rounded-xl pl-2` : '');

/** "Person: All · Anis · Roza" (only when there are two mailboxes or more). */
export function PersonFilter({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts?: Record<string, number> }) {
  const people = usePeople();
  if (people.length < 2) return null;
  const opts = [{ id: 'all', name: 'All' as string, color: null as PersonColor | null }, ...people.map((p) => ({ id: p.email, name: p.name, color: p.color }))];
  return (
    <div className="strip flex items-center gap-1.5" role="group" aria-label="Person">
      <span className="label shrink-0 pl-1">Person</span>
      {opts.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`chip tap shrink-0 gap-1.5 px-3 py-1.5 ${value === o.id ? (o.color ? CHIP[o.color] : 'border-teal-500/40 bg-teal-500/10 text-teal-900 dark:border-teal-300/30 dark:text-teal-100') : 'border-slate-900/10 text-slate-600 dark:border-white/10 dark:text-slate-300'}`}>
          {o.color && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[o.color]}`} />}{o.name}{counts?.[o.id] != null && <span className="num text-[11px] opacity-70">{counts[o.id]}</span>}
        </button>
      ))}
    </div>
  );
}

/** Does this entry belong to the picked person ('all' = yes)? */
export const ofPerson = (p: MailPerson | null, pick: string) => pick === 'all' || p?.email === pick;
