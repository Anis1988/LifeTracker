import { useEffect, useState, type ReactNode } from 'react';
import { lastChecked } from '../components/Receipts';
import { useStore } from '../lib/store';
import { api, siteUrl, supabase } from '../lib/supabase';
import { AlertBanks } from '../components/Bank';
import { GoogleAccounts, type GoogleExtra } from '../components/GoogleAccounts';
import { Field, Sheet, Toggle, errText, toast } from '../components/ui';
import { SETTINGS_INDEX as SEC, SettingsSearch, SettingsTiles, settingsHref, type SettingsTile } from '../components/SettingsGrid';
import { NewPin, PeopleEditor, PinPad } from '../components/Vault';
import { hashPin, lockVault, pinOk, unlockVault } from '../lib/vault';
import { personIcon } from '../../supabase/functions/_shared/model.ts';
import { AboutMe } from '../components/AboutMe';
import { appsUrl } from '../lib/links';
import { goTo } from '../lib/nav';
import { TextsSetup } from '../components/Appointments';
import { ZipField } from '../components/Nearby';
import { zipOf } from '../../supabase/functions/_shared/place.ts';
import { allRows } from '../../supabase/functions/_shared/rows.ts';
import { PROVIDERS, mailEveryWords, providerOf, type Provider, type Settings as S } from '../../supabase/functions/_shared/model.ts';
import { MailEveryPicker, MailPill } from '../components/MailCheck';

