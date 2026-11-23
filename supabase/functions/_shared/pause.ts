import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { MASTER_PAUSED_TEXT, masterSwitch } from './masterSwitch.ts';

/**
 * ⏸ Pause everything (the big red button at the top of the app): table `pauses`, one row per person.
 * While paused: no AI (also refused inside take_ai() in the database), no email, no automatic run, no Gmail/Calendar/bank
 * work, no phone texts. A failed read counts as paused (the safe side: nothing runs instead of everything).
 * 🎛️ Master (the owner's dashboard of all his apps) can pause LifeTracker too (`masterSwitch.ts`, fail-open): `isPaused`
 * is then true for everyone, while `pauseOf` stays this app's own button (the one Resume here turns off).
 */
export const PAUSED_TEXT = 'LifeTracker is paused (⏸). Press Resume at the top of the app first.';

export interface PauseState { paused: boolean; at: string | null }

export async function pauseOf(db: SupabaseClient, userId: string): Promise<PauseState> {
  const { data, error } = await db.from('pauses').select('paused, at').eq('user_id', userId).maybeSingle();
  if (error) return { paused: true, at: null };
  return { paused: !!data?.paused, at: (data?.at as string | undefined) ?? null };
}

export const isPaused = async (db: SupabaseClient, userId: string) => (await pauseOf(db, userId)).paused || (await masterSwitch()).work;

/** What to say when `isPaused` said yes: this app's own ⏸, or Master. */
export const pausedText = async (db: SupabaseClient, userId: string) => ((await pauseOf(db, userId)).paused ? PAUSED_TEXT : MASTER_PAUSED_TEXT);

export async function setPaused(db: SupabaseClient, userId: string, paused: boolean): Promise<PauseState> {
  const at = new Date().toISOString();
  const { error } = await db.from('pauses').upsert({ user_id: userId, paused, at }, { onConflict: 'user_id' });
  if (error) throw new Error(`Couldn’t ${paused ? 'pause' : 'resume'}: ${error.message}`);
  return { paused, at };
}
