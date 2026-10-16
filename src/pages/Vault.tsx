import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api, supabase } from '../lib/supabase';
import { Empty, Sheet, errText, toast } from '../components/ui';
import { KindChips, SearchBox } from '../components/Contacts';
import { LockScreen, NewPin, VaultDetails, VaultForm, VaultGroup, arrangeVault, vaultChips, type VaultReadResult } from '../components/Vault';
import { isOpen, hashPin, lockVault, onLockChange, pinOk, touchVault, unlockVault, waitLeft, wrongPin } from '../lib/vault';
import { biometric, canBiometric } from '../lib/biometric';
import type { Paper } from '../../supabase/functions/_shared/model.ts';

const ago = (iso?: string | null) => {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** 🔒 Open or locked (Settings → Vault → Lock): re-checked every few seconds, and locked when the app goes to the background. */
export function useVaultOpen(): boolean {
  const lock = useStore().settings.vault.lock;
  const [, tick] = useState(0);
  useEffect(() => {
    const off = onLockChange(() => tick((x) => x + 1));
    const t = setInterval(() => tick((x) => x + 1), 10_000);
    return () => { off(); clearInterval(t); };
  }, []);
  return !lock.on || isOpen();
}

/** 📁 Your documents: pets, medical, IDs, home, car, school, taxes, contracts… scanned, found in emails, or added by you. */
export function Vault() {
  const open = useVaultOpen();
  if (!open) return <Locked />;
  return <VaultList />;
}

function Locked() {
  const st = useStore();
  const s = st.settings;
  const lock = s.vault.lock;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [tries, setTries] = useState(0);
  const [bio, setBio] = useState(false);
  // "Forgot your PIN?" → signed out → signed in again (email or Google): then a new PIN can be chosen.
  const signedInAgain = !!lock.resetAsked && Date.parse(st.session.user.last_sign_in_at ?? '') > Date.parse(lock.resetAsked);
  useEffect(() => { void canBiometric().then(setBio); }, []);
  const tryPin = async (pin: string) => {
    const w = waitLeft();
    if (w) { setErr(`Too many tries: wait ${Math.ceil(w / 1000)} s.`); setShake((x) => x + 1); return; }
    setBusy(true);
    const ok = await pinOk(pin, lock);
    setBusy(false);
    if (ok) { setErr(''); unlockVault(lock.minutes); return; }
    const n = tries + 1;
    setTries(n);
    wrongPin(n);
    setErr(n % 5 === 0 ? 'Too many tries: wait a little.' : 'Wrong PIN. Try again.');
    setShake((x) => x + 1);
  };
  const forgot = async () => {
    if (!confirm('Forgot your PIN? You’ll be signed out. Sign in again with your email (or Google), and you can choose a new PIN.')) return;
    await st.saveSettings({ ...s, vault: { ...s.vault, lock: { ...lock, resetAsked: new Date().toISOString() } } }).catch(() => undefined);
    await supabase.auth.signOut();
  };
  if (signedInAgain) {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-4 text-center">
        <span className="orb mx-auto" aria-hidden="true">🔑</span>
        <h1 className="text-[28px] font-semibold leading-tight">Choose a new PIN</h1>
        <NewPin onDone={async (pin) => {
          const h = await hashPin(pin);
          await st.saveSettings({ ...s, vault: { ...s.vault, lock: { ...lock, ...h, len: pin.length, resetAsked: null } } });
          unlockVault(lock.minutes);
          toast('ok', 'New PIN saved.');
        }} />
      </div>
    );
  }
  return <LockScreen len={lock.len || 4} onPin={(p) => void tryPin(p)} busy={busy} error={err} shake={shake} bio={bio}
    onBio={() => void biometric('Open your Vault').then((ok) => ok && unlockVault(lock.minutes))} onForgot={() => void forgot()} />;
}

