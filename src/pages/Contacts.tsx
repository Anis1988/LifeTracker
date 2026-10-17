import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/supabase';
import { Empty, Seg, Sheet, errText, toast } from '../components/ui';
import { ContactDetails, ContactForm, ContactGroup, KindChips, MergePicker, SearchBox, arrange, kindOptions } from '../components/Contacts';
import { NearbyView } from '../components/Nearby';
import type { Contact } from '../../supabase/functions/_shared/model.ts';

const ago = (iso?: string | null) => {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** 📇 Your references: dentist, garage, insurer… found in Gmail, appointments and bills, or added by you. Searchable. */
export function Contacts() {
  const st = useStore();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState<'name' | 'recent'>(() => { try { return localStorage.getItem('lt.contactSort') === 'recent' ? 'recent' : 'name'; } catch { return 'name'; } });
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [merge, setMerge] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);
  // 📍 Nearby (places near your zip, things to do) lives here too: the places you might add to Contacts.
  const [view, setView] = useState<'mine' | 'nearby'>(() => { try { return /[?&]nearby/.test(location.hash) || sessionStorage.getItem('lt.contacts') === 'nearby' ? 'nearby' : 'mine'; } catch { return 'mine'; } });
  const pickView = (v: 'mine' | 'nearby') => { setView(v); try { sessionStorage.setItem('lt.contacts', v); } catch { /* private mode */ } };
  const open = st.contacts.find((c) => c.id === openId) ?? null;
  const options = useMemo(() => kindOptions(st.contacts), [st.contacts]);
  const groups = useMemo(() => arrange(st.contacts, { q, kind, sort }), [st.contacts, q, kind, sort]);
  const count = groups.reduce((a, g) => a + g.list.length, 0);
  const active = st.contacts.filter((c) => c.status === 'active').length;
  const gmail = !!st.status?.google.gmail;

  // "#/contacts?c=<id>" (from an appointment on Home) opens that card.
  useEffect(() => {
    const id = location.hash.match(/[?&]c=([\w-]+)/)?.[1];
    if (id) { setOpenId(id); pickView('mine'); history.replaceState(null, '', '#/contacts'); }
    else if (/[?&]nearby/.test(location.hash)) { pickView('nearby'); history.replaceState(null, '', '#/contacts'); }
  }, []);
  // A kind with nothing left (after "Not a contact" or a merge): back to All.
  useEffect(() => { if (!options.some((o) => o.id === kind)) setKind('all'); }, [options, kind]);
  const pickSort = (v: 'name' | 'recent') => { setSort(v); try { localStorage.setItem('lt.contactSort', v); } catch { /* private mode */ } };

  const look = async () => {
    setBusy(true);
    try {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'contacts' });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || 'Nothing new in your emails.');
      await Promise.all([st.reload(), st.reloadStatus()]);
    } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  const act = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); if (ok) toast('ok', ok); } catch (e) { toast('err', errText(e)); } };

  return (
    <div className="stagger mx-auto max-w-2xl space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="label">{active} saved</p>
          <h1 className="text-[28px] font-semibold leading-tight">Contacts</h1>
        </div>
        {view === 'mine' && <button className="btn-primary" onClick={() => setEdit({})}>＋ Add</button>}
      </div>
      <Seg label="Contacts or nearby" options={[['mine', '📇 My contacts'], ['nearby', '📍 Nearby']]} value={view} onChange={pickView} />
      {view === 'nearby' && <NearbyView />}
      {view === 'mine' && <>
      {active > 0 && (
        <div className="space-y-2">
          <SearchBox q={q} onChange={setQ} />
          <KindChips options={options} value={kind} onChange={setKind} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">{q ? `${count} match${count === 1 ? '' : 'es'}` : `${count} contact${count === 1 ? '' : 's'}`}</p>
            <Seg label="Sort" className="w-[176px]" options={[['name', 'A–Z'], ['recent', 'Recent']]} value={sort} onChange={pickSort} />
          </div>
        </div>
      )}
      {busy && (
        <div className="card space-y-3" role="status" aria-label="Looking in your emails">
          {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><div className="skel h-11 w-11 shrink-0 !rounded-2xl" /><div className="flex-1 space-y-2"><div className="skel h-3.5 w-2/3" /><div className="skel h-3 w-1/3" /></div></div>)}
        </div>
      )}
      {groups.map((g) => <ContactGroup key={g.title} title={g.title} list={g.list} onOpen={(c) => setOpenId(c.id)} />)}
      {active === 0 && !busy && (
        <Empty icon="📇">
          <p>Your dentist, garage, insurer… with their phone, website and address, all in one place.</p>
          <p className="mt-1.5">They come by themselves from your Gmail, appointments and bills{gmail ? '' : ' (connect Gmail in Settings)'}, or add one yourself.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={() => setEdit({})}>＋ Add a contact</button>
            {gmail && <button className="btn" onClick={() => void look()}>✉️ Look in my emails</button>}
          </div>
        </Empty>
      )}
      {active > 0 && !count && <Empty icon="🔎">Nothing matches “{q || 'this'}”. Try part of the name, a street, a kind or a few digits of the phone.</Empty>}
      {active > 0 && (
        <div className="panel flex flex-wrap items-center gap-3 text-sm">
          <button className="btn" disabled={busy || !gmail || !st.settings.contacts.on} onClick={() => void look()}>{busy ? <><span className="spinner" /> Looking…</> : '✉️ Look in my emails now'}</button>
          <span className="min-w-0 flex-1 basis-40 text-xs text-slate-500 dark:text-slate-400">{!st.settings.contacts.on ? 'Finding contacts in emails is off (Settings → Contacts).' : gmail ? `New ones come by themselves every morning. Last look ${ago(st.status?.mail?.contactsScanned)}.` : 'Connect Gmail (Settings → Google) to find them by themselves.'}</span>
        </div>
      )}
      </>}

      {open && (
        <Sheet title={open.name} onClose={() => setOpenId(null)}>
          <ContactDetails c={open}
            onFavorite={() => void act(() => st.setContact(open.id, { favorite: !open.favorite }))}
            onEdit={() => { setEdit(open); setOpenId(null); }}
            onMerge={() => { setMerge(open); setOpenId(null); }}
            onHide={() => { setOpenId(null); void act(() => st.setContact(open.id, { status: 'hidden' }), `${open.name} removed; it won’t come back from your emails. Settings → Contacts can bring it back.`); }}
            onDelete={() => { if (confirm(`Delete ${open.name}?`)) { setOpenId(null); void act(() => st.deleteContact(open.id), 'Deleted.'); } }} />
        </Sheet>
      )}
      {edit && (
        <Sheet title={edit.id ? `Edit ${edit.name}` : 'Add a contact'} onClose={() => setEdit(null)}>
          <ContactForm c={edit} onSave={st.saveContact} onDone={(saved) => { setEdit(null); if (saved) setOpenId(saved.id); }} />
        </Sheet>
      )}
      {merge && (
        <Sheet title="Same place as…" onClose={() => setMerge(null)}>
          <MergePicker c={merge} list={st.contacts} onPick={(other) => {
            if (!confirm(`Make “${other.name}” and “${merge.name}” one card?`)) return;
            const keep = merge;
            setMerge(null);
            void act(async () => { const m = await st.mergeContacts(keep, other); setOpenId(m.id); }, 'Now one card.');
          }} />
        </Sheet>
      )}
    </div>
  );
}
