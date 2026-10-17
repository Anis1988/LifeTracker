import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/supabase';
import { Empty, Seg, errText, toast, useStrip } from './ui';
import { PhoneIcon, SearchBox, mapUrl, siteText, tel } from './Contacts';
import { contactKey, fmtPhone, sameContact } from '../../supabase/functions/_shared/contacts.ts';
import { TODO_KINDS, driveText, milesText, spotKind, spotToContact, zipOf, type NearbyResult, type Spot, type TodoKind, type Weekend } from '../../supabase/functions/_shared/place.ts';
import { settingsHref } from './SettingsGrid';
import type { Contact } from '../../supabase/functions/_shared/model.ts';
import { onList, type ListPlace } from '../../supabase/functions/_shared/myList.ts';
import { takeParam } from '../lib/nav';

/** 📍 Nearby: places near your zip (closest first, miles + drive time), things to do, and this weekend's list. */

const contactFor = (list: Contact[], s: Spot) => { const c = spotToContact(s); return list.find((x) => x.status === 'active' && sameContact(x, c)) ?? null; };
const addedHere = new Set<string>(); // contacts made from a Nearby tap during this visit of the app

/**
 * Was this contact made from this place (by "＋ Contacts")? Then "✓ In Contacts" can take it away again.
 * Same identity key as when it was added, only "added by you", and the "… near you" line it was saved with.
 * A contact found in your emails, or one you already had, is never removed from here.
 */
function fromSpot(c: Contact, s: Spot) {
  if (addedHere.has(c.id)) return true;
  const k = contactKey(spotToContact(s));
  return (c.key === k || c.key.startsWith(`${k}#`)) && c.sources.every((x) => x === 'hand') && (c.description ?? '').startsWith(`${spotKind(s.kind).label} near you:`);
}

/** Miles from your zip and the drive time ("about" = an estimate). */
export function Distance({ s }: { s: Spot }) {
  return (
    <span className="num inline-flex flex-wrap items-center gap-x-2 text-xs font-semibold text-teal-800 dark:text-teal-200">
      <span>📍 {milesText(s.miles)}</span><span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span><span>🚗 {driveText(s)}</span>
    </span>
  );
}

