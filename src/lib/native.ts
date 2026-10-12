import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** True inside the Android app, false on the website. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Where sign-in links come back to in the app (Supabase → Authentication → URL configuration → Redirect URLs). */
export const APP_AUTH_REDIRECT = 'lifetracker://auth';

/** Opens a page in the phone's browser (app) or goes there (website). */
export function openExternal(url: string): void {
  if (isNative()) void Browser.open({ url });
  else window.location.href = url;
}

/**
 * In the app, links to other sites (removal pages, a bank, Google…) open in the phone's browser instead of
 * replacing LifeTracker's screen; window.open does the same.
 */
export function setupNativeLinks(): void {
  if (!isNative()) return;
  window.open = ((url?: string | URL) => { if (url) void Browser.open({ url: String(url) }); return null; }) as typeof window.open;
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a');
    const href = a?.getAttribute('href') ?? '';
    if (!a || !/^https?:\/\//i.test(href)) return;
    try { if (new URL(href).origin === location.origin) return; } catch { return; }
    e.preventDefault();
    void Browser.open({ url: href });
  }, true);
}