function VaultList() {
  const st = useStore();
  const s = st.settings;
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('all');
  const [who, setWho] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Paper> | null>(null);
  const [busy, setBusy] = useState(false);
  const docs = st.papers;
  const open = docs.find((p) => p.id === openId) ?? null;
  const chips = useMemo(() => vaultChips(docs, s), [docs, s]);
  const groups = useMemo(() => arrangeVault(docs, { q, folder, who }), [docs, q, folder, who]);
  const count = groups.reduce((a, g) => a + g.list.length, 0);
  const gmail = !!st.status?.google.gmail;
  const lock = s.vault.lock;

  // "#/vault?doc=<id>" (from Home or Me) opens that document; "#/vault?add" opens the scanner.
  useEffect(() => {
    const id = location.hash.match(/[?&]doc=([\w-]+)/)?.[1];
    if (id) setOpenId(id);
    if (/[?&]add\b/.test(location.hash)) setEdit({});
    if (id || /[?&]add\b/.test(location.hash)) history.replaceState(null, '', '#/vault');
  }, []);
  useEffect(() => { if (!chips.folders.some((o) => o.id === folder)) setFolder('all'); if (!chips.people.some((o) => o.id === who)) setWho('all'); }, [chips, folder, who]);
  // Using the Vault keeps it open; the minutes count from the last tap.
  useEffect(() => {
    if (!lock.on) return;
    const f = () => touchVault(lock.minutes);
    window.addEventListener('pointerdown', f);
    return () => window.removeEventListener('pointerdown', f);
  }, [lock.on, lock.minutes]);

  const look = async () => {
    setBusy(true);
    try {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'vault' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'Nothing new in your emails.');
      await Promise.all([st.reload(), st.reloadStatus()]);
    } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  const remove = (p: Paper) => {
    if (!confirm(`Delete “${p.name}” and its files? This can’t be undone.`)) return;
    setOpenId(null);
    void st.deletePaper(p).then(() => toast('ok', 'Deleted.')).catch((e) => toast('err', errText(e)));
  };

  return (
    <div className="stagger mx-auto max-w-2xl space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label">{docs.length} document{docs.length === 1 ? '' : 's'}</p>
          <h1 className="text-[28px] font-semibold leading-tight">Vault</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          {lock.on && <button className="btn h-11 w-11 !p-0" aria-label="Lock the Vault now" title="Lock now" onClick={() => lockVault()}>🔒</button>}
          <button className="btn-primary" onClick={() => setEdit({})}>📷 Scan</button>
        </div>
      </div>
      {docs.length > 0 && (
        <div className="space-y-2">
          <SearchBox q={q} onChange={setQ} placeholder="Title, Daizy, vaccine, tag…" label="Search documents" />
          <KindChips options={chips.folders} value={folder} onChange={setFolder} label="Folder" />
          {chips.people.length > 2 && <KindChips options={chips.people} value={who} onChange={setWho} label="For whom" />}
          <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">{q ? `${count} match${count === 1 ? '' : 'es'}` : `${count} document${count === 1 ? '' : 's'}`}</p>
        </div>
      )}
      {busy && (
        <div className="card space-y-3" role="status" aria-label="Looking in your emails">
          {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><div className="skel h-11 w-11 shrink-0 !rounded-2xl" /><div className="flex-1 space-y-2"><div className="skel h-3.5 w-2/3" /><div className="skel h-3 w-1/3" /></div></div>)}
        </div>
      )}
      {groups.map((g) => <VaultGroup key={g.title} title={g.title} list={g.list} s={s} onOpen={(p) => setOpenId(p.id)} />)}
      {!docs.length && !busy && (
        <Empty icon="📁">
          <p>Keep every important paper here: your pet’s vaccines, medical papers, IDs, the car, the house, school, taxes, contracts…</p>
          <p className="mt-1.5">Scan it with the camera and it’s read for you, or let LifeTracker find them in your emails{gmail ? '' : ' (connect Gmail in Settings)'}.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={() => setEdit({})}>📷 Scan a document</button>
            {gmail && <button className="btn" onClick={() => void look()}>✉️ Look in my emails</button>}
          </div>
        </Empty>
      )}
      {docs.length > 0 && !count && <Empty icon="🔎">Nothing matches{q ? ` “${q}”` : ''}. Try a name, a pet, a word on the document or a tag.</Empty>}
      {docs.length > 0 && (
        <div className="panel flex flex-wrap items-center gap-3 text-sm">
          <button className="btn" disabled={busy || !gmail || !s.vault.emails} onClick={() => void look()}>{busy ? <><span className="spinner" /> Looking…</> : '✉️ Look in my emails now'}</button>
          <span className="min-w-0 flex-1 basis-40 text-xs text-slate-500 dark:text-slate-400">{!s.vault.emails ? 'Finding documents in emails is off (Settings → Vault).' : gmail ? `Important files attached to your emails come by themselves every hour; receipts go to Money → Spending, bills to Inbox. Last checked ${ago(st.status?.mail?.vaultScanned)}.` : 'Connect Gmail (Settings → Google) to find them by themselves.'}</span>
        </div>
      )}

      {open && (
        <Sheet title={open.name} onClose={() => setOpenId(null)}>
          <VaultDetails p={open} s={s} onEdit={() => { setEdit(open); setOpenId(null); }} onDelete={() => remove(open)} />
        </Sheet>
      )}
      {edit && (
        <Sheet title={edit.id ? `Edit ${edit.name}` : 'Add a document'} onClose={() => setEdit(null)}>
          <VaultForm doc={edit} s={s} userId={st.session.user.id} existing={docs}
            onSave={async (p) => { const saved = await st.savePaper(p); toast('ok', `${saved.name} saved in your Vault.`); setTimeout(() => setOpenId(saved.id), 50); }}
            onDelete={edit.id ? () => st.deletePaper(edit as Paper) : undefined}
            onDone={() => setEdit(null)} read={(path) => api<VaultReadResult>('vault-read', { path })}
            onReceipt={async (path) => { const r = await api<{ text: string }>('receipt-add', { path }); toast('ok', r.text); await st.reload(); }} />
        </Sheet>
      )}
    </div>
  );
}
