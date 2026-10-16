import { useCallback, useEffect, useState } from 'react';
import { api, configured, supabase } from '../lib/supabase';
import { APPS, AppCard, TotalCard, type AppDef, type AppSummary, type CardState } from '../components/Apps';
import { Aurora, Sheet, Toasts, toast } from '../components/ui';

/**
 * 📱 My apps: every app of the owner's on one page. The codes and addresses typed in "Codes" stay in THIS browser
 * (localStorage) and each code is only ever sent to its own app.
 */
type Saved = Record<string, { url?: string; code?: string }>;
const KEY = 'lt.myapps';
const load = (): Saved => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved; } catch { return {}; } };
const store = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
const selfUrl = () => new URL('./', location.href).href;
const urlOf = (a: AppDef, saved: Saved) => (a.kind === 'self' ? selfUrl() : (saved[a.id]?.url ?? a.url).trim().replace(/\/+$/, ''));

async function fetchSummary(a: AppDef, saved: Saved): Promise<CardState> {
  if (a.kind === 'link') return urlOf(a, saved) ? { s: 'link' } : { s: 'noaddress' };
  if (a.kind === 'self') {
    if (!configured) return { s: 'offline', why: 'This copy isn’t linked to Supabase.' };
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { s: 'signin' };
    try { return { s: 'ok', data: await api<AppSummary>('summary') }; } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return /sign in/i.test(m) ? { s: 'signin' } : { s: 'offline', why: 'Couldn’t reach it.' };
    }
  }
  const url = urlOf(a, saved), code = saved[a.id]?.code?.trim();
  if (!url) return { s: 'noaddress' };
  if (!code) return { s: 'code', wrong: false };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const res = await fetch(`${url}/api/summary`, { headers: { 'X-Access-Token': code }, signal: ctl.signal, cache: 'no-store' });
    if (res.status === 401 || res.status === 403) return { s: 'code', wrong: true };
    if (!res.ok) return { s: 'offline', why: `Couldn’t reach it (error ${res.status}).` };
    const data = (await res.json()) as AppSummary;
    if (!data || !Array.isArray(data.lines)) return { s: 'offline', why: 'It answered, but not with a summary (is it up to date?).' };
    return { s: 'ok', data };
  } catch {
    return { s: 'offline', why: 'Couldn’t reach it.' };
  } finally { clearTimeout(timer); }
}

export function AppsPage() {
  const [saved, setSaved] = useState<Saved>(load);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [at, setAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(false);

  const refresh = useCallback(async (s: Saved) => {
    setBusy(true);
    setCards(Object.fromEntries(APPS.map((a) => [a.id, { s: 'loading' } as CardState])));
    await Promise.all(APPS.map(async (a) => {
      const st = await fetchSummary(a, s).catch((): CardState => ({ s: 'offline', why: 'Couldn’t reach it.' }));
      setCards((c) => ({ ...c, [a.id]: st }));
    }));
    setAt(new Date());
    setBusy(false);
  }, []);
  useEffect(() => { void refresh(saved); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const results = APPS.map((a) => cards[a.id]).filter((c): c is Extract<CardState, { s: 'ok' }> => c?.s === 'ok').map((c) => c.data);
  const withAi = APPS.filter((a) => a.kind !== 'link').length;
  return (
    <div className="min-h-screen pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
      <Aurora />
      <header className="sticky top-0 z-30 border-b border-slate-900/5 bg-[#eaeff6]/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#060912]/70" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <a href="./" className="btn h-11 w-11 shrink-0 !p-0" aria-label="Back to LifeTracker"><img src="./icon.svg" alt="" className="h-7 w-7" /></a>
          <span className="font-display text-xl font-semibold tracking-tight">My apps</span>
          <button className="btn ml-auto h-11 !px-3" onClick={() => setCodes(true)}>🔑 Codes</button>
          <button className="btn h-11 w-11 shrink-0 !p-0" aria-label="Refresh" disabled={busy} onClick={() => void refresh(saved)}>
            {busy ? <span className="spinner" /> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>}
          </button>
        </div>
      </header>
      <main className="stagger mx-auto max-w-5xl space-y-3 px-4 pt-5">
        <p className="text-xs text-slate-500 dark:text-slate-400">{at ? `Updated ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Checking your apps…'} · tap ↻ for fresh numbers</p>
        <TotalCard results={results} total={withAi} />
        <div className="grid gap-3 md:grid-cols-2">
          {APPS.map((a) => <AppCard key={a.id} app={a} url={urlOf(a, saved)} st={cards[a.id] ?? { s: 'loading' }} onCodes={() => setCodes(true)} />)}
        </div>
      </main>
      <Toasts />
      {codes && <CodesSheet saved={saved} onClose={() => setCodes(false)} onSave={(s) => { setSaved(s); store(s); setCodes(false); toast('ok', 'Saved in this browser.'); void refresh(s); }} />}
    </div>
  );
}

function CodesSheet({ saved, onClose, onSave }: { saved: Saved; onClose: () => void; onSave: (s: Saved) => void }) {
  const [f, setF] = useState<Saved>(() => Object.fromEntries(APPS.filter((a) => a.kind !== 'self').map((a) => [a.id, { url: saved[a.id]?.url ?? a.url, code: saved[a.id]?.code ?? '' }])));
  const [show, setShow] = useState(false);
  const set = (id: string, p: { url?: string; code?: string }) => setF((x) => ({ ...x, [id]: { ...x[id], ...p } }));
  return (
    <Sheet title="🔑 Codes" onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded-2xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-sm text-teal-900 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-teal-100">Each code is the one you already use to open that app. They are kept <b>only in this browser</b> on this device, and each code is sent only to its own app, never anywhere else. LifeTracker uses your sign-in instead.</p>
        {APPS.filter((a) => a.kind !== 'self').map((a) => (
          <div key={a.id} className="card space-y-2 !p-3">
            <p className="font-semibold"><span aria-hidden="true">{a.icon}</span> {a.name}</p>
            <label className="block text-xs text-slate-500 dark:text-slate-400">Address
              <input className="input mt-1 w-full" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} placeholder="https://…" value={f[a.id]?.url ?? ''} onChange={(e) => set(a.id, { url: e.target.value })} />
            </label>
            {a.kind === 'code' && (
              <label className="block text-xs text-slate-500 dark:text-slate-400">Access code
                <input className="input mt-1 w-full" type={show ? 'text' : 'password'} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="The code you open it with" value={f[a.id]?.code ?? ''} onChange={(e) => set(a.id, { code: e.target.value })} />
              </label>
            )}
          </div>
        ))}
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-teal-500" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show the codes</label>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={() => onSave(f)}>Save</button>
          <button className="btn" onClick={() => { if (confirm('Forget every code and address in this browser?')) onSave({}); }}>Forget all</button>
        </div>
      </div>
    </Sheet>
  );
}
