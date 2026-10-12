import { useEffect, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { isNative } from '../lib/native';

/** The Android app's build number (GitHub run number), set when GitHub builds the app. 0 on the website. */
export const APP_BUILD = Number(import.meta.env.VITE_APP_BUILD ?? 0) || 0;
const RELEASE_API = 'https://api.github.com/repos/Anis1988/LifeTracker/releases/tags/android-latest';
const SKIP_KEY = 'lt.skipAppBuild';
const CHECK_EVERY = 30 * 60_000;

export interface AppRelease { build: number; url: string }

/** The newest app on the "android-latest" release page (free, no login: the repo is public). */
export async function latestApp(): Promise<AppRelease | null> {
  const r = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) return null;
  const j = await r.json();
  const build = Number(String(j?.body ?? '').match(/run (\d+)/)?.[1] ?? 0);
  const url = (j?.assets ?? []).find((a: { name?: string }) => a.name === 'LifeTracker.apk')?.browser_download_url;
  return build && typeof url === 'string' ? { build, url } : null;
}

/** "Update available" (also drawn in the Guide with made-up numbers). */
export function UpdateBanner({ have, next, onUpdate, onLater }: { have: number; next: number; onUpdate?: () => void; onLater?: () => void }) {
  return (
    <section className="card mb-4 flex flex-wrap items-center gap-3 !border-emerald-500/40 text-sm">
      <div className="min-w-[14rem] flex-1">
        <p className="label !text-emerald-700 dark:!text-emerald-300">Update available</p>
        <p>Version 1.0.{next} is ready (you have 1.0.{have}). Your data stays.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" onClick={onUpdate}>Update</button>
        <button className="btn" onClick={onLater}>Later</button>
      </div>
    </section>
  );
}

/** In the Android app: looks for a newer version when the app opens or comes back (at most every 30 minutes). */
export function AppUpdateCheck() {
  const [next, setNext] = useState<AppRelease | null>(null);
  useEffect(() => {
    if (!isNative() || !APP_BUILD) return;
    let last = 0;
    const check = () => {
      if (Date.now() - last < CHECK_EVERY) return;
      last = Date.now();
      latestApp()
        .then((r) => {
          let skipped = 0;
          try { skipped = Number(localStorage.getItem(SKIP_KEY) ?? 0); } catch { /* ignore */ }
          setNext(r && r.build > APP_BUILD && r.build !== skipped ? r : null);
        })
        .catch(() => undefined); // offline or GitHub busy: try again later
    };
    check();
    const h = NativeApp.addListener('resume', check);
    return () => void h.then((x) => x.remove());
  }, []);
  if (!next) return null;
  return (
    <UpdateBanner have={APP_BUILD} next={next.build}
      onUpdate={() => void Browser.open({ url: next.url })}
      onLater={() => { try { localStorage.setItem(SKIP_KEY, String(next.build)); } catch { /* ignore */ } setNext(null); }} />
  );
}
