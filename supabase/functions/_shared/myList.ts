/**
 * 📌 My list (Contacts → 📍 Nearby): the places and things to do you saved, to go to one day, then mark "Been there".
 * Plain TypeScript shared by the app (no Deno/browser APIs).
 */
import { milesBetween, spotKind, type Spot } from './place.ts';
import { addrKey, nameKey, sameName } from './contacts.ts';

export interface ListPlace {
  id: string; user_id: string;
  name: string; kind: string;
  address: string | null; phone: string | null; website: string | null;
  lat: number | null; lon: number | null;
  miles: number | null; minutes: number | null; route: boolean;
  when_text: string | null; about: string | null; source: string | null;
  note: string | null; planned: string | null; // yyyy-mm-dd
  done: boolean; done_at: string | null; rating: number | null;
  created_at: string; updated_at: string;
}

/** What gets saved from a Nearby result (a snapshot: miles and drive time as they were from your zip that day). */
export function spotToPlace(s: Spot) {
  return {
    name: s.name.slice(0, 120), kind: s.kind, address: s.address?.slice(0, 300) || null, phone: s.phone?.slice(0, 40) || null, website: s.website?.slice(0, 300) || null,
    lat: s.lat || null, lon: s.lon || null, miles: Number.isFinite(s.miles) ? s.miles : null, minutes: Number.isFinite(s.minutes) ? Math.round(s.minutes) : null, route: !!s.route,
    when_text: s.when?.slice(0, 120) || null, about: s.about?.slice(0, 300) || null, source: s.source?.slice(0, 500) || null,
  };
}

type Where = Pick<ListPlace, 'name' | 'address' | 'lat' | 'lon'>;
/** The same place? Same name, and less than half a mile apart (or the same street number when there's no map point). */
export function samePlace(a: Where, b: Where): boolean {
  if (!(nameKey(a.name) === nameKey(b.name) || sameName(a.name, b.name))) return false;
  if (a.lat && a.lon && b.lat && b.lon) return milesBetween({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) < 0.5;
  const ka = addrKey(a.address), kb = addrKey(b.address);
  return !ka || !kb || ka === kb;
}
export const onList = (list: ListPlace[], s: Spot) => { const p = spotToPlace(s); return list.find((x) => samePlace(x, p)) ?? null; };

export type ListFilter = 'todo' | 'done' | 'all';
export type ListSort = 'near' | 'new' | 'planned';
/** Search (name, address, note, kind, event day), filter and sort. */
export function arrangeList(list: ListPlace[], o: { q: string; filter: ListFilter; sort: ListSort }): ListPlace[] {
  const words = o.q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (p: ListPlace) => [p.name, p.address, p.note, p.kind, spotKind(p.kind).label, p.about, p.when_text].filter(Boolean).join(' ').toLowerCase();
  const far = (p: ListPlace) => p.miles ?? 1e9;
  return list
    .filter((p) => (o.filter === 'all' ? true : o.filter === 'done' ? p.done : !p.done))
    .filter((p) => words.every((w) => hay(p).includes(w)))
    .sort((a, b) => o.sort === 'near' ? far(a) - far(b)
      : o.sort === 'planned' ? (a.planned ?? '9999').localeCompare(b.planned ?? '9999') || far(a) - far(b)
      : b.created_at.localeCompare(a.created_at));
}
