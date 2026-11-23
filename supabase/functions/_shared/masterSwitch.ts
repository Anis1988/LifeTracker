/**
 * 🎛️ Master's kill switch. Master is the owner's dashboard of all his apps (github.com/Anis1988/MasterApp).
 * This asks Master whether the app is paused (`work`) or its AI is switched off (`ai`; "AI off everywhere"
 * in Master switches it off in every app at once).
 *
 * Fail-open: when Master can't be reached or answers nonsense, the app carries on as normal.
 * One question per 30 s per function instance (Deno), 1.5 s at most. `MASTER_SWITCH=off` turns the check off;
 * `MASTER_URL` points it at another Master address.
 */
const APP_ID = 'lifetracker';
const masterUrl = () => (Deno.env.get('MASTER_URL')?.trim() || 'https://master-app-anis-s-team1.vercel.app').replace(/\/$/, '');

export interface MasterSwitch { ai: boolean; work: boolean }

export const MASTER_AI_TEXT = 'The AI is paused from Master (your apps dashboard) right now. Turn it back on there, or try again later.';
export const MASTER_PAUSED_TEXT = 'This app is paused from Master (your apps dashboard). Resume it there.';

let last: { at: number; s: MasterSwitch } | null = null;

export async function masterSwitch(): Promise<MasterSwitch> {
  if (Deno.env.get('MASTER_SWITCH') === 'off') return { ai: false, work: false };
  if (last && Date.now() - last.at < 30_000) return last.s;
  try {
    const res = await fetch(`${masterUrl()}/api/flags?app=${APP_ID}`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) throw new Error(`Master answered ${res.status}`);
    const j = (await res.json()) as Partial<MasterSwitch>;
    last = { at: Date.now(), s: { ai: j.ai === true, work: j.work === true } };
  } catch {
    last = { at: Date.now(), s: last?.s ?? { ai: false, work: false } };
  }
  return last.s;
}

export class PausedByMaster extends Error {
  status = 423;
  constructor(what: 'ai' | 'work') {
    super(what === 'ai' ? MASTER_AI_TEXT : MASTER_PAUSED_TEXT);
  }
}

/** Throws (HTTP 423) when Master says stop: 'ai' before a paid AI call, 'work' before a scheduled job, email or push. */
export async function stopIfPaused(what: 'ai' | 'work'): Promise<void> {
  const s = await masterSwitch();
  if (what === 'ai' ? s.ai || s.work : s.work) throw new PausedByMaster(what);
}
