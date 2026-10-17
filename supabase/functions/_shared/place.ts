/**
 * 📍 Nearby: the free maths shared by the app and the server functions (plain TypeScript only).
 * Distance = straight-line miles from the centre of your zip code (haversine). Drive time = a real road route from the
 * free OSRM server when it answers, else an estimate (roads ≈ 1.3 × the straight line; about 30 mph for short trips,
 * 45 mph up to 40 miles, 60 mph beyond), always shown as "about".
 */

export const DEFAULT_ZIP = '45245';
/** The zip in Settings when it is a real 5-digit US zip, else the default. */
export const zipOf = (s: { place?: { zip?: string } } | null | undefined) => (/^\d{5}$/.test(s?.place?.zip?.trim() ?? '') ? s!.place!.zip!.trim() : DEFAULT_ZIP);

export interface Home { zip: string; town: string; state: string; lat: number; lon: number }

export type SpotKind = 'dentist' | 'doctor' | 'pharmacy' | 'pet' | 'car' | 'food' | 'beauty' | 'fun' | 'shop' | 'home' | 'event' | 'trip' | 'other';
export const SPOT_KINDS: { id: SpotKind; icon: string; label: string; contact: string }[] = [
  { id: 'dentist', icon: '🦷', label: 'Dentist', contact: 'dentist' },
  { id: 'doctor', icon: '🩺', label: 'Doctor & health', contact: 'doctor' },
  { id: 'pharmacy', icon: '💊', label: 'Pharmacy', contact: 'doctor' },
  { id: 'pet', icon: '🐾', label: 'Pet', contact: 'pet' },
  { id: 'car', icon: '🚗', label: 'Car', contact: 'car' },
  { id: 'food', icon: '🍽️', label: 'Food & drink', contact: 'restaurant' },
  { id: 'beauty', icon: '💇', label: 'Hair & beauty', contact: 'beauty' },
  { id: 'fun', icon: '🎡', label: 'Fun', contact: 'other' },
  { id: 'shop', icon: '🛍️', label: 'Shop', contact: 'shop' },
  { id: 'home', icon: '🔧', label: 'Home & repairs', contact: 'home' },
  { id: 'event', icon: '🎟️', label: 'Event', contact: 'other' },
  { id: 'trip', icon: '🗺️', label: 'Day trip', contact: 'other' },
  { id: 'other', icon: '📍', label: 'Place', contact: 'other' },
];
export const spotKind = (id: string) => SPOT_KINDS.find((k) => k.id === id) ?? SPOT_KINDS[SPOT_KINDS.length - 1];

/** One place (or event) found near you. */
export interface Spot {
  name: string; kind: SpotKind;
  address: string | null; phone: string | null; website: string | null;
  lat: number; lon: number;
  miles: number; // straight line from the zip's centre
  minutes: number; // by car
  route: boolean; // true = a real road route (OSRM), false = an estimate ("about")
  from: 'osm' | 'web'; // OpenStreetMap, or the free Gemini with Google Search
  source?: string | null; // web finds: the page it came from (always one that really came back from the search)
  when?: string | null; // events: the day(s) and time, in words
  about?: string | null; // one short line
}

/** Things to do: what each group means. */
export type TodoKind = 'food' | 'fun' | 'events' | 'trips';
export const TODO_KINDS: { id: TodoKind; icon: string; label: string }[] = [
  { id: 'food', icon: '🍽️', label: 'Restaurants' },
  { id: 'fun', icon: '🎡', label: 'Fun places' },
  { id: 'events', icon: '🎟️', label: 'Events' },
  { id: 'trips', icon: '🗺️', label: 'Day trips' },
];

export interface NearbyResult { home: Home; q: string; spots: Spot[]; by: string[]; at: string; note?: string; cached?: boolean }
/** 🎉 "This weekend": made on Friday morning, once per weekend (cached, never paid twice). */
export interface Weekend { home: Home; friday: string; near: Spot[]; far: Spot[]; events: Spot[]; by: string[]; at: string }

const R = 3958.8; // Earth's radius in miles
export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Drive time estimate in minutes from straight-line miles (used when the road route isn't available). */
export function driveEstimate(miles: number): number {
  const road = miles * 1.3;
  const mph = road < 10 ? 30 : road <= 40 ? 45 : 60;
  return Math.max(2, Math.round((road / mph) * 60));
}

export const milesText = (m: number) => `${m < 10 ? m.toFixed(1) : Math.round(m)} mi`;
export function driveText(s: Pick<Spot, 'minutes' | 'route'>): string {
  const m = s.minutes;
  const t = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${s.route ? '' : 'about '}${t} by car`;
}

/** The Friday that starts this weekend (Fri–Sun → that Friday; Mon–Thu → the coming Friday). YYYY-MM-DD in, out. */
export function fridayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = d.getUTCDay();
  const back = dow === 6 ? 1 : dow === 0 ? 2 : -(5 - dow);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
/** Friday → Sunday. */
export const sundayOf = (friday: string) => { const d = new Date(`${friday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); };
/** The weekend list is shown from Friday to Sunday. */
export const isWeekendNow = (w: Pick<Weekend, 'friday'> | null | undefined, day: string) => !!w && day >= w.friday && day <= sundayOf(w.friday);

/** A place as a Contacts card ("Add to Contacts"). */
export function spotToContact(s: Spot) {
  return {
    name: s.name.slice(0, 120), kind: spotKind(s.kind).contact, phones: s.phone ? [s.phone] : [], emails: [] as string[], website: s.website, address: s.address,
    description: `${spotKind(s.kind).label} near you: ${milesText(s.miles)}, ${driveText(s)}`.slice(0, 300),
  };
}
