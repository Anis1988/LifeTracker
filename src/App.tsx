import { useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { APP_AUTH_REDIRECT, isNative, setupNativeLinks } from './lib/native';
import { AppUpdateCheck } from './components/AppUpdate';
import type { Session } from '@supabase/supabase-js';
import { configured, secretKey, siteUrl, supabase } from './lib/supabase';
import { StoreProvider, useStore } from './lib/store';
import { Toasts, errText, toast } from './components/ui';
import { Home } from './pages/Home';
import { MoneyPage } from './pages/Money';
import { Inbox } from './pages/Inbox';
import { Settings } from './pages/Settings';
import { Guide } from './pages/Guide';
import { Me } from './pages/Me';

// Tabs (line icons, like the rest of the Aurora look). Guide sits in the header.
const TABS = [
  { id: 'home', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { id: 'money', label: 'Money', icon: 'M3 7h18v12H3zM3 11h18M7 15h3M16 7V5H5v2' },
  { id: 'me', label: 'Me', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
  { id: 'inbox', label: 'Inbox', icon: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5' },
  { id: 'settings', label: 'Settings', icon: 'M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4' },
] as const;
type Tab = (typeof TABS)[number]['id'] | 'guide';
const tabOf = (): Tab => (location.hash.startsWith('#/guide') ? 'guide' : location.hash.startsWith('#/bills') ? 'money' : TABS.find((t) => location.hash.startsWith(`#/${t.id}`))?.id ?? 'home');

const Icon = ({ d, className = 'h-[22px] w-[22px]' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>
);

/** The slow emerald / teal / amber glow behind everything (still when the phone asks for less motion). */
function Aurora() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-32 -top-36 h-[360px] w-[440px] rounded-full bg-emerald-300 opacity-50 blur-[80px] animate-[drift1_18s_ease-in-out_infinite] dark:bg-emerald-500 dark:opacity-30" />
      <div className="absolute -right-40 top-32 h-[320px] w-[400px] rounded-full bg-teal-200 opacity-50 blur-[90px] animate-[drift2_22s_ease-in-out_infinite] dark:bg-teal-500 dark:opacity-25" />
      <div className="absolute -bottom-32 left-10 h-[260px] w-[340px] rounded-full bg-amber-200 opacity-40 blur-[100px] animate-[drift1_26s_ease-in-out_infinite] dark:bg-amber-500 dark:opacity-[0.12]" />
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!configured) return setSession(null);
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    // Android app: the sign-in link (email or Google) opens lifetracker://auth?code=… → finish signing in here.
    setupNativeLinks();
    const h = isNative() ? NativeApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(APP_AUTH_REDIRECT)) return;
      void Browser.close().catch(() => undefined);
      const q = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
      const h2 = new URLSearchParams(url.split('#')[1] ?? '');
      const code = q.get('code');
      const err = q.get('error_description') ?? h2.get('error_description');
      if (err) return toast('err', err.replace(/\+/g, ' '));
      if (code) void supabase.auth.exchangeCodeForSession(code).then(({ error }) => error && toast('err', `Sign-in: ${error.message}`));
    }) : null;
    return () => { data.subscription.unsubscribe(); void h?.then((x) => x.remove()); };
  }, []);
  if (secretKey) return <Shell><p className="card text-sm text-red-700 dark:text-red-300">This site was built with the Supabase <b>secret</b> key. Replace VITE_SUPABASE_ANON_KEY with the publishable (anon) key, revoke the secret key in Supabase, and deploy again.</p></Shell>;
  if (!configured) return <Shell><p className="card text-sm">This copy isn’t linked to Supabase yet: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).</p></Shell>;
  if (session === undefined) return <Shell><p className="text-sm text-stone-500"><span className="spinner" /> Loading…</p></Shell>;
  if (!session) return <Shell><Login /></Shell>;
  return <StoreProvider session={session}><Main /></StoreProvider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Aurora />
      <div className="mb-6 flex items-center gap-2"><img src="./icon.svg" alt="" className="h-9 w-9" /><span className="font-display text-2xl font-semibold">LifeTracker</span></div>
      {children}
      <p className="mt-6 text-center text-xs text-stone-500"><a className="underline" href="./privacy.html">Privacy</a> · <a className="underline" href="./terms.html">Terms</a></p>
      <Toasts />
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  // The email has a link AND a code: the code works everywhere (also when a link can't come back to the app).
  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) toast('err', /expired|invalid/i.test(error.message) ? 'That code didn’t work (wrong or too old). Ask for a new email.' : error.message);
  };
  const link = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: isNative() ? APP_AUTH_REDIRECT : siteUrl() } });
    setBusy(false);
    if (error) toast('err', error.message); else setSent(true);
  };
  const google = async () => {
    // In the app, Google opens in the phone's browser and comes back with lifetracker://auth.
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: isNative() ? APP_AUTH_REDIRECT : siteUrl(), skipBrowserRedirect: isNative() } });
    if (error) toast('err', errText(error));
    else if (isNative() && data.url) void Browser.open({ url: data.url });
  };
  return (
    <div className="card space-y-3">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="text-sm text-stone-600 dark:text-slate-300">Your bills, subscriptions, mortgage and insurance, all in one place.</p>
      <button className="btn w-full" onClick={() => void google()}>Continue with Google</button>
      <div className="flex items-center gap-2 text-xs text-stone-400"><span className="h-px flex-1 bg-stone-200 dark:bg-slate-800" />or<span className="h-px flex-1 bg-stone-200 dark:bg-slate-800" /></div>
      {sent ? (
        <div className="space-y-2">
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">Check your email: tap the link, or type the code from the email here.</p>
          <input className="input num w-full text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && code.length >= 6 && void verify()} aria-label="Code from the email" />
          <button className="btn-primary w-full" disabled={busy || code.length < 6} onClick={() => void verify()}>{busy ? <span className="spinner" /> : 'Sign in with the code'}</button>
          <button className="btn-ghost w-full justify-center text-xs" onClick={() => { setSent(false); setCode(''); }}>Use another email or send again</button>
        </div>
      ) : (
        <>
          <input className="input w-full" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void link()} aria-label="Email" />
          <button className="btn-primary w-full" disabled={busy || !/\S+@\S+\.\S+/.test(email)} onClick={() => void link()}>{busy ? <span className="spinner" /> : 'Email me a sign-in link'}</button>
        </>
      )}
    </div>
  );
}

