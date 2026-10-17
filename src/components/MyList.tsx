import { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from '../lib/store';
import { Empty, Seg, Sheet, errText, toast } from './ui';
import { PhoneIcon, SearchBox, mapUrl, siteText, tel } from './Contacts';
import { fmtPhone } from '../../supabase/functions/_shared/contacts.ts';
import { driveText, milesText, spotKind } from '../../supabase/functions/_shared/place.ts';
import { arrangeList, type ListFilter, type ListPlace, type ListSort } from '../../supabase/functions/_shared/myList.ts';

/** 📌 My list: the places and things to do saved from Nearby. Search, filter, edit, delete, and "Been there ✓". */

const dayText = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC', ...(d.slice(0, 4) !== String(new Date().getFullYear()) ? { year: 'numeric' } : {}) });
const doneText = (at: string | null) => (at ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(at.slice(0, 4) !== String(new Date().getFullYear()) ? { year: 'numeric' } : {}) }) : '');

/** 1–5 stars. With onChange they are buttons (tap the same star again to clear). */
export function Stars({ value, onChange, size = 'sm' }: { value: number | null; onChange?: (v: number | null) => void; size?: 'sm' | 'lg' }) {
  const v = value ?? 0;
  if (!onChange) return v ? <span className="text-sm tracking-[1px] text-amber-500 dark:text-amber-300" aria-label={`${v} out of 5 stars`}>{'★'.repeat(v)}<span className="text-slate-300 dark:text-slate-600">{'★'.repeat(5 - v)}</span></span> : null;
  return (
    <div className="flex" role="radiogroup" aria-label="How was it?">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(v === n ? null : n)}
          className={`tap flex h-11 w-11 items-center justify-center rounded-full ${size === 'lg' ? 'text-[28px]' : 'text-[22px]'} ${n <= v ? 'text-amber-500 dark:text-amber-300' : 'text-slate-300 dark:text-slate-600'}`}>★</button>
      ))}
    </div>
  );
}

const SPARKS = ['#14b8a6', '#a78bfa', '#f59e0b', '#14b8a6', '#f472b6', '#a78bfa', '#f59e0b', '#22c55e', '#14b8a6', '#a78bfa'];
/** The "BEEN THERE ✓" stamp. `fresh` = it slams onto the card with a burst of sparks (no motion when the phone asks for less). */
export function DoneStamp({ fresh }: { fresh?: boolean }) {
  return (
    <span className={`stamp ${fresh ? 'slam' : ''}`} aria-hidden="true">
      BEEN THERE ✓
      {fresh && SPARKS.map((c, i) => <i key={i} className="spark" style={{ '--a': `${i * 36 + 8}deg`, '--c': c, animationDelay: `${0.22 + (i % 3) * 0.03}s` } as CSSProperties} />)}
    </span>
  );
}

