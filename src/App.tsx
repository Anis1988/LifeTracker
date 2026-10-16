import { useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { APP_AUTH_REDIRECT, APP_LOGIN_PAGE, isNative, setupNativeLinks } from './lib/native';
import { AppUpdateCheck } from './components/AppUpdate';
import type { Session } from '@supabase/supabase-js';
import { configured, secretKey, siteUrl, supabase } from './lib/supabase';
import { StoreProvider, useStore } from './lib/store';
import { Aurora, Skeleton, Toasts, errText, toast } from './components/ui';
import { Home } from './pages/Home';
import { MoneyPage } from './pages/Money';
import { Inbox } from './pages/Inbox';
import { Settings } from './pages/Settings';
import { Guide } from './pages/Guide';
import { Me } from './pages/Me';
import { Contacts } from './pages/Contacts';
import { appsUrl } from './lib/links';
import { pushWidget } from './lib/widget';
import { timeline } from './lib/timeline';

// Tabs (line icons, like the rest of the Liquid Glass look). Guide sits in the header.
const TABS = [
  { id: 'home', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { id: 'money', label: 'Money', icon: 'M3 7h18v12H3zM3 11h18M7 15h3M16 7V5H5v2' },
  { id: 'contacts', label: 'Contacts', icon: 'M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12.5 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 17a4 4 0 0 1 8 0M4 7.5h2M4 12h2M4 16.5h2' },
  { id: 'me', label: 'Me', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
  { id: 'inbox', label: 'Inbox', icon: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5' },
  { id: 'settings', label: 'Settings', icon: 'M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4' },
] as const;
type Tab = (typeof TABS)[number]['id'] | 'guide';
const tabOf = (): Tab => (location.hash.startsWith('#/guide') ? 'guide' : location.hash.startsWith('#/bills') ? 'money' : TABS.find((t) => location.hash.startsWith(`#/${t.id}`))?.id ?? 'home');

const Icon = ({ d, className = 'h-[22px] w-[22px]' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>
);

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
  if (session === undefined) return <Shell><Skeleton /></Shell>;
  if (!session) return <Shell><Login /></Shell>;
  return <StoreProvider session={session}><Main /></StoreProvider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Aurora />
      <div className="mb-6 flex items-center gap-2"><img src="./icon.svg" alt="" className="h-9 w-9" /><span className="font-display text-2xl font-semibold">LifeTracker</span></div>
      {children}
      <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400"><a className="underline" href="./privacy.html">Privacy</a> · <a className="underline" href="./terms.html">Terms</a></p>
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
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: isNative() ? APP_LOGIN_PAGE : siteUrl() } });
    setBusy(false);
    if (error) toast('err', error.message); else setSent(true);
  };
  const google = async () => {
    // In the app, Google opens in the phone's browser and comes back with lifetracker://auth.
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: isNative() ? APP_LOGIN_PAGE : siteUrl(), skipBrowserRedirect: isNative() } });
    if (error) toast('err', errText(error));
    else if (isNative() && data.url) void Browser.open({ url: data.url });
  };
  return (
    <div className="card space-y-3">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">Your bills, subscriptions, mortgage and insurance, all in one place.</p>
      <button className="btn w-full" onClick={() => void google()}>Continue with Google</button>
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500"><span className="h-px flex-1 bg-slate-900/[0.07] dark:bg-white/[0.08]" />or<span className="h-px flex-1 bg-slate-900/[0.07] dark:bg-white/[0.08]" /></div>
      {sent ? (
        <div className="space-y-2">
          <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100">{isNative() ? 'Check your email on this phone: tap the link, then “Open in the LifeTracker app”. (Or type the code if the email has one.)' : 'Check your email: tap the link, or type the code from the email here.'}</p>
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
  // 🗓️ Android "Coming up" widget: the next bills, appointments and dates, sent each time the data loads.
  useEffect(() => {
    if (st.loading) return;
    pushWidget(timeline({ items: st.items, papers: st.settings.papers.on ? st.papers : [], dates: st.dates, purchases: st.purchases, appts: st.appts }, 30));
  }, [st.loading, st.items, st.papers, st.dates, st.purchases, st.appts, st.settings.papers.on]);
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
    <div className="min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pb-10">
      <Aurora />
      <header className="sticky top-0 z-30 border-b border-slate-900/5 bg-[#eaeff6]/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#060912]/70" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <img src="./icon.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-xl font-semibold tracking-tight">LifeTracker</span>
          <nav className="glass ml-auto hidden gap-1 rounded-2xl p-1 sm:flex" aria-label="Tabs">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined} aria-label={t.label} title={t.label} className={`tap tabbtn flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold ${tab === t.id ? 'bg-white text-slate-900 shadow-[0_0_20px_-6px_#5eead4] dark:bg-white/[0.12] dark:text-white' : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/[0.06]'}`}>
                <Icon d={t.icon} className="h-[18px] w-[18px]" /><span className="hidden lg:inline">{t.label}</span>{badge(t.id) ? <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-900">{badge(t.id)}</span> : null}
              </button>
            ))}
          </nav>
          <a href={appsUrl()} aria-label="My apps" title="My apps" className="btn ml-auto h-11 w-11 !p-0 text-slate-600 dark:text-slate-300 sm:ml-1">
            <Icon d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" className="h-5 w-5" />
          </a>
          <button onClick={() => go('guide')} aria-label="Guide" className={`btn ml-1 h-11 w-11 !p-0 ${tab === 'guide' ? '!border-teal-500 text-teal-700 shadow-[0_0_18px_-4px_#5eead4] dark:!border-teal-300 dark:text-teal-200' : 'text-slate-600 dark:text-slate-300'}`}>
            <Icon d="M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main key={tab} className="mx-auto max-w-5xl px-4 pb-6 pt-5">
        <AppUpdateCheck />
        {st.loading ? <Skeleton />
          : tab === 'home' ? <Home go={go} /> : tab === 'money' ? <MoneyPage /> : tab === 'inbox' ? <Inbox /> : tab === 'me' ? <Me go={go} /> : tab === 'contacts' ? <Contacts /> : tab === 'settings' ? <Settings /> : <Guide />}
      </main>
      {/* Phones: a floating glass tab bar within thumb reach; a glass pill slides to the open tab. */}
      <nav aria-label="Tabs" style={{ bottom: 'calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }} className="glass tabbar fixed inset-x-3 z-30 mx-auto flex max-w-md rounded-[30px] p-1.5 sm:hidden">
        <span aria-hidden="true" className="tabpill" style={{ '--i': Math.max(0, TABS.findIndex((t) => t.id === tab)), '--n': TABS.length, opacity: tab === 'guide' ? 0 : 1 } as React.CSSProperties} />
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined} className={`tap tabbtn z-[1] flex h-[54px] flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[10.5px] font-bold ${tab === t.id ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon d={t.icon} />{t.label}
            {badge(t.id) ? <span className="absolute right-[14%] top-1 min-w-[18px] rounded-full bg-amber-400 px-1.5 text-center text-[10px] font-bold leading-[18px] text-slate-900 shadow-[0_0_12px_-2px_rgba(251,191,36,0.9)] ring-2 ring-white/70 animate-[pulse_2.4s_ease-in-out_infinite] dark:ring-[#0b1020]/80">{badge(t.id)}</span> : null}
          </button>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