function Main() {
  const st = useStore();
  const [tab, setTab] = useState<Tab>(tabOf());
  useEffect(() => {
    const f = () => setTab(tabOf());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = (t: string) => { location.hash = `#/${t}`; window.scrollTo(0, 0); };
  // Android app: the back button closes an open panel, then goes back to Home, then puts the app away.
  // Coming back to the app (e.g. after connecting Google in the browser) refreshes everything.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    if (!isNative()) return;
    const back = NativeApp.addListener('backButton', () => {
      if (document.querySelector('[role="dialog"]')) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (tabRef.current !== 'home') go('home');
      else void NativeApp.minimizeApp();
    });
    const resume = NativeApp.addListener('resume', () => { void st.reload().catch(() => undefined); void st.reloadStatus(); });
    return () => { void back.then((x) => x.remove()); void resume.then((x) => x.remove()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Me: worrying pages, people-search listings and breaches still to handle.
  const meCount = st.findings.filter((f) => (f.kind === 'web' && f.status === 'new' && f.verdict === 'worrying') || (f.kind === 'broker' && f.status === 'listed') || (f.kind === 'breach' && f.status === 'new')).length;
  const badge = (t: Tab): number => (t === 'inbox' ? st.suggestions.length : t === 'me' ? meCount : 0);
  return (
    <div className="min-h-screen pb-28 sm:pb-10">
      <Aurora />
      <header className="sticky top-0 z-30 border-b border-slate-900/5 bg-[#f3f6f5]/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#070b14]/70" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <img src="./icon.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-xl font-semibold tracking-tight">LifeTracker</span>
          <nav className="ml-auto hidden gap-1 rounded-2xl border border-slate-900/[0.07] bg-white/60 p-1 dark:border-white/10 dark:bg-white/[0.04] sm:flex" aria-label="Tabs">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined} className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${tab === t.id ? 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-emerald-950' : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/[0.06]'}`}>
                <Icon d={t.icon} className="h-[18px] w-[18px]" />{t.label}{badge(t.id) ? <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-900">{badge(t.id)}</span> : null}
              </button>
            ))}
          </nav>
          <button onClick={() => go('guide')} aria-label="Guide" className={`ml-auto flex h-11 w-11 items-center justify-center rounded-2xl border transition sm:ml-1 ${tab === 'guide' ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300' : 'border-slate-900/10 bg-white/60 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'}`}>
            <Icon d="M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <AppUpdateCheck />
        {st.loading ? <p className="text-sm text-slate-500"><span className="spinner" /> Loading…</p>
          : tab === 'home' ? <Home go={go} /> : tab === 'money' ? <MoneyPage /> : tab === 'inbox' ? <Inbox /> : tab === 'me' ? <Me go={go} /> : tab === 'settings' ? <Settings /> : <Guide />}
      </main>
      {/* Phones: a floating glass tab bar within thumb reach. */}
      <nav aria-label="Tabs" style={{ bottom: 'calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }} className="fixed inset-x-3 z-30 grid grid-cols-5 rounded-[26px] border border-slate-900/[0.07] bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0c1220]/80 dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] sm:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined} className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${tab === t.id ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon d={t.icon} />{t.label}
            <span aria-hidden="true" className={`h-1 w-1 rounded-full ${tab === t.id ? 'bg-emerald-600 shadow-[0_0_8px_#10b981] dark:bg-emerald-300' : 'bg-transparent'}`} />
            {badge(t.id) ? <span className="absolute right-[16%] top-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">{badge(t.id)}</span> : null}
          </button>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
