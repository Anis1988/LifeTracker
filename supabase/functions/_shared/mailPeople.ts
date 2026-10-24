/**
 * 👥 Whose mailbox an entry came from (owner's request: "highlight what was added from Roza's email"). Each Google
 * mailbox (main + extras) has a short name and a colour, kept with that mailbox on the server (`connections` meta
 * `person`); defaults below. Plain TS shared by the app and the server: no Deno/browser APIs.
 * Rows never show the address, only the name.
 */
export const PERSON_COLORS = ['teal', 'pink', 'violet', 'amber', 'sky', 'lime'] as const;
export type PersonColor = (typeof PERSON_COLORS)[number];
export interface MailPerson { email: string; name: string; color: PersonColor; main: boolean }

const KNOWN: Record<string, { name: string; color: PersonColor }> = {
  'anis1011@gmail.com': { name: 'Anis', color: 'sky' },
  'mediniroza@gmail.com': { name: 'Roza', color: 'pink' },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The saved name/colour, else the default: a known address, else the address's first part in amber. */
export function personOf(email: string, main: boolean, saved?: unknown): MailPerson {
  const e = email.trim().toLowerCase();
  const p = (saved && typeof saved === 'object' ? saved : {}) as { name?: unknown; color?: unknown };
  const d = KNOWN[e] ?? { name: cap((e.split('@')[0] || 'Email').split(/[.+_-]/)[0]).slice(0, 16), color: 'amber' as PersonColor };
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 16) : d.name;
  const color = PERSON_COLORS.includes(p.color as PersonColor) ? (p.color as PersonColor) : d.color;
  return { email: e, name, color, main };
}

const ADDR = /[^\s()<>|"']+@[^\s()<>|"']+/;
/**
 * The mailbox an entry came from, from what is stored on it: an address (the `mailbox` column / details.mailbox / evidence.box /
 * evidence.mailbox / receipt_path "gmail:<id>|<address>" / a note "From email (address)" / an appointment's "(to
 * address)"), 'main' when it came from email but names no mailbox (the main one never did), or null (bank, by hand…).
 */
export type MailSrc = {
  mailbox?: string | null; source?: string | null; note?: string | null; notes?: string | null; receipt_path?: string | null; source_from?: string | null; key?: string | null;
  details?: object | null; evidence?: object | null;
};
export function mailboxOf(r: MailSrc): string | 'main' | null {
  const str = (v: unknown) => (typeof v === 'string' && ADDR.test(v) ? v.match(ADDR)![0].toLowerCase() : null);
  const d = r.details as Record<string, unknown> | null | undefined, e = r.evidence as Record<string, unknown> | null | undefined;
  const direct = str(r.mailbox) ?? str(d?.mailbox) ?? str(e?.box) ?? str(e?.mailbox);
  if (direct) return direct;
  const path = r.receipt_path?.startsWith('gmail:') ? r.receipt_path : null;
  if (path?.includes('|')) return str(path.split('|')[1]);
  const note = [r.note, r.notes].find((n) => n?.startsWith('From email'));
  if (note) return str(note.match(/^From email \(([^)]+)\)/)?.[1]) ?? 'main';
  const buy = [r.note, r.notes].find((n) => n?.startsWith('Receipt: from ')); // a Returns line from an emailed receipt
  if (buy) return str(buy.match(/^Receipt: from \(([^)]+)\)/)?.[1]) ?? 'main';
  if (r.source_from && /\(to [^)]+\)$/.test(r.source_from)) return str(r.source_from.match(/\(to ([^)]+)\)$/)?.[1]) ?? 'main';
  if (path || r.source === 'alert' || r.source === 'email' || r.key?.startsWith('mail:')) return 'main';
  return null;
}

/**
 * The person for an entry (null when it didn't come from a mailbox). A mailbox no longer connected still gets its
 * default name (Roza / Anis / the address's first part), so an email-found row never loses its chip.
 */
export function personFor(r: MailSrc, people: MailPerson[]): MailPerson | null {
  return personOfBox(mailboxOf(r), people);
}
export function personOfBox(box: string | 'main' | null | undefined, people: MailPerson[]): MailPerson | null {
  if (!box) return null;
  if (box === 'main') return people.find((p) => p.main) ?? null;
  return people.find((p) => p.email === box) ?? personOf(box, false);
}

/** "Roza’s email" (the words for a heads-up / log line), or "your email" when the person isn't known. */
export const emailOf = (p: MailPerson | null | undefined) => (p ? `${p.name}’s email` : 'your email');

/**
 * Raw addresses out of a text, names in: "from your email (roza@…)" → "from Roza’s email", "Dr. Lee (to roza@…)" →
 * "Dr. Lee (to Roza)", any other of your mailboxes' addresses → its person's name (other people's addresses stay).
 * Used for heads-ups, the Log, the Inbox and emails to you.
 */
export function nameAddresses(text: string, people: MailPerson[]): string {
  const nameOf = (a: string) => personOfBox(a.toLowerCase(), people)?.name ?? a.split('@')[0];
  return text
    .replace(/your email \(([^\s()]+@[^\s()]+)\)/g, (_m, a: string) => `${nameOf(a)}’s email`)
    .replace(/\(to ([^\s()]+@[^\s()]+)\)/g, (_m, a: string) => `(to ${nameOf(a)})`)
    .replace(/[^\s()<>|"']+@[^\s()<>|"',:;]+/g, (a) => (KNOWN[a.toLowerCase()] || people.some((p) => p.email === a.toLowerCase()) ? nameOf(a) : a));
}

/** "from your email (roza@…)" → "from your email": the name chip says whose it is. */
export const hideAddresses = (text: string) => text.replace(/\s*\((?:to )?[^\s()]+@[^\s()]+\)/g, '');
