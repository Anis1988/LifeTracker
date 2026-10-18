import { folderOf, personIcon, type Paper, type Settings, type VaultPerson } from './model.ts';
import { paperKind } from './people.ts';
import { daysBetween } from './money.ts';

/**
 * 📁 Vault helpers shared by the app and the server (plain TypeScript): icons, "expires / due" words, the search,
 * and the FREE first look at email attachments (no AI): is it an important document (Vault), a receipt or bill
 * (Money), or marketing (skip)?
 */

/** The icon of a document: its ID kind (🛂 passport…) when it has one, else its folder's. */
export const docIcon = (p: Pick<Paper, 'kind' | 'folder'>) => (p.kind && p.kind !== 'other' ? paperKind(p.kind).icon : folderOf(p.folder).icon);

/** "expires" or "is due" (a next vaccine, a check-up…). */
export const dueWord = (p: Pick<Paper, 'due_kind'>) => (p.due_kind === 'due' ? 'due' : 'expires');

/** The person or pet a document is for (from Settings → Vault), else a plain entry for the name typed. */
export function personOf(s: Settings, name: string | null | undefined): VaultPerson | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return s.vault.people.find((p) => p.name.trim().toLowerCase() === n);
}
/** "Daizy 🐶", "Me": how a holder is shown. */
export function holderText(s: Settings, name: string | null | undefined): string {
  if (!name) return '';
  const p = personOf(s, name);
  return p ? `${p.name} ${personIcon(p)}` : name;
}

/** Days until the expiry / next-due date (negative = passed), or null. */
export const daysTo = (p: Pick<Paper, 'expires'>, now: string) => (p.expires ? daysBetween(now, p.expires) : null);

const fold = (x: string) => x.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Search: every word typed must be in the title, for whom, folder, tags, notes, summary or the words read from the file. */
export function matchDoc(p: Paper, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([p.name, p.holder, folderOf(p.folder).label, p.folder, paperKind(p.kind).label, ...(p.tags ?? []), p.notes, p.summary, p.body, p.number_end, p.doc_date, p.expires].filter(Boolean).join(' \n '));
  return words.every((w) => hay.includes(w));
}

// ---------- ✉️ email attachments: the free first look ----------
export interface AttachmentInfo { subject: string; from: string; filename: string; mime: string; size: number; text: string; listUnsub?: string; inline?: boolean }
export type Route = 'vault' | 'money' | 'skip' | 'maybe';

const DOC_MIME = /^(application\/pdf|image\/(jpeg|jpg|png|webp|heic|heif))$/i;
const DOC_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
/** Only PDFs and photos; no logos, signatures or huge files. */
export function isDocFile(a: Pick<AttachmentInfo, 'filename' | 'mime' | 'size' | 'inline'>): boolean {
  if (!(DOC_MIME.test(a.mime) || DOC_EXT.test(a.filename))) return false;
  const pdf = /pdf/i.test(a.mime) || /\.pdf$/i.test(a.filename);
  if (a.size > 12 * 1024 * 1024) return false;
  if (!pdf && (a.inline || a.size < 40 * 1024)) return false; // logos, signatures, tracking pictures
  if (/^(image\d*|logo|banner|icon|spacer|signature|facebook|twitter|instagram|linkedin)\b/i.test(a.filename)) return false;
  return true;
}

// Strong words in a file name or subject.
const MONEY = /\b(receipts?|invoices?|bill(ing)?|statements?|payment (confirmation|received|due)|amount due|order (confirmation|#|no\.?|number)|your order|purchase(?! agreement)|paid)\b/i;
const VAULT = /(vaccin|immuni[sz]|rabies|distemper|parvo|bordetella|heartworm|\bvet(erinary)?\b|pet (health|record)|medical (record|report)|lab (result|report)|test results?|blood (test|work)|prescription|discharge|referral|x-?ray|\bmri\b|certificat|diploma|transcript|report card|enrol?ment|declarations? page|policy (document|booklet|declaration)|insurance (card|id)|\bid card|contract|agreement|lease|\bdeed\b|\btitle\b|registration|permit|licen[cs]e|passport|\bvisa\b|\bw-?2\b|\b1099|\b1098|tax (form|return|document)|warranty|owner'?s manual|boarding pass|e-?ticket|itinerary|adoption|microchip)/i;
const MARKETING = /(newsletter|% off|\bsale\b|\bdeals?\b|promo|webinar|digest|weekly update|new arrivals|last chance|don'?t miss|special offer|black friday|cyber monday)/i;

/**
 * Where an attachment goes, free (no AI): its file name first, then the subject, then the email text.
 * 'maybe' = a PDF with no clear words: the AI decides (within the daily limits).
 */
export function classifyAttachment(a: AttachmentInfo): Route {
  if (!isDocFile(a)) return 'skip';
  const name = a.filename.replace(/[_\-.]+/g, ' ');
  const subj = a.subject;
  const body = a.text.slice(0, 3000);
  // Newsletters and ads: skipped, unless the file itself is clearly a document.
  if (MARKETING.test(subj) && !VAULT.test(name)) return 'skip';
  if (a.listUnsub && !VAULT.test(name) && !VAULT.test(subj)) return 'skip';
  if (MONEY.test(name)) return 'money';
  if (VAULT.test(name)) return 'vault';
  if (MONEY.test(subj)) return 'money';
  if (VAULT.test(subj)) return 'vault';
  if (/(\$|usd|€|£)\s?\d|\d+\.\d{2}\s?(usd|\$)/i.test(body) && MONEY.test(body)) return 'money';
  if (VAULT.test(body)) return 'vault';
  return /pdf/i.test(a.mime) || /\.pdf$/i.test(a.filename) ? 'maybe' : 'skip';
}

/** The note on a document found in an email (owner's request: "put it in the note"). */
export function fromEmailNote(m: { subject: string; from: string; date: string; box?: string }): string {
  const who = m.from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim() || m.from;
  // An extra Google account says which mailbox: "From email (work@…): …".
  return `From email${m.box ? ` (${m.box})` : ''}: ${m.subject.trim() || '(no subject)'} — ${who}, ${m.date}`.slice(0, 300);
}

/** The key of an attachment saved from an email: the same email + file is never saved twice (unique per user). */
export const vaultKey = (messageId: string, hash: string) => `mail:${messageId}:${hash.slice(0, 16)}`;
/** Already kept? The same file (by its SHA-256) from anywhere, or this email's file. */
export const alreadyKept = (known: { hashes: Set<string>; keys: Set<string> }, messageId: string, hash: string) => known.hashes.has(hash) || known.keys.has(vaultKey(messageId, hash));
