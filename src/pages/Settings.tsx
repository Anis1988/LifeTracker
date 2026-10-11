import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api, siteUrl, supabase } from '../lib/supabase';
import { AlertBanks } from '../components/Bank';
import { Field, Fold, Toggle, errText, toast } from '../components/ui';
import { PROVIDERS, providerOf, type Provider, type Settings as S } from '../../supabase/functions/_shared/model.ts';

const Ready = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`chip ${ok ? 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200' : 'border-stone-300 text-stone-500 dark:border-slate-700'}`}>{ok ? '✓' : '○'} {label}</span>
);

export function Settings() {
  const st = useStore();
  const s = st.settings;
  const status = st.status;
  const [busy, setBusy] = useState('');
  const [token, setToken] = useState('');
  const save = (patch: Partial<S>) => void st.saveSettings({ ...s, ...patch }).catch((e) => toast('err', errText(e)));
  const run = async (name: string, f: () => Promise<void>) => {
    setBusy(name);
    try { await f(); } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };

  // Back from Google: "#/settings?google=connected"
  useEffect(() => {
    const m = location.hash.match(/google=([^&]+)/);
    if (!m) return;
    const msg = decodeURIComponent(m[1]);
    toast(msg === 'connected' ? 'ok' : 'err', msg === 'connected' ? 'Google connected. Your calendar is being filled.' : msg);
    history.replaceState(null, '', '#/settings');
    void st.reloadStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const google = async (want: ('calendar' | 'gmail')[]) => run('google', async () => {
    const r = await api<{ url: string }>('google-start', { want, back: siteUrl() });
    location.href = r.url;
  });
  const bank = () => run('bank', async () => {
    const r = await api<{ log: { steps: string[]; errors: string[] } }>('bank-connect', { setupToken: token.trim() });
    setToken('');
    toast('ok', `Bank connected. ${r.log.steps.join(' · ')}`);
    await Promise.all([st.reload(), st.reloadStatus()]);
  });
  const disconnect = (kind: string) => run(kind, async () => {
    if (!confirm(kind === 'google' ? 'Disconnect Google? The LifeTracker calendar stays in Google; delete it there if you like.' : 'Disconnect this bank? Transactions already read stay.')) return;
    await api('disconnect', { kind });
    await st.reloadStatus();
  });
  const sync = (full = false) => run('sync', async () => {
    const r = await api<{ log: { steps: string[]; errors: string[] } }>('sync', { full });
    toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'Nothing to do yet.');
    await Promise.all([st.reload(), st.reloadStatus()]);
  });

  // 🤖 AI order: free ones (any order), Claude always last (the owner's rule: paid only when the free ones can't).
  const free: Provider[] = s.ai.order.filter((p) => p !== 'claude');
  const move = (p: Provider, d: -1 | 1) => {
    const i = free.indexOf(p), j = i + d;
    if (j < 0 || j >= free.length) return;
    const next = [...free];
    [next[i], next[j]] = [next[j], next[i]];
    save({ ai: { ...s.ai, order: [...next, 'claude'] } });
  };
  const slot = (p: Provider, patch: Partial<S['ai']['slots'][Provider]>) => save({ ai: { ...s.ai, slots: { ...s.ai.slots, [p]: { ...s.ai.slots[p], ...patch } } } });

  const exportAll = async () => {
    const [i, sg, d, tx] = await Promise.all(['items', 'suggestions', 'documents', 'transactions'].map((t) => supabase.from(t).select('*')));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: i.data, suggestions: sg.data, documents: d.data, transactions: tx.data, settings: s }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lifetracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const gEmail = status?.google.email ?? st.session.user.email ?? '';
  const plus = gEmail.includes('@') ? `${gEmail.split('@')[0]}+${s.gmail.plusTag}@${gEmail.split('@')[1]}` : `you+${s.gmail.plusTag}@gmail.com`;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {st.statusErr && <p className="card text-sm text-amber-800 dark:text-amber-200">The server didn’t answer: {st.statusErr}</p>}

      <Fold icon="🏦" title="Bank & cards" subtitle={status?.google.gmail && s.bank.alerts ? `Bank alert emails: ${status.google.alertsRead ?? 0} purchases read` : 'Free: read your bank’s purchase-alert emails'}>
        <p className="text-sm text-stone-700 dark:text-slate-300">Free and automatic: your banks email you each purchase, and LifeTracker reads those emails in Gmail every morning to find your bills and subscriptions. It only reads; nothing can be paid or moved.</p>
        <Field label="Read bank alert emails"><Toggle on={s.bank.alerts} onChange={(v) => save({ bank: { ...s.bank, alerts: v } })} label="Read bank alert emails" /></Field>
        <AlertBanks gmail={!!status?.google.gmail} read={status?.google.alertsRead ?? 0} banks={status?.google.alertBanks ?? []} last={status?.google.alertsScanned} onConnect={status?.keys.google ? () => void google(['gmail']) : undefined} />
        {status?.google.gmail && <button className="btn" disabled={!!busy} onClick={() => void sync()}>{busy === 'sync' ? <span className="spinner" /> : 'Read now'}</button>}
        <details className="pt-1">
          <summary className="cursor-pointer text-sm text-stone-600 dark:text-slate-300">Other option: a direct bank link with SimpleFIN (paid, about $15/year)</summary>
          <div className="space-y-2 pt-2">
        {status?.bank.connected ? (
          <>
            <ul className="space-y-1 text-sm">
              {(status.bank.accounts ?? []).map((a) => <li key={a.name} className="flex justify-between"><span>{a.name}</span><span className="num">{a.balance.toLocaleString('en-US', { style: 'currency', currency: a.currency || 'USD' })}</span></li>)}
            </ul>
            {!!status.bank.errors?.length && <p className="text-xs text-amber-800 dark:text-amber-200">Your bank says: {status.bank.errors.join(' · ')}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn" disabled={!!busy} onClick={() => void sync()}>{busy === 'sync' ? <span className="spinner" /> : 'Read now'}</button>
              <button className="btn" disabled={!!busy} onClick={() => void sync(true)}>Re-check the last year</button>
              <button className="btn text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => void disconnect('simplefin')}>Disconnect</button>
            </div>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700 dark:text-slate-300">
              <li>Open <a className="underline" href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer">bridge.simplefin.org</a> (about $15 a year), sign up and connect your banks and cards there.</li>
              <li>Tap <b>New connection</b> → copy the <b>setup token</b>.</li>
              <li>Paste it here. It is used once; LifeTracker keeps only a read-only access link, encrypted.</li>
            </ol>
            <textarea className="input w-full py-2 font-mono text-xs" rows={3} placeholder="Paste the SimpleFIN setup token" value={token} onChange={(e) => setToken(e.target.value)} aria-label="SimpleFIN setup token" />
            <button className="btn-primary" disabled={!!busy || token.trim().length < 20} onClick={() => void bank()}>{busy === 'bank' ? <><span className="spinner" /> Connecting and reading a year of transactions…</> : 'Connect'}</button>
          </>
        )}
          </div>
        </details>
        <p className="text-xs text-stone-500">Read-only: nothing can be paid or moved. Read every morning. No link? Import a bank CSV in Inbox.</p>
      </Fold>

      <Fold icon="📅" title="Google Calendar & Gmail" subtitle={status?.google.connected ? `Connected${status.google.email ? ` as ${status.google.email}` : ''} · ${[status.google.calendar && 'Calendar', status.google.gmail && 'Gmail'].filter(Boolean).join(' + ')}` : 'Not connected'}>
        {!status?.keys.google && <p className="text-sm text-amber-800 dark:text-amber-200">Google isn’t set up on the server yet: see Guide → Setting it up (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).</p>}
        <div className="flex flex-wrap gap-2">
          {!status?.google.calendar && <button className="btn-primary" disabled={!!busy || !status?.keys.google} onClick={() => void google(['calendar'])}>📅 Connect Google Calendar</button>}
          {!status?.google.gmail && <button className="btn" disabled={!!busy || !status?.keys.google} onClick={() => void google(['gmail'])}>✉️ Also read Gmail receipts</button>}
          {status?.google.connected && <button className="btn text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => void disconnect('google')}>Disconnect</button>}
        </div>
        <Field label="Put bills in my calendar" hint="One “LifeTracker” calendar: due dates (repeating), renewals, trial ends. The app can’t see or change your other calendars.">
          <Toggle on={s.calendar.on} onChange={(v) => save({ calendar: { ...s.calendar, on: v } })} label="Calendar" />
        </Field>
        <Field label="Remind me (days before)">
          <select className="input" value={s.calendar.remindDays} onChange={(e) => save({ calendar: { ...s.calendar, remindDays: Number(e.target.value) } })} aria-label="Days before">
            {[0, 1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n === 0 ? 'Same day' : `${n} day${n > 1 ? 's' : ''}`}</option>)}
          </select>
        </Field>
        <Field label="Renewals and contract ends"><Toggle on={s.calendar.renewals} onChange={(v) => save({ calendar: { ...s.calendar, renewals: v } })} label="Renewals" /></Field>
        <Field label="Free trials ending"><Toggle on={s.calendar.trials} onChange={(v) => save({ calendar: { ...s.calendar, trials: v } })} label="Trials" /></Field>
        <Field label="Read receipt emails" hint="Read-only. Free check first; only emails that look like bills go to the AI.">
          <Toggle on={s.gmail.on} onChange={(v) => save({ gmail: { ...s.gmail, on: v } })} label="Gmail" />
        </Field>
        <div className="panel text-sm">
          <p className="font-medium">✉️ Forward a bill by email</p>
          <p className="text-stone-600 dark:text-slate-300">Forward any bill or receipt to <b className="select-all break-all">{plus}</b>: it lands in your own Gmail and is read the next morning (Gmail reading must be on).</p>
        </div>
      </Fold>

      <Fold icon="🤖" title="AI that reads bills" subtitle={`Free first (${free.map((p) => providerOf(p).name).join(' → ')}), then Claude if they can’t`}>
        <p className="text-sm text-stone-600 dark:text-slate-300">Tried in this order. The free ones go first; <b>Claude (paid)</b> only reads when they are over their daily limit, not set up, can’t read that file, or fail.</p>
        {[...free, 'claude' as Provider].map((p, idx) => {
          const info = PROVIDERS.find((x) => x.id === p)!;
          const sl = s.ai.slots[p];
          const used = status?.aiUsed?.[p] ?? 0;
          const key = status?.keys[p];
          return (
            <div key={p} className="panel space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="num text-xs text-stone-500">{idx + 1}</span>
                <b className="flex-1">{info.name} {info.paid ? <span className="chip border-amber-300 text-amber-800 dark:text-amber-200">paid · last</span> : <span className="chip border-emerald-300 text-emerald-800 dark:text-emerald-200">free</span>}</b>
                {!info.paid && <><button className="btn-ghost" aria-label={`Move ${info.name} up`} onClick={() => move(p, -1)}>↑</button><button className="btn-ghost" aria-label={`Move ${info.name} down`} onClick={() => move(p, 1)}>↓</button></>}
                <Toggle on={sl.on} onChange={(v) => slot(p, { on: v })} label={info.name} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select className="input min-w-0 flex-1" value={sl.model} onChange={(e) => slot(p, { model: e.target.value })} aria-label={`${info.name} model`}>
                  {info.models.map((m) => <option key={m.id} value={m.id}>{m.name}{!m.pdf ? ' (no PDFs)' : ''}{!m.pictures ? ' (text only)' : ''}</option>)}
                </select>
                <label className="flex items-center gap-1 text-xs text-stone-500">a day
                  <input className="input w-20" type="number" min={0} placeholder="no limit" value={sl.dailyLimit ?? ''} onChange={(e) => slot(p, { dailyLimit: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} aria-label={`${info.name} daily limit`} />
                </label>
              </div>
              <p className="text-xs text-stone-500">{key === false ? `Not set up: add ${info.env} in Supabase → Edge Functions → Secrets.` : `Used today: ${used}${sl.dailyLimit != null ? ` of ${sl.dailyLimit}` : ''}.`}</p>
            </div>
          );
        })}
        <Field label="Most emails/documents read per morning"><input className="input w-20" type="number" min={1} max={50} value={s.ai.maxPerRun} onChange={(e) => save({ ai: { ...s.ai, maxPerRun: Math.min(50, Math.max(1, Number(e.target.value) || 15)) } })} aria-label="Most per run" /></Field>
      </Fold>

      <Fold icon="🔔" title="Heads-ups" subtitle={s.notify.email ? 'In the app and by email' : 'In the app'}>
        <Field label="Email me new heads-ups each morning" hint={status?.keys.email ? `To ${st.session.user.email}.` : 'Needs RESEND_API_KEY on the server (free at resend.com).'}>
          <Toggle on={s.notify.email} onChange={(v) => save({ notify: { ...s.notify, email: v } })} label="Email" />
        </Field>
        <Field label="Bills not on autopay: warn me (days before)">
          <input className="input w-20" type="number" min={0} max={14} value={s.notify.dueDays} onChange={(e) => save({ notify: { ...s.notify, dueDays: Number(e.target.value) || 0 } })} aria-label="Days before due" />
        </Field>
        <Field label="Renewals and contract ends: warn me (days before)">
          <input className="input w-20" type="number" min={1} max={120} value={s.notify.renewalDays} onChange={(e) => save({ notify: { ...s.notify, renewalDays: Number(e.target.value) || 30 } })} aria-label="Days before renewal" />
        </Field>
      </Fold>

      <Fold icon="⚙️" title="Account & data" subtitle={st.session.user.email ?? ''}>
        {status && (
          <div className="flex flex-wrap gap-1.5">
            <Ready ok={status.keys.secret} label="Secret key" />
            <Ready ok={status.keys.gemini} label="Gemini" />
            <Ready ok={status.keys.groq} label="Groq" />
            <Ready ok={status.keys.claude} label="Claude" />
            <Ready ok={status.keys.google} label="Google" />
            <Ready ok={status.keys.email} label="Email" />
          </div>
        )}
        {status?.lastRun?.lastRun && <p className="text-xs text-stone-500">Last automatic run {new Date(status.lastRun.lastRun).toLocaleString()}: {[...(status.lastRun.steps ?? []), ...(status.lastRun.errors ?? []).map((e) => `⚠ ${e}`)].join(' · ') || 'nothing to do'}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void exportAll()}>⬇ Download all my data</button>
          <button className="btn" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </Fold>
    </div>
  );
}
