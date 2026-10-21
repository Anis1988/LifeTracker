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
import { Guide } from './pages/Guide';
import { pushWidget } from './lib/widget';
import { timeline } from './lib/timeline';
import { MePage } from './pages/Me';
import { Places } from './pages/Contacts';
import { SearchSheet } from './components/Search';
import { PlusIcon, QuickAddSheet } from './components/QuickAdd';
import { Icon, PhoneTabBar, TABS } from './components/Nav';
import { goTo, parseHash, upgradeHash, type Tab } from './lib/nav';
import { addedFeed, unseen } from './lib/added';
import { MailCheckBar } from './components/MailCheck';

const tabOf = (): Tab => parseHash().tab;
// Old addresses (#/contacts, #/vault, #/me, #/settings/…) move to their new place before anything opens.
const upgrade = () => { const h = upgradeHash(location.hash); if (h) history.replaceState(null, '', h); };
upgrade();

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
  // Every move opens the page fresh (so "?doc=…" style links open their item), even within the same tab.
  const [visit, setVisit] = useState(0);
  const [search, setSearch] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const f = () => { upgrade(); setTab(tabOf()); setVisit((n) => n + 1); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  // 🔎 "/" or Ctrl/Cmd+K opens the search from anywhere (not while typing in a box).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSearch(true); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('[role="dialog"]')) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const go = (t: string) => goTo(t as Tab);
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
  const badge = (t: Tab): number => (t === 'me' ? meCount : 0);
  // 🔔 New in the Inbox: things added by themselves since the Inbox was last opened on this device.
  const fresh = tab === 'inbox' ? 0 : unseen(addedFeed(st));
  const roundBtn = 'btn relative h-11 w-11 shrink-0 !overflow-visible !p-0';
  const lit = '!border-teal-500 text-teal-700 shadow-[0_0_18px_-4px_#5eead4] dark:!border-teal-300 dark:text-teal-200';
  return (
    <div className="min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pb-10">
      <Aurora />
      <header className="sticky top-0 z-30 border-b border-slate-900/5 bg-[#eaeff6]/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#060912]/70" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <button onClick={() => go('home')} className="tap -ml-1 flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-2xl px-1" aria-label="LifeTracker: Home">
            <img src="./icon.svg" alt="" className="h-8 w-8" />
            <span className="truncate font-display text-xl font-semibold tracking-tight">LifeTracker</span>
          </button>
          <nav className="glass ml-auto hidden gap-1 rounded-2xl p-1 sm:flex" aria-label="Tabs">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined} aria-label={t.label} title={t.label} className={`tap tabbtn flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold ${tab === t.id ? 'bg-white text-slate-900 shadow-[0_0_20px_-6px_#5eead4] dark:bg-white/[0.12] dark:text-white' : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/[0.06]'}`}>
                <Icon d={t.icon} className="h-[18px] w-[18px]" /><span className="hidden md:inline">{t.label}</span>{badge(t.id) ? <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-900">{badge(t.id)}</span> : null}
              </button>
            ))}
          </nav>
          {/* ＋ Add anything (big screens; phones have it in the middle of the tab bar). */}
          <button onClick={() => setAdding(true)} aria-label="Add" title="Add" aria-haspopup="dialog" className="btn-primary ml-1 hidden h-11 w-11 shrink-0 !rounded-2xl !p-0 sm:inline-flex"><PlusIcon className="h-5 w-5" /></button>
          {/* 🔎 Search everything on this phone. */}
          <button onClick={() => setSearch(true)} aria-label="Search everything" title="Search (/ or Ctrl K)" aria-haspopup="dialog" className={`${roundBtn} ml-auto text-teal-700 shadow-[0_0_18px_-8px_#5eead4] dark:text-teal-200 sm:ml-1`}>
            <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" className="h-[22px] w-[22px]" />
          </button>
          {/* 🔔 Inbox: what was added by itself lately (bills, receipts, documents, contacts, appointments), each with an Undo. */}
          <button onClick={() => go('inbox')} aria-label={`Inbox${fresh ? `: ${fresh} new` : ''}`} title="Inbox" aria-current={tab === 'inbox' ? 'page' : undefined} className={`${roundBtn} ${tab === 'inbox' ? lit : 'text-slate-600 dark:text-slate-300'}`}>
            <Icon d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" className="h-5 w-5" />
            {fresh ? <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-amber-400 px-1 text-center text-[10px] font-bold leading-[18px] text-slate-900 shadow-[0_0_12px_-2px_rgba(251,191,36,0.9)] ring-2 ring-white/80 dark:ring-[#0b1020]/80">{fresh}</span> : null}
          </button>
        </div>
      </header>
      {/* 📬 Email checks: how often, last and next (every tab; hidden until Gmail is connected). */}
      <MailCheckBar />
      <main key={`${tab}:${visit}`} className="mx-auto max-w-5xl px-4 pb-6 pt-5">
        <AppUpdateCheck />
        {st.loading ? <Skeleton />
          : tab === 'home' ? <Home go={go} /> : tab === 'money' ? <MoneyPage /> : tab === 'inbox' ? <Inbox /> : tab === 'me' ? <MePage /> : tab === 'places' ? <Places /> : <Guide />}
      </main>
            <PhoneTabBar tab={tab} onGo={go} onAdd={() => setAdding(true)} badge={badge} />
      {search && <SearchSheet onClose={() => setSearch(false)} />}
      {adding && <QuickAddSheet onClose={() => setAdding(false)} />}
      <Toasts />
    </div>
  );
}
