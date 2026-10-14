import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

/**
 * 💬 Appointment texts (Android app). Google Messages can't be read by a website: the app's own "Texts" plugin
 * (TextsPlugin.java) and SMS receiver (TextWatch.java) do it. Every text is checked on the phone first (the same
 * free check as the server); only ones that look like appointments are sent, with the app's own key, to the
 * "texts" server function, which puts them in your calendar. On main this file is a stub (the website can't).
 */
export interface Text { from: string; body: string; at: number }
export interface TextsState { supported: boolean; on: boolean; allowed: boolean; queued: number }

interface TextsPlugin {
  state(): Promise<{ on: boolean; allowed: boolean; queued: number }>;
  enable(o: { key: string; url: string }): Promise<{ on: boolean; allowed: boolean; queued: number }>;
  disable(): Promise<void>;
  recent(o: { days: number }): Promise<{ texts: Text[] }>;
  flush(): Promise<{ sent: number }>;
}
const Texts = registerPlugin<TextsPlugin>('Texts');

export const textsState = async (): Promise<TextsState> => {
  if (!isNative()) return { supported: false, on: false, allowed: false, queued: 0 };
  try { return { supported: true, ...(await Texts.state()) }; } catch { return { supported: false, on: false, allowed: false, queued: 0 }; }
};
/** Asks for the SMS (and notification) permission, then keeps the key on the phone for the SMS receiver. */
export const textsOn = async (key: string, url: string): Promise<TextsState> => ({ supported: true, ...(await Texts.enable({ key, url })) });
export const textsOff = async (): Promise<void> => { if (isNative()) await Texts.disable(); };
/** Texts from the last `days` days that pass the free appointment check (read on the phone). */
export const recentTexts = async (days: number): Promise<Text[]> => (await Texts.recent({ days })).texts;
/** Sends texts that couldn't be sent when they arrived (no internet). */
export const flushTexts = async (): Promise<void> => { if (isNative()) await Texts.flush().catch(() => undefined); };