const REMINDS: [string, string][] = [['1440,120', '1 day and 2 hours before'], ['1440,60', '1 day and 1 hour before'], ['1440', '1 day before'], ['120', '2 hours before'], ['60', '1 hour before'], ['', 'No reminder']];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const secOfHash = () => location.hash.match(/^#\/me\/settings\/([a-z]+)/)?.[1] ?? null;

const Ready = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`chip ${ok ? 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200' : 'border-slate-900/10 dark:border-white/10 text-slate-500 dark:text-slate-400 dark:border-slate-700'}`}>{ok ? '✓' : '○'} {label}</span>
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

  // The grid: one section opens in a sheet. "#/me/settings/nearby" (from other pages) opens Nearby straight away.
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(secOfHash);
  const show = (id: string | null) => {
    history.replaceState(null, '', id ? settingsHref(id) : '#/me/settings');
    setOpen(id);
  };
  useEffect(() => {
    const f = () => setOpen(secOfHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  // Back from Google: "#/settings?google=connected" (an old address, moved to "#/me/settings?google=…")
  useEffect(() => {
    const m = location.hash.match(/google=([^&]+)/);
    if (!m) return;
    const msg = decodeURIComponent(m[1]);
    const added = msg.startsWith('added:') ? msg.slice(6) : '';
    toast(msg === 'connected' || added ? 'ok' : 'err', msg === 'connected' ? 'Google connected. Your calendar is being filled.' : added ? `${added} added: its emails are being read now.` : msg);
    show('google');
    void st.reloadStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const google = async (want: ('calendar' | 'gmail' | 'mailbox')[]) => run('google', async () => {
    const r = await api<{ url: string }>('google-start', { want, back: siteUrl() });
    location.href = r.url;
  });
  // ✉️ Extra Gmail accounts: Google asks which account each time (Gmail only; mailing lists only if asked).
  const addGoogle = (extra: string, want: ('gmail' | 'mailbox')[] = ['gmail']) => run(extra === 'new' ? 'google-add' : extra, async () => {
    const r = await api<{ url: string }>('google-start', { want, back: siteUrl(), extra });
    location.href = r.url;
  });
  const toggleExtra = (kind: string, on: boolean) => run(kind, async () => {
    await api('google-extra', { kind, on });
    await st.reloadStatus();
  });
  const dropExtra = (x: GoogleExtra) => run(x.kind, async () => {
    if (!confirm(`Disconnect ${x.email ?? 'this Google account'}? LifeTracker stops reading it and Google forgets its access. What was already found stays.`)) return;
    await api('disconnect', { kind: x.kind });
    toast('ok', `${x.email ?? 'The account'} disconnected.`);
    await st.reloadStatus();
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
    // Every row, page by page (Supabase sends at most 1,000 at a time).
    const [i, sg, d, tx, co, pa] = await Promise.all(['items', 'suggestions', 'documents', 'transactions', 'contacts', 'papers'].map((t) => allRows((a, b) => supabase.from(t).select('*').order('id').range(a, b), 100000).then((data) => ({ data }))));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: i.data, suggestions: sg.data, documents: d.data, transactions: tx.data, contacts: co.data, vault: pa.data, settings: { ...s, vault: { ...s.vault, lock: { ...s.vault.lock, hash: '', salt: '' } } } }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lifetracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  // 🔒 Vault lock: turning it off or changing the PIN needs the PIN (else anyone holding the phone could switch it off here).
  const [pin, setPin] = useState<null | 'set' | 'off' | 'change' | 'change2'>(null);
  const [pinErr, setPinErr] = useState(0);
  const lock = s.vault.lock;
  const saveVault = (patch: Partial<S['vault']>) => save({ vault: { ...s.vault, ...patch } });
  const newPin = async (p: string) => {
    const h = await hashPin(p);
    await st.saveSettings({ ...s, vault: { ...s.vault, lock: { ...lock, ...h, on: true, len: p.length, resetAsked: null } } });
    unlockVault(lock.minutes);
    setPin(null);
    toast('ok', pin === 'set' ? `Vault lock on: it locks after ${lock.minutes} min and when you leave the app.` : 'New PIN saved.');
  };
  const checkPin = async (p: string) => {
    if (!(await pinOk(p, lock))) { setPinErr((x) => x + 1); toast('err', 'Wrong PIN.'); return; }
    if (pin === 'off') {
      await st.saveSettings({ ...s, vault: { ...s.vault, lock: { ...lock, on: false, hash: '', salt: '', len: 0, resetAsked: null } } });
      lockVault();
      setPin(null);
      toast('ok', 'Vault lock off.');
    } else setPin('change2');
  };

  const gEmail = status?.google.email ?? st.session.user.email ?? '';
  const plus = gEmail.includes('@') ? `${gEmail.split('@')[0]}+${s.gmail.plusTag}@${gEmail.split('@')[1]}` : `you+${s.gmail.plusTag}@gmail.com`;

  const aboutBody = (<>
    <p className="text-sm text-slate-600 dark:text-slate-300">Used to look for you online (Me → Privacy → Your name online). Private: only you can see it. It is sent to the free Gemini only to run the searches.</p>
    <AboutMe me={s.me} onSave={(me) => st.saveSettings({ ...s, me })} onCheck={() => { goTo('me', 'privacy'); void api('run', { part: 'online' }).then(() => Promise.all([st.reload(), st.reloadStatus()])).catch((e) => toast('err', errText(e))); toast('info', 'Searching for you online… results appear in Me → Privacy in a minute.'); }} />
    <Field label="Look for me online" hint="Free (Gemini with Google Search), a few searches each time.">
      <Toggle on={s.online.on} onChange={(v) => save({ online: { ...s.online, on: v } })} label="Look for me online" />
    </Field>
    <Field label="How often">
      <select className="input" value={s.online.everyDays} onChange={(e) => save({ online: { ...s.online, everyDays: Number(e.target.value) } })} aria-label="How often">
        {[3, 7, 14, 30].map((n) => <option key={n} value={n}>Every {n} days</option>)}
      </select>
    </Field>
  </>);

  const mailBody = (<>
    <Field label="Count my mailing lists" hint="Reads only the email headers from Gmail, never the contents.">
      <Toggle on={s.unsub.on} onChange={(v) => save({ unsub: { ...s.unsub, on: v } })} label="Mailing lists" />
    </Field>
    <Field label="Unsubscribe automatically" hint={`From lists you haven’t opened in ${s.unsub.days} days. Only real newsletters with an official unsubscribe; never Spam, never ones you marked “Keep”. Listed in your morning email.`}>
      <Toggle on={s.unsub.auto} onChange={(v) => save({ unsub: { ...s.unsub, auto: v } })} label="Unsubscribe automatically" />
    </Field>
    <Field label="Not opened for">
      <select className="input" value={s.unsub.days} onChange={(e) => save({ unsub: { ...s.unsub, days: Number(e.target.value) } })} aria-label="Days">
        {[30, 45, 60, 90, 120, 180].map((n) => <option key={n} value={n}>{n} days</option>)}
      </select>
    </Field>
    <Field label="Keep my inbox tidy" hint="Emails that still come from unsubscribed or blocked senders move out of the inbox, under a “LifeTracker/…” label. Nothing is deleted.">
      <Toggle on={s.unsub.tidy} onChange={(v) => save({ unsub: { ...s.unsub, tidy: v } })} label="Tidy" />
    </Field>
    <div className={`panel space-y-2 text-sm ${status?.google.mailbox ? '' : '!border-amber-300 dark:!border-amber-700'}`}>
      {status?.google.mailbox ? <p>✓ “Manage mailing lists” is allowed: LifeTracker can send the unsubscribe emails some senders ask for, and move emails out of the inbox (never delete).</p> : (
        <>
          <p>One-tap unsubscribe works already. To also unsubscribe by email, block spam senders and tidy the inbox, allow “Manage mailing lists” (Google asks once; nothing is ever deleted).</p>
          <button className="btn-primary" disabled={!!busy || !status?.keys.google} onClick={() => void google(['mailbox'])}>✉️ Allow “Manage mailing lists”</button>
        </>
      )}
    </div>
  </>);

  const spendingBody = (<>
    <p className="text-sm text-slate-600 dark:text-slate-300">Budgets are set in Money → Spending (🎯 Budgets). Purchases come from your bank alert emails and your receipts, sorted with free rules.</p>
    <div className="panel text-sm">
      <p className="font-semibold">📧 Email finding: {mailEveryWords(s.mail.every)}, by itself</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{status?.google.gmail ? <>Receipts, bank alerts, bills, orders and documents in your Gmail. Last checked: <span className="num font-semibold text-slate-700 dark:text-slate-200">{lastChecked(status.mail?.mailChecked ?? status.mail?.receiptsScanned)}</span>.</> : 'Needs Gmail: Google → “Also read Gmail receipts”.'}</p>
    </div>
    <Field label="Receipts in my emails → Spending" hint="At every email check (📬 Email checks). Free patterns read most receipts (shop, total, items); the AI (free ones first) only when they can’t, and never the same receipt twice. A receipt that matches a bank purchase is attached to it: counted once.">
      <Toggle on={s.receipts.on} onChange={(v) => save({ receipts: { ...s.receipts, on: v } })} label="Receipts in my emails" />
    </Field>
    <Field label="Most receipt emails read by the AI per run">
      <select className="input" value={s.receipts.maxPerRun} onChange={(e) => save({ receipts: { ...s.receipts, maxPerRun: Number(e.target.value) } })} aria-label="Most receipt emails per run">
        {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </Field>
    <Field label="Warn me when a budget reaches">
      <select className="input" value={s.spend.alertAt} onChange={(e) => save({ spend: { ...s.spend, alertAt: Number(e.target.value) } })} aria-label="Warn at">
        {[0.5, 0.75, 0.8, 0.9].map((n) => <option key={n} value={n}>{Math.round(n * 100)}%</option>)}
      </select>
    </Field>
    {Object.keys(s.spend.rules).length > 0 && <Field label={`Shops you moved to another category: ${Object.keys(s.spend.rules).length}`}><button className="btn" onClick={() => save({ spend: { ...s.spend, rules: {} } })}>Reset</button></Field>}
    <Field label="Read order emails for returns & warranties" hint="A free check first; only real orders and receipts go to the AI (free ones first).">
      <Toggle on={s.purchases.on} onChange={(v) => save({ purchases: { ...s.purchases, on: v } })} label="Order emails" />
    </Field>
    <Field label="Most order emails read per run">
      <input className="input w-20" type="number" min={1} max={30} value={s.purchases.maxPerRun} onChange={(e) => save({ purchases: { ...s.purchases, maxPerRun: Math.min(30, Math.max(1, Number(e.target.value) || 8)) } })} aria-label="Most per morning" />
    </Field>
  </>);

  const vaultBody = (<>
    <p className="text-sm text-slate-600 dark:text-slate-300">Your documents (pet records, medical, IDs, home, car, school, taxes, contracts…), kept privately in your own storage. Scan them in 📁 Vault, or let LifeTracker find them in Gmail.</p>
    <Field label="Find documents in my emails" hint={status?.google.gmail ? `Every hour: files attached to emails (vaccine records, certificates, policies, contracts, tax forms…) are saved straight in, with the email in the note. Receipts go to Money → Spending and bills straight into Money → Bills instead (Undo in the 🔔 Inbox). Newsletters are skipped. A free check first; the AI (free ones first) only reads what’s left, and never the same file twice.${status.mail?.vaultScanned ? ` Last look: ${new Date(status.mail.vaultScanned).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}` : 'Needs Gmail: Google → “Also read Gmail receipts”.'}>
      <Toggle on={s.vault.emails} onChange={(v) => saveVault({ emails: v })} label="Find documents in my emails" />
    </Field>
    <Field label="Most attachments read by the AI per run">
      <select className="input" value={s.vault.maxPerRun} onChange={(e) => saveVault({ maxPerRun: Number(e.target.value) })} aria-label="Most attachments per run">
        {[2, 4, 6, 10, 15].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </Field>
    <Field label="Heads-ups for documents that expire or are due" hint={`${s.papers.remind.join(', ')} days before (30 and 7 for things due again, like a vaccine), and on the day; in your calendar too.`}>
      <Toggle on={s.papers.on} onChange={(v) => save({ papers: { ...s.papers, on: v } })} label="Documents" />
    </Field>
    <p className="pt-2 text-[15px] font-semibold">People & pets</p>
    <p className="text-xs text-slate-500 dark:text-slate-400">Who documents can be for: {s.vault.people.map((p) => `${p.name} ${personIcon(p)}`).join(', ')}. The AI picks one of these when it reads a document.</p>
    <PeopleEditor people={s.vault.people} onChange={(people) => saveVault({ people })} />
    <p className="pt-2 text-[15px] font-semibold">🔒 Lock</p>
    <Field label="Lock the Vault with a PIN" hint="A privacy screen on this phone (4–6 digits): asked when you open the Vault. Your documents are always protected by your sign-in; only a scrambled copy of the PIN is kept.">
      <Toggle on={lock.on} onChange={(v) => setPin(v ? 'set' : 'off')} label="Lock the Vault" />
    </Field>
    {lock.on && (
      <>
        <Field label="Lock again after" hint="And every time you leave the app.">
          <select className="input" value={lock.minutes} onChange={(e) => saveVault({ lock: { ...lock, minutes: Number(e.target.value) } })} aria-label="Lock again after">
            {[1, 5, 15, 30, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
        </Field>
        <button className="btn" onClick={() => setPin('change')}>Change the PIN</button>
      </>
    )}
    <button className="btn" disabled={!!busy || !s.vault.emails || !status?.google.gmail} onClick={() => void run('vault', async () => {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'vault' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'Nothing new in your emails.');
      await Promise.all([st.reload(), st.reloadStatus()]);
    })}>{busy === 'vault' ? <span className="spinner" /> : '✉️ Look in my emails now'}</button>
  </>);

  const weekBody = (<>
    <Field label="“My week” email" hint={status?.keys.email ? `A short summary to ${st.session.user.email}: money, bills coming, your name online, mailing lists, documents, credit.` : 'Needs RESEND_API_KEY on the server (free at resend.com). The same summary is always on Home.'}>
      <Toggle on={s.week.on} onChange={(v) => save({ week: { ...s.week, on: v } })} label="My week" />
    </Field>
    <Field label="Send it on">
      <select className="input" value={s.week.day} onChange={(e) => save({ week: { ...s.week, day: Number(e.target.value) } })} aria-label="Day">
        {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
    </Field>
    <button className="btn" disabled={!!busy || !status?.keys.email} onClick={() => void run('week', async () => {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'week' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'Sent.');
    })}>{busy === 'week' ? <span className="spinner" /> : '✉️ Send my week now'}</button>
  </>);

  const bankBody = (<>
    <p className="text-sm text-slate-700 dark:text-slate-300">Free and automatic: your banks email you each purchase, and LifeTracker reads those emails in Gmail every morning to find your bills and subscriptions. It only reads; nothing can be paid or moved.</p>
    <Field label="Read bank alert emails"><Toggle on={s.bank.alerts} onChange={(v) => save({ bank: { ...s.bank, alerts: v } })} label="Read bank alert emails" /></Field>
    <AlertBanks gmail={!!status?.google.gmail} read={status?.google.alertsRead ?? 0} banks={status?.google.alertBanks ?? []} last={status?.google.alertsScanned} onConnect={status?.keys.google ? () => void google(['gmail']) : undefined} />
    {status?.google.gmail && <button className="btn" disabled={!!busy} onClick={() => void sync()}>{busy === 'sync' ? <span className="spinner" /> : 'Read now'}</button>}
    <details className="pt-1">
      <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-300">Other option: a direct bank link with SimpleFIN (paid, about $15/year)</summary>
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
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
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
    <p className="text-xs text-slate-500 dark:text-slate-400">Read-only: nothing can be paid or moved. Read every morning. No link? Import a bank CSV in Inbox (the 🔔 bell at the top).</p>
  </>);

  const googleBody = (<>
    {!status?.keys.google && <p className="text-sm text-amber-800 dark:text-amber-200">Google isn’t set up on the server yet: see Guide → Setting it up (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).</p>}
    <div className="flex flex-wrap gap-2">
      {!status?.google.calendar && <button className="btn-primary" disabled={!!busy || !status?.keys.google} onClick={() => void google(['calendar'])}>📅 Connect Google Calendar</button>}
      {!status?.google.gmail && <button className="btn" disabled={!!busy || !status?.keys.google} onClick={() => void google(['gmail'])}>✉️ Also read Gmail receipts</button>}
      {status?.google.connected && <button className="btn text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => void disconnect('google')}>Disconnect</button>}
    </div>
    {(status?.google.connected || !!status?.googleExtras?.length) && (
      <GoogleAccounts
        main={status?.google.connected ? { email: status.google.email ?? null, gmail: !!status.google.gmail, calendar: !!status.google.calendar, lastScan: status.google.lastScan ?? status.google.lastGmail ?? null } : null}
        extras={status?.googleExtras ?? []} busy={busy} canAdd={!!status?.keys.google}
        onAdd={() => void addGoogle('new')} onToggle={(k, on) => void toggleExtra(k, on)} onDisconnect={(x) => void dropExtra(x)}
        onMailbox={(x) => { if (confirm(`Let LifeTracker manage mailing lists in ${x.email ?? 'this account'} too? It can then archive and label emails from senders you blocked or left (never deletes) and send the “unsubscribe” email some senders ask for.`)) void addGoogle(x.kind, ['gmail', 'mailbox']); }}
      />
    )}
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
      <p className="text-slate-600 dark:text-slate-300">Forward any bill or receipt to <b className="select-all break-all">{plus}</b>: it lands in your own Gmail and is read the next morning (Gmail reading must be on).</p>
    </div>
  </>);

  const apptsBody = (<>
    <p className="text-sm text-slate-600 dark:text-slate-300">Appointments in your emails and texts (doctor, dentist, car, haircut, reservations…) go <b>straight into your LifeTracker calendar</b>, with a heads-up. Moved or cancelled? The calendar follows. Wrong one? Remove it on Home.</p>
    <Field label="Find appointments in my emails" hint={status?.google.gmail ? `Every hour. Free check first; only emails that look like appointments go to the AI.${status.mail?.apptsScanned ? ` Last look: ${new Date(status.mail.apptsScanned).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` : ''}` : 'Needs Gmail: Google → “Also read Gmail receipts”.'}>
      <Toggle on={s.appts.on} onChange={(v) => save({ appts: { ...s.appts, on: v } })} label="Appointments" />
    </Field>
    <Field label="Remind me">
      <select className="input" value={s.appts.remind.join(',')} onChange={(e) => save({ appts: { ...s.appts, remind: e.target.value ? e.target.value.split(',').map(Number) : [] } })} aria-label="Appointment reminders">
        {!REMINDS.some(([v]) => v === s.appts.remind.join(',')) && <option value={s.appts.remind.join(',')}>Your own</option>}
        {REMINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
    <Field label="Time zone" hint="Times in emails and texts are read as this time zone.">
      <span className="flex items-center gap-2 text-sm">
        <b>{s.appts.timeZone || 'not set'}</b>
        {s.appts.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone && <button className="btn text-xs" onClick={() => save({ appts: { ...s.appts, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } })}>Use {Intl.DateTimeFormat().resolvedOptions().timeZone}</button>}
      </span>
    </Field>
    <TextsSetup phone={status?.phone} getKey={async () => { const r = await api<{ key: string; url: string }>('phone-key'); await st.reloadStatus(); return r; }} />
    <button className="btn" disabled={!!busy || !s.appts.on || !status?.google.gmail} onClick={() => void run('appts', async () => {
      const r = await api<{ log: { steps: string[]; errors: string[]; newAlerts: number } }>('run', { part: 'appts' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'No new appointment emails.');
      await st.reload();
    })}>{busy === 'appts' ? <span className="spinner" /> : '✉️ Look in my emails now'}</button>
  </>);

  const contactsBody = (<>
    <p className="text-sm text-slate-600 dark:text-slate-300">Your dentist, garage, insurer… with their phone, website and address. They’re found in Gmail, your appointments and bills and <b>added straight to Contacts</b>, one card per place (no doubles). Free rules read the emails; the AI only names a sender they can’t (free AIs first, a few a day at most, each sender once).</p>
    <Field label="Find contacts in my emails" hint={status?.google.gmail ? `Every morning, and with the emails read for appointments, bills and orders.${status.mail?.contactsScanned ? ` Last look: ${new Date(status.mail.contactsScanned).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}` : 'Needs Gmail: Google → “Also read Gmail receipts”.'}>
      <Toggle on={s.contacts.on} onChange={(v) => save({ contacts: { ...s.contacts, on: v } })} label="Find contacts in my emails" />
    </Field>
    <p className="text-xs text-slate-500 dark:text-slate-400">{st.contacts.filter((c) => c.status === 'active' && c.sources.some((x) => x !== 'hand')).length} found automatically · {st.contacts.filter((c) => c.status === 'active' && c.sources.every((x) => x === 'hand')).length} added by you · ★ {st.contacts.filter((c) => c.status === 'active' && c.favorite).length}</p>
    {st.contacts.some((c) => c.status === 'hidden') && (
      <details className="panel">
        <summary className="text-sm font-semibold">“Not a contact” ({st.contacts.filter((c) => c.status === 'hidden').length}): never added again</summary>
        <ul className="mt-1">
          {st.contacts.filter((c) => c.status === 'hidden').map((c) => (
            <li key={c.id} className="field flex min-h-[52px] items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <button className="btn text-xs" onClick={() => void st.setContact(c.id, { status: 'active' }).then(() => toast('ok', `${c.name} is back in Contacts.`)).catch((e) => toast('err', errText(e)))}>Show again</button>
            </li>
          ))}
        </ul>
      </details>
    )}
    <button className="btn" disabled={!!busy || !s.contacts.on || !status?.google.gmail} onClick={() => void run('contacts', async () => {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'contacts' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'Nothing new in your emails.');
      await Promise.all([st.reload(), st.reloadStatus()]);
    })}>{busy === 'contacts' ? <span className="spinner" /> : '✉️ Look in my emails now'}</button>
  </>);

  const nearbyBody = (<>
    <p className="text-sm text-slate-600 dark:text-slate-300">Your zip code is used for Places → 🔎 Nearby (the closest dentist, oil change, pizza…), things to do, the Friday “This weekend” list and the 💬 Ask bar (“find me a dentist”). Free first: the map is OpenStreetMap; only when it has little, and for events and day trips, the free Gemini searches Google (never Claude). Every search is kept, so it’s never paid twice.</p>
    <Field label="Zip code" hint="Distances are from the middle of this zip code. Empty = 45245.">
      <ZipField zip={zipOf(s)} onSave={(zip) => st.saveSettings({ ...s, place: { ...s.place, zip } })} />
    </Field>
    <Field label="“This weekend” every Friday" hint={`Friday morning: things to do near you and a bit farther (miles + drive time). On Home from Friday to Sunday, as a heads-up${status?.keys.email && s.notify.email ? ' and in the morning email' : ''}.`}>
      <Toggle on={s.place.weekend} onChange={(v) => save({ place: { ...s.place, weekend: v } })} label="This weekend list" />
    </Field>
    <button className="btn" disabled={!!busy} onClick={() => void run('weekend', async () => {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'weekend' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'Done.');
      await st.reload();
    })}>{busy === 'weekend' ? <span className="spinner" /> : '🎉 Make this weekend’s list now'}</button>
  </>);

  const aiBody = (<>
    <p className="text-sm text-slate-600 dark:text-slate-300">Tried in this order. The free ones go first; <b>Claude (paid)</b> only reads when they are over their daily limit, not set up, can’t read that file, or fail.</p>
    {[...free, 'claude' as Provider].map((p, idx) => {
      const info = PROVIDERS.find((x) => x.id === p)!;
      const sl = s.ai.slots[p];
      const used = status?.aiUsed?.[p] ?? 0;
      const key = status?.keys[p];
      return (
        <div key={p} className="panel space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="num text-xs text-slate-500 dark:text-slate-400">{idx + 1}</span>
            <b className="flex-1">{info.name} {info.paid ? <span className="chip border-amber-300 text-amber-800 dark:text-amber-200">paid · last</span> : <span className="chip border-emerald-300 text-emerald-800 dark:text-emerald-200">free</span>}</b>
            {!info.paid && <><button className="btn-ghost" aria-label={`Move ${info.name} up`} onClick={() => move(p, -1)}>↑</button><button className="btn-ghost" aria-label={`Move ${info.name} down`} onClick={() => move(p, 1)}>↓</button></>}
            <Toggle on={sl.on} onChange={(v) => slot(p, { on: v })} label={info.name} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className="input min-w-0 flex-1" value={sl.model} onChange={(e) => slot(p, { model: e.target.value })} aria-label={`${info.name} model`}>
              {info.models.map((m) => <option key={m.id} value={m.id}>{m.name}{!m.pdf ? ' (no PDFs)' : ''}{!m.pictures ? ' (text only)' : ''}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">a day
              <input className="input w-20" type="number" min={0} placeholder="no limit" value={sl.dailyLimit ?? ''} onChange={(e) => slot(p, { dailyLimit: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} aria-label={`${info.name} daily limit`} />
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{key === false ? `Not set up: add ${info.env} in Supabase → Edge Functions → Secrets.` : `Used today: ${used}${sl.dailyLimit != null ? ` of ${sl.dailyLimit}` : ''}.`}</p>
        </div>
      );
    })}
    <Field label="Most emails/documents read per morning"><input className="input w-20" type="number" min={1} max={50} value={s.ai.maxPerRun} onChange={(e) => save({ ai: { ...s.ai, maxPerRun: Math.min(50, Math.max(1, Number(e.target.value) || 15)) } })} aria-label="Most per run" /></Field>
  </>);

  const alertsBody = (<>
    <Field label="Email me new heads-ups each morning" hint={status?.keys.email ? `To ${st.session.user.email}.` : 'Needs RESEND_API_KEY on the server (free at resend.com).'}>
      <Toggle on={s.notify.email} onChange={(v) => save({ notify: { ...s.notify, email: v } })} label="Email" />
    </Field>
    <Field label="Bills not on autopay: warn me (days before)">
      <input className="input w-20" type="number" min={0} max={14} value={s.notify.dueDays} onChange={(e) => save({ notify: { ...s.notify, dueDays: Number(e.target.value) || 0 } })} aria-label="Days before due" />
    </Field>
    <Field label="Renewals and contract ends: warn me (days before)">
      <input className="input w-20" type="number" min={1} max={120} value={s.notify.renewalDays} onChange={(e) => save({ notify: { ...s.notify, renewalDays: Number(e.target.value) || 30 } })} aria-label="Days before renewal" />
    </Field>
  </>);

  // 📬 How often Gmail is read (pg_cron runs every quarter hour; your choice decides which ones read).
  const checksBody = (<>
    <MailEveryPicker every={s.mail.every} onChange={(n) => save({ mail: { ...s.mail, every: n } })} />
    {status?.mail?.check && <p className="text-xs text-slate-500 dark:text-slate-400">Last check: <span className="num">{new Date(status.mail.check.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>, {status.mail.check.text}.</p>}
    <MailPill every={s.mail.every} check={status?.mail?.check} />
    <p className="text-xs text-slate-500 dark:text-slate-400">This line shows at the top of every tab once Gmail is connected; tap it to come back here.</p>
  </>);

  const accountBody = (<>
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
    {status?.lastRun?.lastRun && <p className="text-xs text-slate-500 dark:text-slate-400">Last automatic run {new Date(status.lastRun.lastRun).toLocaleString()}: {[...(status.lastRun.steps ?? []), ...(status.lastRun.errors ?? []).map((e) => `⚠ ${e}`)].join(' · ') || 'nothing to do'}</p>}
    <div className="flex flex-wrap gap-2">
      <button className="btn" onClick={() => void exportAll()}>⬇ Download all my data</button>
      <button className="btn" onClick={() => void supabase.auth.signOut()}>Sign out</button>
    </div>
  </>);
  // Each section as a tile: a short live line, and the words inside it for the search.
  const nAi = [...free, 'claude' as Provider].filter((p) => s.ai.slots[p].on && status?.keys[p] !== false).length;
  const nContacts = st.contacts.filter((c) => c.status === 'active').length;
  const nBudgets = Object.keys(s.spend.budgets).length;
  const sections: (SettingsTile & { body?: ReactNode })[] = [
    { ...SEC.about, status: s.me.names.length ? `${s.me.names[0]}${s.me.places[0] ? ` · ${s.me.places[0]}` : ''}` : 'Not filled in', off: !s.me.names.length, body: aboutBody },
    { ...SEC.google, status: status?.google.connected ? [status.google.calendar && 'Calendar', status.google.gmail && 'Gmail'].filter(Boolean).join(' + ') || 'Connected' : 'Not connected', off: !status?.google.connected, body: googleBody },
    { ...SEC.checks, status: s.mail.every ? `Every ${s.mail.every < 60 ? `${s.mail.every} min` : s.mail.every === 60 ? 'hour' : `${s.mail.every / 60} hours`}` : 'Off · daily only', off: !s.mail.every, body: checksBody },
    { ...SEC.appts, status: s.appts.on ? `On · emails${status?.phone?.since ? ' + texts' : ''}` : 'Off', off: !s.appts.on, body: apptsBody },
    { ...SEC.spending, status: `${nBudgets} budget${nBudgets === 1 ? '' : 's'} · receipts ${s.receipts.on ? 'on' : 'off'}`, body: spendingBody },
    { ...SEC.bank, status: !s.bank.alerts ? 'Off' : status?.google.gmail ? `${status.google.alertsRead ?? 0} purchases read` : 'Needs Gmail', off: !s.bank.alerts || !status?.google.gmail, body: bankBody },
    { ...SEC.vault, status: `${st.papers.length} doc${st.papers.length === 1 ? '' : 's'} · ${lock.on ? '🔒 PIN' : 'no lock'}`, body: vaultBody },
    { ...SEC.contacts, status: `${nContacts} saved · ${s.contacts.on ? 'auto' : 'by hand'}`, body: contactsBody },
    { ...SEC.nearby, status: `${zipOf(s)} · weekend ${s.place.weekend ? 'on' : 'off'}`, body: nearbyBody },
    { ...SEC.mail, status: !s.unsub.on ? 'Off' : s.unsub.auto ? `Auto · ${s.unsub.days} days` : 'On · you choose', off: !s.unsub.on, body: mailBody },
    { ...SEC.week, status: s.week.on ? `Email on ${DAYS[s.week.day]}` : 'Email off', off: !s.week.on, body: weekBody },
    { ...SEC.alerts, status: s.notify.email ? 'App + email' : 'In the app', body: alertsBody },
    { ...SEC.ai, status: status ? `${nAi} AI${nAi === 1 ? '' : 's'} set up` : `${free.map((p) => providerOf(p).name).join(' → ')} → Claude`, body: aiBody },
    { ...SEC.apps, status: 'All your apps and their AI cost', href: appsUrl() },
    { ...SEC.guide, status: 'How everything works, in plain words', href: '#/guide' },
    { ...SEC.account, status: st.session.user.email ?? '', body: accountBody },
  ];
  const openSec = sections.find((x) => x.id === open && x.body);

  return (
    <div className="stagger mx-auto max-w-4xl space-y-3">
      <h1 className="text-[28px] font-semibold leading-tight">Settings</h1>
      {st.statusErr && <p className="card text-sm text-amber-800 dark:text-amber-200">The server didn’t answer: {st.statusErr}</p>}
      <SettingsSearch q={q} onChange={setQ} />
      <SettingsTiles tiles={sections} q={q} onOpen={show} />
      {openSec && <Sheet title={openSec.title} onClose={() => show(null)}><div className="space-y-2">{openSec.body}</div></Sheet>}
      {pin && (
        <Sheet title={pin === 'set' ? 'Choose a PIN' : pin === 'change2' ? 'Choose a new PIN' : 'Type your PIN'} onClose={() => setPin(null)}>
          {pin === 'set' || pin === 'change2' ? <NewPin onDone={(p) => newPin(p).catch((e) => toast('err', errText(e)))} />
            : <div className="space-y-4 text-center"><p className="text-sm text-slate-600 dark:text-slate-300">{pin === 'off' ? 'To turn the lock off, type your PIN.' : 'First, your PIN now.'}</p><PinPad fixed={lock.len || 4} shake={pinErr} onPin={(p) => void checkPin(p)} /></div>}
        </Sheet>
      )}
    </div>
  );
}
