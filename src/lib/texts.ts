/**
 * 💬 Appointment texts. Google Messages can't be read by a website, so only the Android app (branch "android",
 * which has the real version of this file) can do it. On the website: not available, and these do nothing.
 */
export interface Text { from: string; body: string; at: number }
export interface TextsState { supported: boolean; on: boolean; allowed: boolean; queued: number }

export const textsState = async (): Promise<TextsState> => ({ supported: false, on: false, allowed: false, queued: 0 });
export const textsOn = async (_key: string, _url: string): Promise<TextsState> => { throw new Error('Only the LifeTracker Android app can read texts.'); };
export const textsOff = async (): Promise<void> => undefined;
/** Texts from the last `days` days that pass the free appointment check (read on the phone). */
export const recentTexts = async (_days: number): Promise<Text[]> => [];
/** Sends texts that couldn't be sent when they arrived (no internet). */
export const flushTexts = async (): Promise<void> => undefined;