/** One place: name, where, miles + drive time; call, website, map, "＋ My list" and "＋ Contacts". */
export function SpotRow({ s, added, onAdd, listed, onSave }: { s: Spot; added?: boolean; onAdd?: () => void; listed?: boolean; onSave?: () => void }) {
  const k = spotKind(s.kind);
  const where = s.address || s.about || '';
  return (
    <li className="space-y-2 border-t border-slate-900/[0.06] py-3 first:border-0 dark:border-white/[0.06]">
      <div className="flex items-start gap-3">
        <span className="tile" aria-hidden="true">{k.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{s.name}</p>
          {s.when && <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">🗓️ {s.when}</p>}
          {where && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{where}</p>}
          {s.about && s.address && <p className="truncate text-xs text-slate-600 dark:text-slate-300">{s.about}</p>}
          <div className="mt-1"><Distance s={s} /></div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:pl-14">
        {s.phone && <a href={tel(s.phone)} className="btn h-11 w-11 !rounded-full !p-0 text-teal-700 dark:text-teal-200" aria-label={`Call ${s.name}, ${fmtPhone(s.phone)}`}><PhoneIcon /></a>}
        {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="btn !px-3 text-xs" aria-label={`Website of ${s.name}: ${siteText(s.website)}`}>🌐 Site</a>}
        {s.source && s.source !== s.website && <a href={s.source} target="_blank" rel="noreferrer" className="btn !px-3 text-xs" aria-label={`Where ${s.name} was found`}>🔗 Source</a>}
        <a href={mapUrl(s.address ? `${s.name}, ${s.address}` : `${s.lat},${s.lon}`)} target="_blank" rel="noreferrer" className="btn !px-3 text-xs" aria-label={`Map of ${s.name}`}>🗺️ Map</a>
        {onSave && <button className={`btn !px-3 text-xs ${listed ? '!border-violet-500/30 !bg-violet-500/10 !bg-none text-violet-800 dark:!border-violet-300/25 dark:!bg-violet-300/10 dark:text-violet-200' : ''}`} aria-pressed={!!listed} onClick={onSave}
          aria-label={listed ? `${s.name} is on My list. Tap to take it off` : `Save ${s.name} to My list`}>{listed ? '✓ On my list' : '＋ My list'}</button>}
        {onAdd && <button className={`btn !px-3 text-xs ${added ? '!border-teal-500/30 !bg-teal-500/10 !bg-none text-teal-800 dark:!border-teal-300/25 dark:!bg-teal-300/10 dark:text-teal-200' : ''}`} aria-pressed={!!added} onClick={onAdd}
          aria-label={added ? `${s.name} is in Contacts. Tap to take it out` : `Add ${s.name} to Contacts`}>{added ? '✓ In Contacts' : '＋ Contacts'}</button>}
      </div>
    </li>
  );
}

export function SpotList({ title, spots, contacts, onAdd, places, onSave }: { title: string; spots: Spot[]; contacts?: Contact[]; onAdd?: (s: Spot) => void; places?: ListPlace[]; onSave?: (s: Spot) => void }) {
  if (!spots.length) return null;
  return (
    <section className="card !px-3 !py-2">
      <p className="label px-1 pb-0.5 pt-1.5">{title} <span className="num">· {spots.length}</span></p>
      <ul>{spots.map((s, i) => <SpotRow key={`${s.name}-${i}`} s={s} added={contacts ? !!contactFor(contacts, s) : undefined} onAdd={onAdd && (() => onAdd(s))} listed={places ? !!onList(places, s) : undefined} onSave={onSave && (() => onSave(s))} />)}</ul>
    </section>
  );
}

const Loading = ({ label }: { label: string }) => (
  <div className="card space-y-3" role="status" aria-label={label}>
    {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><div className="skel h-11 w-11 shrink-0 !rounded-2xl" /><div className="flex-1 space-y-2"><div className="skel h-3.5 w-2/3" /><div className="skel h-3 w-1/2" /></div></div>)}
  </div>
);

/** Where the answers came from (OpenStreetMap's licence asks for its credit). */
export function Credit({ by, note }: { by: string[]; note?: string }) {
  return (
    <div className="space-y-1 px-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
      {note && <p className="text-amber-700 dark:text-amber-300">⚠ {note}</p>}
      <p>{by.length ? `From ${by.join(' + ')}. ` : ''}Map data © OpenStreetMap contributors. Drive times: road routes from OSRM, or an estimate marked “about”.</p>
    </div>
  );
}

/**
 * The two light-up buttons on a place, as on/off switches:
 * "＋ My list" saves a snapshot, tapping "✓ On my list" takes it off again (↶ Undo puts the same one back, note and stars too);
 * "＋ Contacts" adds it, tapping "✓ In Contacts" takes it out again, only when it was added from this place (↶ Undo).
 */
export function useSpotToggles() {
  const st = useStore();
  const toggleList = async (s: Spot) => {
    try {
      const old = onList(st.places, s);
      if (!old) { await st.savePlace(s); toast('ok', `📌 ${s.name} saved to My list.`); return; }
      await st.deletePlace(old.id);
      toast('ok', `${old.name} taken off My list.`, () => void st.restorePlace(old).catch((e) => toast('err', errText(e))));
    } catch (e) { toast('err', errText(e)); }
  };
  const toggleContact = async (s: Spot) => {
    try {
      const old = contactFor(st.contacts, s);
      if (!old) {
        const r = await st.saveContact(spotToContact(s));
        if (!r.merged) addedHere.add(r.contact.id);
        toast('ok', r.merged ? `${s.name} was already in Contacts: details added.` : `${s.name} added to Contacts.`);
        return;
      }
      if (!fromSpot(old, s)) { toast('info', `${old.name} was already in your Contacts, so it stays. To remove it, open it in Places → Contacts.`); return; }
      await st.deleteContact(old.id);
      addedHere.delete(old.id);
      toast('ok', `${old.name} taken out of Contacts.`, () => void st.restoreContact(old).then(() => { addedHere.add(old.id); }).catch((e) => toast('err', errText(e))));
    } catch (e) { toast('err', errText(e)); }
  };
  return { toggleList, toggleContact };
}

type Mode = 'find' | 'todo';
const QUICK = ['Dentist', 'Oil change', 'Pizza', 'Pharmacy', 'Urgent care', 'Vet', 'Coffee', 'Hair salon', 'Grocery'];

/** Places → 🔎 Nearby: 🔎 Find (a search box) and 🎉 Things to do. (📌 My list is its own view in Places.) */
export function NearbyView() {
  const st = useStore();
  const zip = zipOf(st.settings);
  const [mode, setMode] = useState<Mode>(() => { try { return localStorage.getItem('lt.nearbyMode') === 'todo' && !/[?&]find/.test(location.hash) ? 'todo' : 'find'; } catch { return 'find'; } });
  const { toggleList: save, toggleContact: add } = useSpotToggles();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<NearbyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<TodoKind | null>(null); // nothing is looked up until you tap one
  const quick = useStrip<HTMLDivElement>(res?.q);
  const [todo, setTodo] = useState<Partial<Record<TodoKind, NearbyResult>>>({});
  const [weekendOpen, setWeekendOpen] = useState(false);

  // Opening Nearby (or switching to Things to do) never searches by itself: only a tap on a word or a group, or Find.
  const pickMode = (m: Mode) => { setMode(m); try { localStorage.setItem('lt.nearbyMode', m); } catch { /* private mode */ } };
  // ＋ → "A place" lands here with "?find": the search box is ready to type in.
  const findBox = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (takeParam('find', '#/places/nearby') === null) return;
    setTimeout(() => findBox.current?.querySelector('input')?.focus(), 80);
  }, []);
  const search = async (text = q) => {
    const t = text.trim();
    if (t.length < 2) return;
    setQ(t); setBusy(true); setRes(null);
    try { setRes(await api<NearbyResult>('nearby', { op: 'search', q: t })); } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  const loadTodo = async (k: TodoKind) => {
    setKind(k);
    if (todo[k]) return;
    setBusy(true);
    try { const r = await api<NearbyResult>('nearby', { op: 'todo', kind: k }); setTodo((cur) => ({ ...cur, [k]: r })); } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void search(); };
  const town = res?.home ?? Object.values(todo)[0]?.home ?? (st.weekend?.home.zip === zip ? st.weekend.home : null);
  const cur = kind ? todo[kind] : undefined;
  const group = kind ? TODO_KINDS.find((k) => k.id === kind)! : null;
  const people = kind !== 'events' && kind !== 'trips'; // events and day trips aren't contacts

  return (
    <div className="space-y-3">
      <div className="panel flex items-center gap-3 text-sm">
        <span className="tile !h-9 !w-9 !rounded-xl !text-base" aria-hidden="true">📍</span>
        <span className="min-w-0 flex-1">Near <b className="num">{zip}</b>{town ? ` · ${town.town}, ${town.state}` : ''}<span className="block text-xs text-slate-500 dark:text-slate-400">Change your zip in <a className="tap underline decoration-teal-500/50 underline-offset-2" href={settingsHref('nearby')}>Settings → Nearby</a>.</span></span>
      </div>
      <Seg label="Nearby" options={[['find', '🔎 Find'], ['todo', '🎉 Things to do']]} value={mode} onChange={pickMode} />

      {mode === 'find' ? (
        <>
          <form ref={findBox} onSubmit={submit} className="flex gap-2">
            <div className="min-w-0 flex-1"><SearchBox q={q} onChange={setQ} placeholder="Dentist, oil change, pizza…" label="What are you looking for" /></div>
            <button className="btn-primary" type="submit" disabled={busy || q.trim().length < 2}>Find</button>
          </form>
          <div ref={quick} className="strip -mx-4 gap-1.5 px-4 py-1" role="group" aria-label="Quick words">
            {QUICK.map((w) => { const on = res?.q.toLowerCase() === w.toLowerCase(); return <button key={w} aria-pressed={on} className={`chip ${on ? 'border-teal-500/40 bg-teal-500/15 text-teal-900 dark:border-teal-300/30 dark:bg-teal-300/15 dark:text-teal-100' : 'border-slate-900/10 bg-transparent text-slate-600 dark:border-white/10 dark:text-slate-300'}`} onClick={() => void search(w)}>{w}</button>; })}
          </div>
          {busy && <Loading label="Looking near you" />}
          {res && !busy && (res.spots.length
            ? <SpotList title={`“${res.q}” closest first`} spots={res.spots} contacts={st.contacts} onAdd={(s) => void add(s)} places={st.places} onSave={(s) => void save(s)} />
            : <Empty icon="🔎">Nothing found for “{res.q}” near {res.home.zip}. Try another word (“dentist”, “auto repair”) or a shop’s name.</Empty>)}
          {res && !busy && <Credit by={res.by} note={res.note} />}
          {!res && !busy && <Empty icon="📍">Type what you need: “dentist”, “oil change”, “pizza”… The closest places to your zip come first, with the miles and the drive time. Add one to your Contacts with one tap.</Empty>}
        </>
      ) : (
        <>
          {st.weekend && st.weekend.home.zip === zip && <button className="card tap flex w-full items-center gap-3 text-left" onClick={() => setWeekendOpen(!weekendOpen)} aria-expanded={weekendOpen}>
            <span className="tile" aria-hidden="true">🎉</span>
            <span className="min-w-0 flex-1 text-sm"><b>Weekend of {new Date(`${st.weekend.friday}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b><span className="block text-xs text-slate-500 dark:text-slate-400">{st.weekend.events.length + st.weekend.near.length + st.weekend.far.length} ideas, made on Friday</span></span>
            <span aria-hidden="true" className="text-teal-600 dark:text-teal-300">{weekendOpen ? '−' : '+'}</span>
          </button>}
          {weekendOpen && st.weekend && <WeekendLists w={st.weekend} contacts={st.contacts} onAdd={(s) => void add(s)} places={st.places} onSave={(s) => void save(s)} />}
          <TodoButtons value={kind} busy={busy} onPick={(k) => void loadTodo(k)} />
          {busy && <Loading label="Looking for things to do" />}
          {group && cur && !busy && (cur.spots.length
            ? <SpotList title={group.label} spots={cur.spots} contacts={people ? st.contacts : undefined} onAdd={people ? (s) => void add(s) : undefined} places={st.places} onSave={(s) => void save(s)} />
            : <Empty icon={group.icon}>{kind === 'events' ? 'No events found with a source page right now. Events are looked up on the web (free Gemini first, Claude if needed) and only kept with a real link.' : 'Nothing found this time. Try again later.'}</Empty>)}
          {cur && !busy && <Credit by={cur.by} note={cur.note} />}
          {!kind && !busy && <Empty icon="🎉">Tap <b>Food</b>, <b>Fun</b>, <b>Events</b> or <b>Trips</b> to look for things to do near you. Nothing is looked up until you tap one.</Empty>}
        </>
      )}
    </div>
  );
}

const TODO_SHORT: Record<TodoKind, string> = { food: 'Food', fun: 'Fun', events: 'Events', trips: 'Trips' };
/** 🎉 Things to do: four buttons, nothing picked (and nothing looked up) until you tap one. */
export function TodoButtons({ value, busy, onPick }: { value: TodoKind | null; busy?: boolean; onPick: (k: TodoKind) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Things to do">
      {TODO_KINDS.map((k) => (
        <button key={k.id} type="button" aria-pressed={value === k.id} disabled={busy && value !== k.id} onClick={() => onPick(k.id)}
          className={`btn !h-auto min-h-[64px] flex-col !gap-0.5 !px-1 py-2 text-xs ${value === k.id ? '!border-teal-500/40 !bg-teal-500/15 !bg-none text-teal-900 dark:!border-teal-300/30 dark:!bg-teal-300/15 dark:text-teal-100' : ''}`}>
          <span className="text-xl leading-none" aria-hidden="true">{k.icon}</span>{TODO_SHORT[k.id]}
        </button>
      ))}
    </div>
  );
}

/** The whole weekend list: events, close by, a bit farther. */
export function WeekendLists({ w, contacts, onAdd, places, onSave }: { w: Weekend; contacts?: Contact[]; onAdd?: (s: Spot) => void; places?: ListPlace[]; onSave?: (s: Spot) => void }) {
  return (
    <div className="space-y-3">
      <SpotList title="🎟️ Events this weekend" spots={w.events} places={places} onSave={onSave} />
      <SpotList title="📍 Close by" spots={w.near} contacts={contacts} onAdd={onAdd} places={places} onSave={onSave} />
      <SpotList title="🗺️ A bit farther (day trips)" spots={w.far} places={places} onSave={onSave} />
      <Credit by={w.by} />
    </div>
  );
}

/** 🎉 Home card (Friday to Sunday): a few ideas with miles and drive time; "See all" opens the whole list. */
export function WeekendCard({ w, onAll }: { w: Weekend; onAll?: () => void }) {
  const top = [...w.events.slice(0, 2), ...w.near.slice(0, 2), ...w.far.slice(0, 1)];
  const n = w.events.length + w.near.length + w.far.length;
  return (
    <section className="card space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="label">🎉 This weekend near {w.home.town}</p>
        {onAll && <button className="btn-ghost -my-2 -mr-2 text-xs text-teal-700 dark:text-teal-300" onClick={onAll}>See all {n}</button>}
      </div>
      <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.06]">
        {top.map((s, i) => (
          <li key={`${s.name}-${i}`} className="flex items-center gap-3 py-2.5">
            <span className="tile !h-9 !w-9 !rounded-xl !text-base" aria-hidden="true">{spotKind(s.kind).icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{s.name}</span>
              {s.when && <span className="block truncate text-xs text-violet-700 dark:text-violet-300">{s.when}</span>}
              <Distance s={s} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Home, when there's no weekend list on screen: a way in to 📍 Nearby. */
export function NearbyLink({ zip, onGo, onMake, making, toDo, onList: openList }: { zip: string; onGo: () => void; onMake?: () => void; making?: boolean; toDo?: number; onList?: () => void }) {
  return (
    <div className="card flex flex-wrap items-center gap-3">
      <button className="tap -m-1 flex min-h-[52px] min-w-0 flex-1 basis-56 items-center gap-3 rounded-[20px] p-1 text-left" onClick={onGo}>
        <span className="tile" aria-hidden="true">📍</span>
        <span className="min-w-0 flex-1 text-sm"><b>Nearby</b><span className="block text-xs text-slate-500 dark:text-slate-400">A dentist, an oil change, pizza… or things to do near <span className="num">{zip}</span></span></span>
        <span aria-hidden="true" className="text-teal-600 dark:text-teal-300">→</span>
      </button>
      {!!toDo && openList && <button className="btn text-xs" onClick={openList}>📌 <span className="num">{toDo}</span> to do</button>}
      {onMake && <button className="btn text-xs" disabled={making} onClick={onMake}>{making ? <span className="spinner" /> : '🎉 This weekend’s list'}</button>}
    </div>
  );
}

/** Settings → Nearby: the zip code (checked on the server first: it must be a real US zip). */
export function ZipField({ zip, onSave }: { zip: string; onSave: (zip: string) => Promise<void> }) {
  const [text, setText] = useState(zip);
  const [busy, setBusy] = useState(false);
  const [town, setTown] = useState('');
  const save = async () => {
    const z = text.trim();
    if (!/^\d{5}$/.test(z)) return toast('err', 'A zip code is 5 digits, like 45245.');
    setBusy(true);
    try {
      const h = await api<{ town: string; state: string }>('nearby', { op: 'home', zip: z });
      setTown(`${h.town}, ${h.state}`);
      if (z !== zip) { await onSave(z); toast('ok', `Zip saved: ${h.town}, ${h.state}.`); }
    } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input className="input num w-28" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && void save()} aria-label="Zip code" />
        <button className="btn" disabled={busy || text.length !== 5} onClick={() => void save()}>{busy ? <span className="spinner" /> : text === zip ? 'Check' : 'Save'}</button>
      </div>
      {town && <p className="text-xs text-slate-500 dark:text-slate-400">📍 {town}</p>}
    </div>
  );
}
