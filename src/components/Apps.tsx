/**
 * 📱 "My apps" (apps.html): one glass card per app of the owner's, with 1–3 status lines and what its paid AI cost,
 * plus a total at the top. Each app answers GET <address>/api/summary with its own access code (header
 * X-Access-Token); LifeTracker uses the signed-in session. Codes are kept only in this browser (localStorage).
 * These pieces are also drawn in the Guide with made-up data.
 */
export interface Cost { calls: number; usd: number }
export interface AppSummary {
  app: string;
  lines: { icon: string; text: string; tone?: 'good' | 'warn' | 'info' }[];
  ai?: { today: Cost; week: Cost; month: Cost; byModel?: { model: string; calls: number; usd: number }[]; estimate?: boolean };
  at?: string;
}
export type AppKind = 'self' | 'code' | 'link';
export interface AppDef { id: string; name: string; icon: string; url: string; kind: AppKind; about: string }
export type CardState =
  | { s: 'loading' } | { s: 'ok'; data: AppSummary } | { s: 'code'; wrong: boolean } | { s: 'offline'; why: string }
  | { s: 'signin' } | { s: 'link' } | { s: 'noaddress' };

export const APPS: AppDef[] = [
  { id: 'lifetracker', name: 'LifeTracker', icon: '🪐', url: '', kind: 'self', about: 'Bills, spending, appointments' },
  { id: 'trend-videos', name: 'Trend Videos', icon: '🎬', url: 'https://trend-video.netlify.app', kind: 'code', about: 'Daily videos for TikTok and YouTube' },
  { id: 'trading', name: 'Trading', icon: '📈', url: 'https://tradinganis.netlify.app', kind: 'code', about: 'Stocks, ideas and alerts' },
  { id: 'scam-check', name: 'Scam Check', icon: '🛡️', url: 'https://scamcheck-anis.vercel.app', kind: 'code', about: 'Is this message a scam?' },
  { id: 'calorie-tracker', name: 'CalorieTracker', icon: '🥗', url: 'https://calorie-tracker-roza.vercel.app', kind: 'code', about: 'Food, beauty and cooking' },
  { id: 'carloaner', name: 'CarLoaner', icon: '🚗', url: '', kind: 'link', about: 'Car rental website (public)' },
];