/** One saved place: tap it to edit; call, website, map; "✓ Been there" (then "How was it?"). */
export function PlaceCard({ p, fresh, asking, onOpen, onDone, onRate }: { p: ListPlace; fresh?: boolean; asking?: boolean; onOpen: () => void; onDone: () => void; onRate: (v: number | null) => void }) {
  const k = spotKind(p.kind);
  return (
    <article className={`card relative !p-3 ${fresh ? 'thud' : ''} ${p.done ? 'bg-emerald-500/[0.04] dark:bg-emerald-300/[0.03]' : ''}`}>
      <button className="tap flex w-full items-start gap-3 rounded-[20px] p-1 text-left" onClick={onOpen} aria-label={`${p.name}${p.done ? ', been there' : ''}. Open to edit`}>
        <span className="tile" aria-hidden="true">{k.icon}</span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className={`block font-semibold leading-snug ${p.done ? 'pr-[108px]' : ''}`}>{p.name}</span>
          <span className={`block text-xs text-slate-500 dark:text-slate-400 ${p.done ? 'pr-[100px]' : ''}`}>{k.label}{p.about && p.about.toLowerCase() !== k.label.toLowerCase() ? ` · ${p.about}` : ''}</span>
          {p.when_text && <span className="block text-xs font-semibold text-violet-700 dark:text-violet-300">🎟️ {p.when_text}</span>}
          {p.miles != null && (
            <span className="num flex flex-wrap items-center gap-x-2 text-xs font-semibold text-teal-800 dark:text-teal-200">
              <span>📍 {milesText(p.miles)}</span>
              {p.minutes != null && <><span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span><span>🚗 {driveText({ minutes: p.minutes, route: p.route })}</span></>}
            </span>
          )}
          {p.address && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{p.address}</span>}
          {p.planned && !p.done && <span className="block text-xs font-semibold text-amber-700 dark:text-amber-300">🗓️ Planned {dayText(p.planned)}</span>}
          {p.done && <span className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><span>✓ Been there {doneText(p.done_at)}</span><Stars value={p.rating} /></span>}
          {p.note && <span className="line-clamp-2 block text-xs italic text-slate-600 dark:text-slate-300">“{p.note}”</span>}
        </span>
      </button>
      {p.done && <DoneStamp fresh={fresh} />}
      {asking && (
        <div className="mx-1 mt-2 flex flex-wrap items-center gap-x-2 rounded-2xl bg-amber-400/10 px-3 py-1 animate-[popin_.4s_var(--spring)_.5s_backwards] dark:bg-amber-300/10">
          <span className="text-sm font-semibold">How was it?</span>
          <Stars value={p.rating} onChange={onRate} />
          <button className="btn-ghost ml-auto text-xs text-slate-500 dark:text-slate-400" onClick={() => onRate(p.rating)}>Skip</button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5 sm:pl-14">
        {p.phone && <a href={tel(p.phone)} className="btn h-11 w-11 !rounded-full !p-0 text-teal-700 dark:text-teal-200" aria-label={`Call ${p.name}, ${fmtPhone(p.phone)}`}><PhoneIcon /></a>}
        {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="btn !px-3 text-xs" aria-label={`Website of ${p.name}: ${siteText(p.website)}`}>🌐 Site</a>}
        <a href={mapUrl(p.address ? `${p.name}, ${p.address}` : p.lat && p.lon ? `${p.lat},${p.lon}` : p.name)} target="_blank" rel="noreferrer" className="btn !px-3 text-xs" aria-label={`Map of ${p.name}`}>🗺️ Map</a>
        {!p.done && <button className="btn ml-auto !px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300" onClick={onDone}>✓ Been there</button>}
      </div>
    </article>
  );
}

const L = 'block text-sm font-semibold';
/** Edit a saved place (name, note, planned day, address, phone, website, stars), mark done / not done, delete. */
function PlaceForm({ p, onClose }: { p: ListPlace; onClose: () => void }) {
  const st = useStore();
  const [x, setX] = useState({ name: p.name, note: p.note ?? '', planned: p.planned ?? '', address: p.address ?? '', phone: p.phone ?? '', website: p.website ?? '', rating: p.rating });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof x>) => setX((cur) => ({ ...cur, ...patch }));
  const act = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await f(); toast('ok', ok); onClose(); } catch (e) { toast('err', errText(e)); setBusy(false); }
  };
  const site = x.website.trim();
  const save = () => act(() => st.editPlace(p.id, {
    name: x.name.trim().slice(0, 120), note: x.note.trim() || null, planned: x.planned || null, address: x.address.trim() || null, phone: x.phone.trim() || null,
    website: site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null, rating: p.done ? x.rating : p.rating,
  }), 'Saved.');
  return (
    <div className="space-y-3">
      <label className={L}>Name<input className="input mt-1 w-full" value={x.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" /></label>
      <label className={L}>Note<textarea className="input mt-1 min-h-[88px] w-full py-2" value={x.note} onChange={(e) => set({ note: e.target.value })} placeholder="Who to go with, what to try, opening hours…" /></label>
      <label className={L}>Planned day <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
        <span className="mt-1 flex gap-2"><input className="input min-w-0 flex-1" type="date" value={x.planned} onChange={(e) => set({ planned: e.target.value })} />{x.planned && <button type="button" className="btn" onClick={() => set({ planned: '' })}>Clear</button>}</span>
      </label>
      <label className={L}>Address<input className="input mt-1 w-full" value={x.address} onChange={(e) => set({ address: e.target.value })} /></label>
      <label className={L}>Phone<input className="input mt-1 w-full" type="tel" inputMode="tel" value={x.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
      <label className={L}>Website<input className="input mt-1 w-full" type="url" inputMode="url" value={x.website} onChange={(e) => set({ website: e.target.value })} autoCapitalize="off" /></label>
      {p.done && <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">How was it?</span><Stars value={x.rating} onChange={(v) => set({ rating: v })} size="lg" /></div>}
      <div className="flex gap-2 pt-1">
        <button className="btn-primary flex-1" disabled={busy || !x.name.trim()} onClick={() => void save()}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-900/[0.06] pt-3 dark:border-white/[0.06]">
        {p.done
          ? <button className="btn flex-1" disabled={busy} onClick={() => void act(() => st.editPlace(p.id, { done: false, done_at: null, rating: null }), 'Back on the to-do list.')}>↩ Not done yet</button>
          : null}
        <button className="btn flex-1 text-rose-700 dark:text-rose-300" disabled={busy} onClick={() => { if (confirm(`Delete ${p.name} from My list?`)) void act(() => st.deletePlace(p.id), 'Deleted.'); }}>🗑 Delete</button>
      </div>
    </div>
  );
}

/** Contacts → 📍 Nearby → 📌 My list. */
export function MyListView({ onFind }: { onFind: () => void }) {
  const st = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ListFilter>('todo');
  const [sort, setSort] = useState<ListSort>(() => { try { const v = localStorage.getItem('lt.listSort'); return v === 'new' || v === 'planned' ? v : 'near'; } catch { return 'near'; } });
  const [openId, setOpenId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null); // just marked done: the stamp slams on
  const [asking, setAsking] = useState<string | null>(null); // "How was it?"
  const all = st.places;
  const done = all.filter((p) => p.done).length;
  // A place marked done right now stays in view (with its stamp) until you leave the "To do" filter.
  const list = useMemo(() => {
    const shown = arrangeList(all, { q, filter, sort });
    const keep = fresh && filter === 'todo' ? all.find((p) => p.id === fresh && p.done) : null;
    return keep && !shown.includes(keep) ? arrangeList([...shown, keep], { q: '', filter: 'all', sort }) : shown;
  }, [all, q, filter, sort, fresh]);
  const open = all.find((p) => p.id === openId) ?? null;
  const pickSort = (v: ListSort) => { setSort(v); try { localStorage.setItem('lt.listSort', v); } catch { /* private mode */ } };
  const pickFilter = (v: ListFilter) => { setFilter(v); setFresh(null); setAsking(null); };

  const markDone = async (p: ListPlace) => {
    setFresh(p.id); setAsking(p.id);
    navigator.vibrate?.(18);
    try { await st.editPlace(p.id, { done: true, done_at: new Date().toISOString() }); } catch (e) { toast('err', errText(e)); setFresh(null); setAsking(null); }
  };
  const rate = async (p: ListPlace, v: number | null) => {
    setAsking(null);
    if (v === p.rating) return;
    try { await st.editPlace(p.id, { rating: v }); if (v) toast('ok', `${'★'.repeat(v)} saved for ${p.name}.`); } catch (e) { toast('err', errText(e)); }
  };

  if (!all.length) return (
    <Empty icon="📌">
      <p>Places you’d like to go: a restaurant to try, a park, an event, a day trip.</p>
      <p className="mt-1.5">Tap <b>＋ My list</b> on anything in 🔎 Find or 🎉 Things to do. Then mark it <b>Been there ✓</b> when you’ve done it.</p>
      <button className="btn-primary mt-3" onClick={onFind}>🔎 Find a place</button>
    </Empty>
  );
  return (
    <div className="space-y-3">
      <SearchBox q={q} onChange={setQ} placeholder="Name, street, note, kind…" label="Search my list" />
      <Seg label="Show" options={[['todo', `To do · ${all.length - done}`], ['done', `✓ Done · ${done}`], ['all', `All · ${all.length}`]]} value={filter} onChange={pickFilter} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">{list.length} {q ? `match${list.length === 1 ? '' : 'es'}` : `place${list.length === 1 ? '' : 's'}`}</p>
        <Seg label="Sort" className="w-[236px]" options={[['near', 'Closest'], ['new', 'Newest'], ['planned', 'Planned']]} value={sort} onChange={pickSort} />
      </div>
      {list.map((p) => <PlaceCard key={p.id} p={p} fresh={fresh === p.id && p.done} asking={asking === p.id && p.done} onOpen={() => setOpenId(p.id)} onDone={() => void markDone(p)} onRate={(v) => void rate(p, v)} />)}
      {!list.length && (q
        ? <Empty icon="🔎">Nothing on your list matches “{q}”. Try part of the name, a street, a word from your note or a kind (“park”, “pizza”).</Empty>
        : filter === 'done' ? <Empty icon="🏁">Nothing marked <b>Been there</b> yet. Tap <b>✓ Been there</b> on a place when you’ve gone.</Empty>
        : <Empty icon="🎉">All done! Everything on your list has its <b>Been there</b> stamp. Find more in 🎉 Things to do.</Empty>)}
      {open && <Sheet title={open.name} onClose={() => setOpenId(null)}><PlaceForm key={open.id} p={open} onClose={() => setOpenId(null)} /></Sheet>}
    </div>
  );
}
