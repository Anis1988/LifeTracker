import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** True inside the Android app, false on the website. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** The app's own link: the sign-in page below hands the one-time code back to the app with it. */
export const APP_AUTH_REDIRECT = 'lifetracker://auth';
/**
 * Where the email link and Google send you after signing in (a page on the website, public/app-login.html). It has
 * one button that opens the app with the code: Android reliably opens an app from a tap, not from a redirect.
 * Supabase → Authentication → URL configuration → Redirect URLs must allow it.
 */
export const APP_LOGIN_PAGE = (import.meta.env.VITE_APP_LOGIN_PAGE as string | undefined) || 'https://anis1988.github.io/LifeTracker/app-login.html';

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
