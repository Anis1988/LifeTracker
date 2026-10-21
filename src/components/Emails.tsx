import { Field, Toggle } from './ui';
import { EMAIL_KINDS, EMAIL_OFTEN } from '../../supabase/functions/_shared/emails.ts';
import type { Settings } from '../../supabase/functions/_shared/model.ts';

/**
 * ✉️ Settings → Emails to me (owner's request: fewer emails). The server sends at most one email a day (or a week)
 * with only the kinds switched on. Also drawn in the Guide with made-up choices (no onChange = nothing to tap).
 */
export function EmailControls({ s, weekDay, canSend = true, to, last, onChange }: {
  s: Settings['emails']; weekDay: string; canSend?: boolean; to?: string; last?: { lastSent: string | null; lastSubject: string | null } | null;
  onChange?: (e: Settings['emails']) => void;
}) {
  const live = !!onChange;
  const off = !s.on || s.often === 'never';
  return (
    <div className="space-y-2">
      <Field label="Automatic emails" hint={canSend ? (to ? `To ${to}.` : undefined) : 'Needs RESEND_API_KEY on the server (free at resend.com).'}>
        <Toggle on={s.on} disabled={!live} onChange={(v) => onChange?.({ ...s, on: v })} label="Automatic emails" />
      </Field>
      <div className={off && !s.on ? 'opacity-50' : ''}>
        <p className="label px-1 pb-1.5 pt-1">How often, at most</p>
        <div className="grid gap-1.5" role="radiogroup" aria-label="How often, at most">
          {EMAIL_OFTEN.map((o) => {
            const on = s.often === o.id;
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} tabIndex={live ? undefined : -1} disabled={!s.on && live} onClick={() => onChange?.({ ...s, often: o.id })}
                className={`tap flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left ${on ? 'border-teal-500/50 bg-teal-500/10 dark:border-teal-300/40 dark:bg-teal-300/10' : 'border-slate-900/[0.08] dark:border-white/[0.08]'}`}>
                <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-teal-600 dark:border-teal-300' : 'border-slate-400 dark:border-slate-500'}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-teal-600 dark:bg-teal-300" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</span>
                  <span className="block text-xs leading-snug text-slate-500 dark:text-slate-400">{o.id === 'weekly' ? `One email on ${weekDay}s with the week’s news.` : o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={off ? 'opacity-50' : ''}>
        <p className="label px-1 pb-0.5 pt-2">What can be in it</p>
        {EMAIL_KINDS.map((k) => (
          <Field key={k.id} label={`${k.icon} ${k.label}`} hint={k.id === 'week' ? `${k.hint.replace('your chosen day', weekDay)}` : k.hint}>
            <Toggle on={s.kinds[k.id]} disabled={!live || off} onChange={(v) => onChange?.({ ...s, kinds: { ...s.kinds, [k.id]: v } })} label={k.label} />
          </Field>
        ))}
      </div>
      <p className="rounded-2xl bg-teal-500/[0.07] px-3 py-2 text-xs leading-snug text-slate-600 dark:bg-teal-300/[0.06] dark:text-slate-300">Everything still shows in the app (🔔 and Home). This only limits emails: never more than one a day, and only things you haven’t already seen in the app.</p>
      {last !== undefined && <p className="px-1 text-xs text-slate-500 dark:text-slate-400">{last?.lastSent ? <>Last email: <span className="num">{new Date(last.lastSent).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>{last.lastSubject ? ` · “${last.lastSubject.replace(/^LifeTracker:\s*/, '')}”` : ''}</> : 'No automatic email sent yet.'}</p>}
    </div>
  );
}
