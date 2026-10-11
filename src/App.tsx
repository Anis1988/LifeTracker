import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, secretKey, siteUrl, supabase } from './lib/supabase';
import { StoreProvider, useStore } from './lib/store';
import { Toasts, errText, toast } from './components/ui';
import { Home } from './pages/Home';
import { Bills } from './pages/Bills';
import { Inbox } from './pages/Inbox';
import { Settings } from './pages/Settings';
import { Guide } from './pages/Guide';
import { Me } from './pages/Me';

const TABS = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'bills', icon: '📋', label: 'Bills' },
  { id: 'me', icon: '👤', label: 'Me' },
  { id: 'inbox', icon: '🔎', label: 'Inbox' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
  { id: 'guide', icon: '📖', label: 'Guide' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const tabOf = (): Tab => (TABS.find((t) => location.hash.startsWith(`#/${t.id}`))?.id ?? 'home');

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!configured) return setSession(null);
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
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
  const link = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: siteUrl() } });
    setBusy(false);
    if (error) toast('err', error.message); else setSent(true);
  };
  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } });
    if (error) toast('err', errText(error));
  };
  return (
    <div className="card space-y-3">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="text-sm text-stone-600 dark:text-slate-300">Your bills, subscriptions, mortgage and insurance, all in one place.</p>
      <button className="btn w-full" onClick={() => void google()}>Continue with Google</button>
      <div className="flex items-center gap-2 text-xs text-stone-400"><span className="h-px flex-1 bg-stone-200 dark:bg-slate-800" />or<span className="h-px flex-1 bg-stone-200 dark:bg-slate-800" /></div>
      {sent ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">Check your email and tap the link to sign in.</p> : (
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
  // Me: worrying pages, people-search listings and breaches still to handle.
  const meCount = st.findings.filter((f) => (f.kind === 'web' && f.status === 'new' && f.verdict === 'worrying') || (f.kind === 'broker' && f.status === 'listed') || (f.kind === 'breach' && f.status === 'new')).length;
  const badge = (t: Tab) => (t === 'inbox' ? st.suggestions.length : t === 'me' ? meCount : 0);
  return (
    <div className="min-h-screen pb-24 sm:pb-8">
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#f6f3ec]/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <img src="./icon.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-xl font-semibold">LifeTracker</span>
          <nav className="ml-auto hidden gap-1 sm:flex">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} className={`relative rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? 'bg-emerald-800 text-white dark:bg-emerald-600' : 'text-stone-700 hover:bg-stone-200/60 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                {t.icon} {t.label}{badge(t.id) ? <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-stone-900">{badge(t.id)}</span> : null}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        {st.loading ? <p className="text-sm text-stone-500"><span className="spinner" /> Loading your bills…</p>
          : tab === 'home' ? <Home go={go} /> : tab === 'bills' ? <Bills /> : tab === 'inbox' ? <Inbox /> : tab === 'me' ? <Me go={go} /> : tab === 'settings' ? <Settings /> : <Guide />}
      </main>
      {/* Phones: tabs at the bottom, within thumb reach. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-stone-200 bg-[#f6f3ec]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} className={`relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] ${tab === t.id ? 'font-semibold text-emerald-800 dark:text-emerald-400' : 'text-stone-500 dark:text-slate-400'}`} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="text-xl" aria-hidden="true">{t.icon}</span>{t.label}
            {badge(t.id) ? <span className="absolute right-[18%] top-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-stone-900">{badge(t.id)}</span> : null}
          </button>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
