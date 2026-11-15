import { useCallback, useEffect, useState } from 'react';
import { api, supabase } from '../lib/supabase';
import { errText, toast } from './ui';

/**
 * ⏸ Pause everything (owner's request: a big red button at the top). The state is the `pauses` row (read here with
 * Row Level Security), changed only through the server (api "pause"). While paused the server refuses every AI call,
 * email, Gmail/Calendar/bank job, automatic run and phone text, until Resume.
 */
export interface PauseState { paused: boolean; at: string | null }

const EVT = 'lt-pause';

export function usePause() {
  const [p, setP] = useState<PauseState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('pauses').select('paused, at').maybeSingle();
    if (!error) setP({ paused: !!data?.paused, at: (data?.at as string | undefined) ?? null });
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    const onChange = (e: Event) => setP((e as CustomEvent<PauseState>).detail);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(EVT, onChange);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener(EVT, onChange); };
  }, [load]);
  const flip = async (paused: boolean) => {
    setBusy(true);
    try {
      const r = await api<PauseState & { ok: boolean }>('pause', { on: paused });
      const next = { paused: r.paused, at: r.at };
      window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
      toast(paused ? 'info' : 'ok', paused ? 'Paused. Nothing runs until you press Resume.' : 'Resumed. Everything works again.');
    } catch (e) {
      toast('err', `${paused ? 'Pause' : 'Resume'} didn’t work: ${errText(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return { p, busy, flip };
}
export type Pause = ReturnType<typeof usePause>;

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The big red button in the header (green Resume while paused). Phones: "Pause", bigger screens: "Pause all". */
export function PauseButton({ state, className = '' }: { state: Pause; className?: string }) {
  const { p, busy, flip } = state;
  if (!p) return null;
  return p.paused ? (
    <button onClick={() => flip(false)} disabled={busy} aria-label="Resume LifeTracker" title="Resume: everything works again"
      className={`tap inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-emerald-600/30 bg-emerald-500 px-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_18px_-4px_rgba(16,185,129,0.8)] disabled:opacity-60 dark:border-emerald-300/40 dark:text-emerald-950 sm:px-4 ${className}`}>
      <span aria-hidden="true">▶</span> Resume
    </button>
  ) : (
    <button onClick={() => flip(true)} disabled={busy} aria-label="Pause everything: stop AI, emails and automatic runs" title="Pause everything: no AI, no emails, no automatic runs until you resume"
      className={`tap inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-red-700/30 bg-red-600 px-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_18px_-4px_rgba(239,68,68,0.9)] hover:bg-red-500 disabled:opacity-60 dark:border-red-300/40 sm:px-4 ${className}`}>
      <span aria-hidden="true" className="text-base leading-none">⏸</span> Pause<span className="hidden sm:inline">&nbsp;all</span>
    </button>
  );
}

/** Red bar under the header on every page while paused. */
export function PausedBanner({ state }: { state: Pause }) {
  const { p, busy, flip } = state;
  if (!p?.paused) return null;
  return (
    <div role="status" className="border-b border-red-700/30 bg-red-600 text-white dark:border-red-400/30 dark:bg-red-700">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-sm">
          <b className="font-extrabold">⏸ PAUSED{p.at ? ` since ${when(p.at)}` : ''}.</b>{' '}
          No AI, no emails, no email checks, no bank or calendar updates and no automatic runs until you resume.
        </p>
        <button onClick={() => flip(false)} disabled={busy} className="tap min-h-[44px] rounded-2xl bg-white px-4 text-sm font-extrabold text-red-700 disabled:opacity-60">▶ Resume</button>
      </div>
    </div>
  );
}
