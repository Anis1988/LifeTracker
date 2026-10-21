import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { Seg } from './ui';
import { settingsHref } from './SettingsGrid';
import { MAIL_EVERY, nextMailCheck, type MailCheck } from '../../supabase/functions/_shared/model.ts';

/** 📬 Email checks: the choices (minutes; 0 = Off, daily run only). */
const LABELS: Record<number, string> = { 15: '15m', 30: '30m', 60: '1h', 120: '2h', 240: '4h', 0: 'Off' };
const longEvery = (n: number) => (n < 60 ? `${n} min` : n === 60 ? 'hour' : `${n / 60} hr`);

/** "10:30 AM" today, "Mon 10:30 AM" another day (the phone's own time). */
function short(ms: number, now: number): string {
  const d = new Date(ms);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date(now).toDateString() ? t : `${d.toLocaleDateString([], { weekday: 'short' })} ${t}`;
}

/** The picker in Settings → 📬 Email checks (also drawn in the Guide). */
export function MailEveryPicker({ every, onChange }: { every: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-2">
      <Seg label="How often to check email" value={String(every)} onChange={(v) => onChange(Number(v))} options={MAIL_EVERY.map((n) => [String(n), LABELS[n]] as [string, string])} className="w-full" />
      <p className="text-xs text-slate-500 dark:text-slate-400">Always on the quarter hour (:00, :15, :30, :45). Gmail allows far more; each check reads only new emails; AI limits stay the same. Off = only in the morning run.</p>
    </div>
  );
}

/** The slim status line: "📬 Checks email every 15 min · last 10:30 ✓ 3 new · next 10:45" (or "📬 Email: daily only"). */
export function MailPill({ every, check, now = Date.now(), href, label = true }: { every: number; check?: MailCheck | null; now?: number; href?: string; label?: boolean }) {
  const next = nextMailCheck(every, now);
  const mark = check ? (check.state === 'ok' ? '✓' : check.state === 'slow' ? '⏸' : '⚠') : '';
  const tone = check?.state === 'err' ? 'text-amber-700 dark:text-amber-300' : check?.state === 'slow' ? 'text-slate-600 dark:text-slate-300' : 'text-emerald-700 dark:text-emerald-300';
  const body = (
    <span className="glass flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs text-slate-600 dark:text-slate-300">
      <span aria-hidden="true">📬</span>
      {!every ? <span className="truncate">Email: daily only</span> : (<>
        {/* On phones the found-text shrinks first, so "next" always stays in view. */}
        <span className="shrink-0 whitespace-nowrap"><span className={label ? 'hidden sm:inline' : 'hidden'}>Checks email </span>every {longEvery(every)}</span>
        {check && <span className="min-w-0 truncate">· <span className="hidden sm:inline">last </span><span className="num">{short(Date.parse(check.at), now)}</span> <span className={tone}>{mark} {check.text}</span></span>}
        {next && <span className="shrink-0 whitespace-nowrap">· next <span className="num">{short(next, now)}</span></span>}
      </>)}
    </span>
  );
  return href
    ? <a href={href} className="tap -my-2 flex min-h-[44px] min-w-0 max-w-full items-center rounded-full py-2" aria-label="Email checks: open the setting">{body}</a>
    : <span className="flex min-w-0 max-w-full">{body}</span>;
}

/** Under the header on every tab: shown once Gmail is connected; refreshes itself just after each check. */
export function MailCheckBar() {
  const st = useStore();
  const [now, setNow] = useState(() => Date.now());
  const every = st.settings.mail.every;
  const g = st.status;
  const on = !!g && (!!(g.google.connected && g.google.gmail) || !!g.googleExtras?.some((x) => x.on && x.gmail));
  const { reloadStatus } = st;
  // A tick each minute keeps "next" right; 2 min after a check slot passes, the new "last" is fetched.
  const [waitFor, setWaitFor] = useState(() => nextMailCheck(every, Date.now()));
  useEffect(() => { setWaitFor(nextMailCheck(every, Date.now())); }, [every]);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [on]);
  useEffect(() => {
    if (!on || waitFor == null || now < waitFor + 120_000) return;
    setWaitFor(nextMailCheck(every, now));
    void reloadStatus();
  }, [on, now, waitFor, every, reloadStatus]);
  if (!on) return null;
  return (
    <div className="mx-auto flex max-w-5xl justify-center px-4 pt-2 sm:justify-end">
      <MailPill every={every} check={g?.mail?.check} now={now} href={settingsHref('checks')} />
    </div>
  );
}
