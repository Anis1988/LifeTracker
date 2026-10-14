import type { Appointment } from './model.ts';

/**
 * 📅 Appointments: the free parts (no AI), shared by the app and the server functions. Plain TypeScript only.
 * The Android app runs the same first look on the phone (TextWatch.java), so other texts never leave it.
 */

const WORD = /\b(appointment|appt|booked|booking|reservation|reserved|scheduled|rescheduled|reschedule|confirm(ed|ation)?|cancel(l)?ed|cancellation|reminder|check-?up|consultation|see you (on|at|tomorrow)|your visit|visit on|arrive|exam|cleaning|session|meeting)\b/;
const WHEN = /\b(\d{1,2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)|\d{1,2}:\d{2}|\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}|\d{1,2}(st|nd|rd|th)?( of)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?|tomorrow|today|tonight)\b/;
const NOISE = /\b(verification code|security code|one[- ]time (pass)?code|passcode|\botp\b|has shipped|out for delivery|was delivered|tracking number|unsubscribe from this|% off|sale ends|limited time|webinar)\b/;

/** Free first look: an appointment word and a day or time, and not a code, a delivery or an ad. */
export function looksLikeAppointment(text: string): boolean {
  const t = text.toLowerCase();
  return WORD.test(t) && WHEN.test(t) && !NOISE.test(t);
}

/** Gmail search for possible appointment emails (the free check and the AI decide). */
export const APPT_QUERY = '(appointment OR appt OR booked OR booking OR reservation OR rescheduled OR "is scheduled" OR "is confirmed" OR "has been cancelled" OR "has been canceled" OR "see you on" OR "your visit") -category:promotions -category:social -in:sent -in:chats';

const GENERIC = new Set(['appointment', 'appt', 'your', 'the', 'with', 'for', 'and', 'visit', 'reminder', 'scheduled', 'confirmed', 'booking', 'service', 'office', 'clinic', 'center', 'centre', 'at', 'of', 'dr', 'llc', 'inc', 'new', 'patient']);
const words = (s: string) => new Set(s.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !GENERIC.has(w)));

/** The same appointment? (shares a meaningful word in what / with whom / where). Used to merge an email and a text, and to find the one a "moved" or "cancelled" message talks about. */
export function sameAppt(a: { title: string; with_who?: string | null; place?: string | null }, b: { title: string; with_who?: string | null; place?: string | null }): boolean {
  const x = words(`${a.title} ${a.with_who ?? ''} ${a.place ?? ''}`);
  for (const w of words(`${b.title} ${b.with_who ?? ''} ${b.place ?? ''}`)) if (x.has(w)) return true;
  return false;
}

/** "Tue, Oct 21 · 3:00 PM" (or "Tue, Oct 21 · all day"). */
export function whenText(a: Pick<Appointment, 'day' | 'time'>): string {
  const d = new Date(`${a.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (!a.time) return `${d} · all day`;
  const [h, m] = a.time.split(':').map(Number);
  return `${d} · ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The end as a local "YYYY-MM-DDTHH:MM:00" (arithmetic done as UTC on the plain clock time). */
export function endOf(day: string, time: string, minutes: number): string {
  const x = new Date(Date.parse(`${day}T${time}:00Z`) + minutes * 60_000);
  return x.toISOString().slice(0, 19);
}
