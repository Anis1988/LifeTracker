import { useState } from 'react';
import { DATE_KINDS, dateKind, type LifeDate } from '../../supabase/functions/_shared/model.ts';
import { addCycle, daysBetween, today } from '../../supabase/functions/_shared/money.ts';
import { errText, shortDate, toast } from './ui';

/** 🎂 Important dates & car care: one row (also drawn in the Guide with made-up data). */
export function DateRow({ d, onOpen }: { d: LifeDate; onOpen?: () => void }) {
  const left = daysBetween(today(), d.next_date);
  const k = dateKind(d.kind);
  const when = left < 0 ? 'passed' : left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
  return (
    <button className="tap flex min-h-[60px] w-full items-center gap-3 rounded-[20px] px-1 py-2.5 text-left hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04]" onClick={onOpen}>
      <span className="tile !bg-pink-500/10" aria-hidden="true">{k.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{d.title}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{k.label} · {d.every_months ? (d.every_months === 12 ? 'every year' : `every ${d.every_months} months`) : 'once'}{d.notes ? ` · ${d.notes}` : ''}</span>
      </span>
      <span className={`shrink-0 text-right text-xs ${left >= 0 && left <= 7 ? 'font-bold text-pink-700 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400'}`}>{shortDate(d.next_date)}<br />{when}</span>
    </button>
  );
}

/** One-tap starters (the owner can change everything after). */
export const DATE_PRESETS: { label: string; d: Partial<LifeDate> }[] = [
  { label: '🎂 Birthday', d: { kind: 'birthday', title: 'Birthday: ', every_months: 12, remind_days: 7 } },
  { label: '🛢️ Oil change', d: { kind: 'car', title: 'Oil change', every_months: 6, remind_days: 7 } },
  { label: '🛞 Tire rotation', d: { kind: 'car', title: 'Tire rotation', every_months: 6, remind_days: 7 } },
  { label: '🦷 Dentist', d: { kind: 'health', title: 'Dentist check-up', every_months: 6, remind_days: 7 } },
  { label: '🩺 Yearly check-up', d: { kind: 'health', title: 'Yearly check-up', every_months: 12, remind_days: 14 } },
  { label: '🔥 HVAC filter', d: { kind: 'home', title: 'Change the HVAC filter', every_months: 3, remind_days: 3 } },
];

const addMonths = (d: string, n: number) => addCycle(d, 'monthly', n);

export function DateForm({ d, onSave, onDelete, onDone }: { d: Partial<LifeDate>; onSave: (d: Partial<LifeDate> & { title: string; next_date: string }) => Promise<unknown>; onDelete?: () => Promise<void>; onDone: () => void }) {
  const [x, setX] = useState<Partial<LifeDate>>({ kind: 'other', every_months: 12, remind_days: 3, next_date: d.every_months && d.kind !== 'birthday' ? addMonths(today(), d.every_months) : '', ...d });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<LifeDate>) => setX((c) => ({ ...c, ...p }));
  const save = async () => {
    setBusy(true);
    try { await onSave({ ...x, title: (x.title ?? '').trim(), next_date: x.next_date! }); toast('ok', 'Saved. You’ll get a heads-up before it.'); onDone(); } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      {!d.id && (
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => <button key={p.label} className="chip border-slate-900/10 px-3 py-1.5 dark:border-white/10" onClick={() => setX({ remind_days: 3, ...p.d, next_date: p.d.kind === 'birthday' ? '' : addMonths(today(), p.d.every_months ?? 12) })}>{p.label}</button>)}
        </div>
      )}
      <label className="block text-sm font-semibold">What<input className="input mt-1 w-full" value={x.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Mom’s birthday, Oil change" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">Kind
          <select className="input mt-1 w-full" value={x.kind} onChange={(e) => set({ kind: e.target.value })}>{DATE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}</select>
        </label>
        <label className="block text-sm font-semibold">Next date<input className="input mt-1 w-full" type="date" value={x.next_date ?? ''} onChange={(e) => set({ next_date: e.target.value })} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">Repeats
          <select className="input mt-1 w-full" value={x.every_months ?? 0} onChange={(e) => set({ every_months: Number(e.target.value) || null })}>
            <option value={0}>Once</option>{[1, 3, 4, 6, 12, 24, 36].map((m) => <option key={m} value={m}>{m === 12 ? 'Every year' : m === 24 ? 'Every 2 years' : m === 36 ? 'Every 3 years' : m === 1 ? 'Every month' : `Every ${m} months`}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Remind me
          <select className="input mt-1 w-full" value={x.remind_days ?? 3} onChange={(e) => set({ remind_days: Number(e.target.value) })}>{[0, 1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n === 0 ? 'On the day' : `${n} day${n > 1 ? 's' : ''} before`}</option>)}</select>
        </label>
      </div>
      <label className="block text-sm font-semibold">Notes<input className="input mt-1 w-full" value={x.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} placeholder="e.g. every 5,000 miles, gift idea…" /></label>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy || !(x.title ?? '').trim() || !x.next_date} onClick={() => void save()}>{busy ? <span className="spinner" /> : 'Save'}</button>
        {onDelete && <button className="btn text-red-700 dark:text-red-300" onClick={() => void (confirm('Delete this date?') && onDelete().then(onDone))}>Delete</button>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">It also goes in your LifeTracker Google Calendar (repeating), with a reminder.</p>
    </div>
  );
}