const usd = (n: number, about: boolean) => `${about && n > 0 ? 'about ' : ''}$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };

/** Three columns: today, last 7 days, this month ($ and calls). */
function CostRow({ ai, big = false }: { ai: { today: Cost; week: Cost; month: Cost; estimate?: boolean }; big?: boolean }) {
  const cols: [string, Cost][] = [['Today', ai.today], ['7 days', ai.week], ['Month', ai.month]];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cols.map(([l, c]) => (
        <div key={l} className={`panel !px-2.5 !py-2 ${big ? 'text-center' : ''}`}>
          <p className="label !text-[9.5px]">{l}</p>
          {ai.estimate && c.usd > 0 && <p className="text-[10px] font-semibold leading-none text-slate-500 dark:text-slate-400">about</p>}
          <p className={`num font-semibold leading-tight text-slate-900 dark:text-white ${big ? 'text-[22px]' : 'text-[15px]'}`}>${c.usd < 10 ? c.usd.toFixed(2) : c.usd.toFixed(0)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.calls} AI call{c.calls === 1 ? '' : 's'}</p>
        </div>
      ))}
    </div>
  );
}

/** The total paid-AI cost of every app that answered. */
export function TotalCard({ results, total }: { results: AppSummary[]; total: number }) {
  const add = (k: 'today' | 'week' | 'month'): Cost => results.reduce((a, r) => ({ calls: a.calls + (r.ai?.[k].calls ?? 0), usd: a.usd + (r.ai?.[k].usd ?? 0) }), { calls: 0, usd: 0 });
  const estimate = results.some((r) => r.ai?.estimate);
  const models = new Map<string, Cost & { about: boolean }>();
  for (const r of results) for (const m of r.ai?.byModel ?? []) {
    const c = models.get(m.model) ?? { calls: 0, usd: 0, about: false };
    models.set(m.model, { calls: c.calls + m.calls, usd: c.usd + m.usd, about: c.about || !!r.ai?.estimate });
  }
  const top = [...models.entries()].filter(([, c]) => c.calls > 0).sort((a, b) => b[1].usd - a[1].usd || b[1].calls - a[1].calls).slice(0, 4);
  const month = add('month');
  return (
    <section className="card space-y-3 !p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="label">Paid AI, all apps · this month</p>
          {estimate && month.usd > 0 && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">about</p>}
          <p className="num text-[38px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white">{usd(month.usd, false)}</p>
        </div>
        <span className="chip mb-2 border-slate-900/10 text-slate-600 dark:border-white/10 dark:text-slate-300">{results.length} of {total} apps</span>
      </div>
      <CostRow ai={{ today: add('today'), week: add('week'), month, estimate }} big />
      {top.length > 0 && (
        <div className="space-y-1">
          <p className="label">Today by AI</p>
          {top.map(([m, c]) => <p key={m} className="flex justify-between text-sm"><span className="truncate">{m}</span><span className="num shrink-0 pl-2 text-slate-600 dark:text-slate-300">{c.calls} · {usd(c.usd, c.about)}</span></p>)}
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">Free AIs (Gemini, Groq…) count as $0. “About” = an estimate per call where an app can’t see the exact price.{results.length < total ? ' Apps that didn’t answer aren’t counted.' : ''}</p>
    </section>
  );
}

const TONE = { good: 'text-emerald-700 dark:text-emerald-300', warn: 'text-amber-700 dark:text-amber-300', info: 'text-slate-700 dark:text-slate-200' };

/** One app: icon, name, Open, its status lines and its AI cost (or why it couldn't be read). */
export function AppCard({ app, url, st, onCodes }: { app: AppDef; url: string; st: CardState; onCodes?: () => void }) {
  const chip = st.s === 'ok' ? ['✓ Live', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200']
    : st.s === 'code' ? [st.wrong ? '🔑 Wrong code' : '🔑 Code needed', 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200']
    : st.s === 'offline' ? ['⚠ Couldn’t reach it', 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300']
    : st.s === 'signin' ? ['Sign in', 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200']
    : st.s === 'loading' ? ['Checking…', 'border-slate-900/10 text-slate-500 dark:border-white/10 dark:text-slate-400']
    : st.s === 'noaddress' ? ['No address yet', 'border-slate-900/10 text-slate-500 dark:border-white/10 dark:text-slate-400']
    : ['Website', 'border-slate-900/10 text-slate-500 dark:border-white/10 dark:text-slate-400'];
  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-3">
        <span className="tile" aria-hidden="true">{app.icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-semibold leading-snug">{app.name}</h2>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{url ? host(url) : app.about}</p>
        </div>
        {url ? <a className="btn shrink-0 !px-3.5" href={url} target="_blank" rel="noopener noreferrer">Open ↗</a> : <button className="btn shrink-0 !px-3.5" onClick={onCodes}>Add address</button>}
      </div>
      <span className={`chip ${chip[1]}`}>{chip[0]}</span>
      {st.s === 'loading' && <div className="space-y-2"><div className="skel h-3.5 w-3/4" /><div className="skel h-3.5 w-1/2" /><div className="skel h-14 w-full !rounded-[20px]" /></div>}
      {st.s === 'ok' && (
        <>
          {st.data.lines.length > 0 && <ul className="space-y-1">{st.data.lines.slice(0, 3).map((l, k) => <li key={k} className={`flex gap-2 text-sm ${TONE[l.tone ?? 'info']}`}><span aria-hidden="true">{l.icon}</span><span className="min-w-0">{l.text}</span></li>)}</ul>}
          {st.data.ai ? <CostRow ai={st.data.ai} /> : <p className="text-xs text-slate-500 dark:text-slate-400">No AI cost reported.</p>}
        </>
      )}
      {st.s === 'code' && <p className="text-sm text-slate-600 dark:text-slate-300">{st.wrong ? 'That code didn’t work. Type the code you use to open this app.' : 'Type this app’s access code once to see its status and AI cost here.'} <button className="font-semibold text-teal-700 underline dark:text-teal-300" onClick={onCodes}>Codes</button></p>}
      {st.s === 'offline' && <p className="text-sm text-slate-600 dark:text-slate-300">{st.why} Check the address in <button className="font-semibold text-teal-700 underline dark:text-teal-300" onClick={onCodes}>Codes</button>, or try again later.</p>}
      {st.s === 'signin' && <p className="text-sm text-slate-600 dark:text-slate-300">Sign in to LifeTracker in this browser to see it here. <a className="font-semibold text-teal-700 underline dark:text-teal-300" href={url}>Sign in</a></p>}
      {st.s === 'link' && <p className="text-sm text-slate-600 dark:text-slate-300">{app.about}. A public website: no status or AI here.</p>}
      {st.s === 'noaddress' && <p className="text-sm text-slate-600 dark:text-slate-300">{app.about}. Type its address once in Codes to get an Open button.</p>}
    </section>
  );
}
