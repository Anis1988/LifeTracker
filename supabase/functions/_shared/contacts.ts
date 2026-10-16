import { contactKind, type Contact, type ContactSource } from './model.ts';

/**
 * 📇 Contacts: the free parts (no AI), shared by the app and the server functions. Plain TypeScript only.
 * One card per real place: two cards are the same when they share a phone number, a website / email domain
 * (not a shared one like gmail.com, nor a booking platform that writes for many businesses), an exact email
 * address, or a name that means the same once "the, LLC, DDS, office…" are taken out.
 */

// ---------- normalizing ----------

/** Digits only; a US "+1" in front is dropped, so "(555) 010-0100" = "+1 555.010.0100" = "5550100100". '' if not a full number. */
export function normPhone(s: string): string {
  let d = (s ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length >= 10 && d.length <= 15 ? d : '';
}
/** "(555) 010-0100" for US numbers, "+44 20…" style digits otherwise. */
export function fmtPhone(s: string): string {
  const d = normPhone(s);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return d ? `+${d}` : s.trim();
}

/** Free email providers: an address there belongs to one person or shop, the domain says nothing. */
export const SHARED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com',
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'cox.net', 'charter.net', 'earthlink.net', 'bellsouth.net', 'hey.com', 'fastmail.com',
]);
/** Booking, billing and mailing services that write on behalf of many businesses: their domain is never the business. */
export const PLATFORM_DOMAINS = new Set([
  'zocdoc.com', 'opentable.com', 'resy.com', 'yelp.com', 'squareup.com', 'square.site', 'vagaro.com', 'booksy.com', 'mindbodyonline.com', 'mindbody.io',
  'schedulicity.com', 'acuityscheduling.com', 'calendly.com', 'setmore.com', 'fresha.com', 'styleseat.com', 'getweave.com', 'weavehelp.com',
  'solutionreach.com', 'lighthouse360.com', 'demandforce.com', 'nexhealth.com', 'patientpop.com', 'mychart.com', 'phreesia.com', 'healow.com',
  'intuit.com', 'quickbooks.com', 'paypal.com', 'venmo.com', 'stripe.com', 'sendgrid.net', 'mailchimp.com', 'mcsv.net', 'mailgun.org', 'amazonses.com',
  'constantcontact.com', 'hubspot.com', 'hubspotemail.net', 'salesforce.com', 'exacttarget.com', 'klaviyo.com', 'docusign.net', 'docusign.com',
  'housecallpro.com', 'jobber.com', 'getjobber.com', 'servicetitan.com', 'angi.com', 'thumbtack.com', 'nextdoor.com', 'toasttab.com', 'doordash.com',
  'ubereats.com', 'grubhub.com', 'clover.com', 'invoice2go.com', 'freshbooks.com', 'wave.com', 'waveapps.com', 'bill.com', 'google.com', 'microsoft.com',
]);
/** Big online names: not "references" (and they'd fill the list). Their emails never make a card. */
export const SKIP_DOMAINS = new Set([
  'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'etsy.com', 'temu.com', 'shein.com', 'aliexpress.com', 'apple.com', 'google.com', 'youtube.com',
  'facebook.com', 'facebookmail.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'reddit.com', 'pinterest.com', 'github.com',
  'microsoft.com', 'netflix.com', 'spotify.com', 'uber.com', 'lyft.com', 'airbnb.com', 'booking.com', 'expedia.com', 'whatsapp.com', 'discord.com',
  'slack.com', 'zoom.us', 'dropbox.com', 'medium.com', 'substack.com', 'quora.com', 'nytimes.com', 'supabase.com', 'supabase.io', 'resend.dev', 'vercel.com',
  'netlify.com', 'anthropic.com', 'openai.com',
]);
const MAIL_PREFIX = /^(www\d*|mail|email|e|em|mx|smtp|news|newsletter|info|notify|notifications?|reply|bounce[s]?|mailer|comms?|go|click|links?|t|m|mkt|marketing|alerts?|updates?|accounts?|secure|my|portal|app)\./;

/** "https://www.mail.smiledental.com/x" / "office@smiledental.com" / "smiledental.com" → "smiledental.com" (sub-domains like mail. dropped). */
export function domainOf(s: string | null | undefined): string {
  let h = (s ?? '').trim().toLowerCase();
  if (!h) return '';
  if (h.includes('@') && !h.includes('/')) h = h.split('@').pop() ?? '';
  h = h.replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/\.$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return '';
  for (let i = 0; i < 4 && MAIL_PREFIX.test(h) && h.split('.').length > 2; i++) h = h.replace(MAIL_PREFIX, '');
  const p = h.split('.');
  // co.uk / com.au / ca.gov-style endings keep three parts.
  const three = p.length >= 3 && (/^(co|com|org|net|gov|ac|edu|nhs)$/.test(p[p.length - 2]) || (/^(gov|us)$/.test(p[p.length - 1]) && p[p.length - 2].length === 2));
  return p.slice(three ? -3 : -2).join('.');
}
/** The domain only if it can tell one business from another (not gmail.com, not a booking platform). */
export const bizDomain = (s: string | null | undefined) => { const d = domainOf(s); return d && !SHARED_DOMAINS.has(d) && !PLATFORM_DOMAINS.has(d) ? d : ''; };

const STOP = new Set(['the', 'llc', 'inc', 'incorporated', 'co', 'company', 'corp', 'corporation', 'ltd', 'pllc', 'pc', 'pa', 'lp', 'llp', 'dds', 'dmd', 'md', 'od', 'dvm', 'office', 'offices', 'clinic', 'of', 'and', 'at', 'dr', 'a', 'an', 'services', 'service', 'group']);
/** "The Smile Dental Office, LLC" → ["smile", "dental"]. A name that is a web address counts as its first part ("smiledental.com" → ["smiledental"]). */
export function nameTokens(name: string | null | undefined): string[] {
  let n = (name ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
  if (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(n)) n = n.split('.').length > 2 ? domainOf(n).split('.')[0] : n.split('.')[0];
  n = n.replace(/&/g, ' and ').replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ');
  return n.split(' ').filter((w) => w && !STOP.has(w));
}
export const nameKey = (name: string | null | undefined) => nameTokens(name).join(' ');

/** Do two names mean the same place? Same words, or one is the other with extra words (2+ shared words), or nearly all words shared. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = nameTokens(a), y = nameTokens(b);
  if (!x.length || !y.length) return false;
  if (x.join('') === y.join('') && x.join('').length >= 4) return true; // "Smile Dental" = "SmileDental"
  const [small, big] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  const shared = small.filter((w) => big.has(w)).length;
  if (small.length >= 2 && shared === small.length) return true;
  const union = new Set([...x, ...y]).size;
  return union > 0 && shared / union >= 0.75 && shared >= 2;
}

/** "12 Main St, Suite 4" → "12 main": the street number and the first word (two places on the same street still differ). */
export const addrKey = (a: string | null | undefined) => { const m = (a ?? '').toLowerCase().match(/(\d{1,6})\s+(?:[nsew]\.?\s+)?([a-z0-9]+)/); return m ? `${m[1]} ${m[2]}` : ''; };

type Like = Pick<Contact, 'name' | 'phones' | 'emails' | 'website' | 'address'>;
const phonesOf = (c: Like) => new Set((c.phones ?? []).map(normPhone).filter(Boolean));
const domainsOf = (c: Like) => new Set([bizDomain(c.website), ...(c.emails ?? []).map(bizDomain)].filter(Boolean));
const emailsOf = (c: Like) => new Set((c.emails ?? []).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')));

/** The same real place? Phone first, then website / email domain, exact email, then the name. */
export function sameContact(a: Like, b: Like): boolean {
  const pa = phonesOf(a), pb = phonesOf(b);
  for (const p of pa) if (pb.has(p)) return true;
  // Two branches: different phones AND different street addresses → two places, even with the same name or website.
  const ka = addrKey(a.address), kb = addrKey(b.address);
  if (pa.size && pb.size && ka && kb && ka !== kb) return false;
  const da = domainsOf(a), db = domainsOf(b);
  for (const d of da) if (db.has(d)) return true;
  const ea = emailsOf(a);
  for (const e of emailsOf(b)) if (ea.has(e)) return true;
  if (da.size && db.size) return false; // each has its own website, and they differ
  if (sameName(a.name, b.name)) return true;
  // "smiledental.com" (from an email) and "Smile Dental" (from an appointment).
  const label = (d: Set<string>) => [...d].map((x) => x.split('.')[0]).filter((x) => x.length >= 5);
  const ja = nameTokens(a.name).join(''), jb = nameTokens(b.name).join('');
  return (!!jb && label(da).includes(jb)) || (!!ja && label(db).includes(ja));
}

/** The identity used for the database's "one row per place" rule: website domain, else phone, else email, else name (+ phone/street). */
export function contactKey(c: Like): string {
  const d = [...domainsOf(c)][0];
  if (d) return `web:${d}`;
  const p = [...phonesOf(c)][0];
  if (p) return `tel:${p}`;
  const e = [...emailsOf(c)][0];
  if (e) return `mail:${e}`;
  const n = nameKey(c.name) || c.name.trim().toLowerCase();
  const a = addrKey(c.address);
  return `name:${n}${a ? `|${a}` : ''}`.slice(0, 200);
}

/** A name that says little (a web address, an email, "Customer Service"): a better one found later replaces it. */
export const GENERIC_NAME = /^(no-?reply|do-?not-?reply|notifications?|info|support|customer (service|care|support)|billing|appointments?|reminders?|scheduling|front desk|reception|office|the team|team|admin|hello|hi|contact( us)?|service|accounts?|alerts?|mail|news(letter)?|updates?|your (\w+ )?(office|team))$/i;
export const weakName = (n: string | null | undefined) => !n?.trim() || /@/.test(n) || /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/i.test(n.trim()) || GENERIC_NAME.test(n.trim());

const uniq = <T,>(xs: T[], key: (x: T) => string) => { const seen = new Set<string>(); return xs.filter((x) => { const k = key(x); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
export const unionPhones = (a: string[], b: string[]) => uniq([...(a ?? []), ...(b ?? [])].map(fmtPhone), normPhone).slice(0, 5);
export const unionEmails = (a: string[], b: string[]) => uniq([...(a ?? []), ...(b ?? [])].map((e) => e.trim().toLowerCase()), (e) => e).slice(0, 5);
const later = (a: string | null | undefined, b: string | null | undefined) => (!a ? b ?? null : !b ? a : a > b ? a : b);

/** Something found automatically, before it's merged into a card. rank: how good its description is (1+ = a real one, e.g. "next visit Oct 21"). */
export type Draft = Omit<Contact, 'id' | 'key' | 'mine' | 'status' | 'favorite' | 'notes' | 'created_at' | 'updated_at'> & { rank?: number };

/**
 * An automatic find merged into a card: fills what's empty, adds new phone numbers / emails (never the same twice),
 * never touches a field you set yourself (`mine`). Returns the card as it should be now.
 */
export function autoMerge<T extends Contact>(c: T, d: Draft): T {
  const mine = new Set(c.mine ?? []);
  const out = { ...c };
  if (!mine.has('name') && weakName(c.name) && d.name && !weakName(d.name)) out.name = d.name.slice(0, 120);
  // An appointment knows best what a place is (rank 2): "Dentist" beats a bill's "health".
  if (!mine.has('kind') && d.kind && d.kind !== 'other' && (c.kind === 'other' || !c.kind || (d.rank ?? 0) >= 2)) out.kind = d.kind;
  if (!mine.has('person') && !c.person && d.person) out.person = d.person.slice(0, 120);
  if (!mine.has('website') && !c.website && d.website) out.website = d.website;
  if (!mine.has('address') && !c.address && d.address) out.address = d.address.slice(0, 200);
  if (!mine.has('phones')) out.phones = unionPhones(c.phones, d.phones);
  if (!mine.has('emails')) out.emails = unionEmails(c.emails, d.emails);
  if (!mine.has('description') && d.description && (!c.description || (d.rank ?? 0) >= 1)) out.description = d.description.slice(0, 200);
  out.sources = [...new Set([...(c.sources ?? []), ...d.sources])];
  out.last_seen = later(c.last_seen, d.last_seen);
  return out;
}

/** You said two cards are the same: one card with everything from both (your own fields from both stay yours). */
export function ownerMerge<T extends Contact>(keep: T, other: Contact): T {
  const pick = <K extends keyof Contact>(k: K) => (keep[k] || other[k]) as T[K];
  return {
    ...keep,
    name: keep.name || other.name, kind: keep.kind !== 'other' ? keep.kind : other.kind,
    person: pick('person'), website: pick('website'), address: pick('address'), description: pick('description'),
    notes: keep.notes && other.notes && keep.notes !== other.notes ? `${keep.notes}\n${other.notes}`.slice(0, 2000) : pick('notes'),
    phones: unionPhones(keep.phones, other.phones), emails: unionEmails(keep.emails, other.emails),
    favorite: keep.favorite || other.favorite, sources: [...new Set([...keep.sources, ...other.sources])],
    mine: [...new Set([...keep.mine, ...other.mine])], last_seen: later(keep.last_seen, other.last_seen), status: 'active',
  };
}

/** Which fields the owner changed (they become "set by you" and are never overwritten). */
export function changedFields(before: Partial<Contact>, after: Partial<Contact>): string[] {
  const f = ['name', 'kind', 'person', 'phones', 'emails', 'website', 'address', 'description'] as const;
  const norm = (v: unknown) => JSON.stringify(Array.isArray(v) ? v.filter(Boolean) : v || null);
  return f.filter((k) => norm(before[k]) !== norm(after[k]));
}

// ---------- 🔎 search (on the device) ----------
const SRC_WORDS: Record<ContactSource, string> = { email: 'gmail email', hand: 'added by you', appt: 'appointment', bill: 'bill', purchase: 'purchase' };
/** One box finds anything: name, person, kind, phone (digits only, so "555 0100" finds "(555) 010-0100"), website, address, email, description, notes. */
export function matchContact(c: Contact, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const digits = (c.phones ?? []).map((p) => p.replace(/\D/g, '')).join(' ');
  const qd = query.replace(/\D/g, '');
  if (qd.length >= 3 && /^[\d\s().+-]+$/.test(query) && (c.phones ?? []).some((p) => p.replace(/\D/g, '').includes(qd) || normPhone(p).includes(qd))) return true;
  const k = contactKind(c.kind);
  const hay = [c.name, c.person, k.label, k.id, k.you, c.website, c.address, ...(c.emails ?? []), c.description, c.notes, ...(c.phones ?? []), digits, ...(c.sources ?? []).map((s) => SRC_WORDS[s])]
    .filter(Boolean).join(' \u0001 ').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return query.normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/\s+/).every((w) => hay.includes(w) || (/^\d+$/.test(w.replace(/\D/g, '')) && w.replace(/\D/g, '').length >= 3 && digits.includes(w.replace(/\D/g, ''))));
}

// ---------- ✉️ free reading of an email: who it is, phones, website, street address ----------
const KIND_RULES: [string, RegExp][] = [
  ['dentist', /\b(dental|dentist(ry)?|orthodont\w*|endodont\w*|periodont\w*|oral surgery|dds|dmd|teeth|tooth|hygienist)\b/],
  ['pet', /\b(vet|vets|veterinar\w*|animal (hospital|clinic)|pet|pets|grooming|groomer|kennel|dvm)\b/],
  ['doctor', /\b(doctor|clinic|medical|medicine|health ?care|hospital|pediatric\w*|dermatolog\w*|optometr\w*|eye care|chiropract\w*|physical therapy|physiotherap\w*|pharmacy|urgent care|ob-?gyn|therapist|counseling|lab results|labcorp|quest diagnostics|new patient|patient portal|patient (forms?|information|account))\b/],
  ['car', /\b(auto (repair|body|shop|service|care|center|parts|glass)|automotive|tires?|lube|oil change|mechanic|collision|body shop|car wash|dealership|smog|transmission|brakes?|muffler|car service|vehicle|motors)\b/],
  ['home', /\b(plumb\w*|hvac|heating|air conditioning|electrician|roof\w*|handyman|pest|termite|landscap\w*|lawn|pool service|cleaning service|maid|locksmith|garage door|appliance repair|contractor|remodel\w*|carpet|movers|moving company|home repair|home services)\b/],
  ['beauty', /\b(salon|hair|haircut|barber\w*|nails?|spa|massage|lash\w*|brows?|wax\w*|esthetic\w*|aesthetic\w*|beauty|makeup|stylist)\b/],
  ['school', /\b(school|academy|elementary|college|university|daycare|preschool|kindergarten|tutor\w*|school district|pta)\b/],
  ['insurance', /\b(insurance|insurer|geico|state farm|allstate|progressive|liberty mutual|usaa|nationwide|policyholder)\b/],
  ['bank', /\b(bank|banking|credit union|mortgage|lending|lender|loan servic\w*|wells fargo|capital one|chase|brokerage|fidelity|schwab|vanguard)\b/],
  ['government', /(\.gov\b|\b(dmv|irs|social security|city of|county of|state of|department of|passport agency|court|clerk of)\b)/],
  ['restaurant', /\b(restaurant|grill|bistro|cafe|café|pizza|pizzeria|sushi|kitchen|tavern|steakhouse|diner|bakery|eatery|brunch|opentable|resy)\b/],
  ['utility', /\b(electric company|power company|energy|water (utility|department)|gas company|internet service|wireless|broadband|comcast|xfinity|spectrum|verizon|at&t|t-mobile)\b/],
];
/** The kind of place, from its name and what it writes (free rules). 'other' when unsure. */
export function guessKind(...texts: (string | null | undefined)[]): string {
  for (const t of texts) {
    const x = (t ?? '').toLowerCase();
    if (!x) continue;
    for (const [k, re] of KIND_RULES) if (re.test(x)) return k;
  }
  return 'other';
}

/** Appointment / bill / service words: the email is about a service you use (not an ad, not a chat with a friend). */
export const SERVICE_WORDS = /\b(appointment|appt|your visit|patient|estimate|invoice|statement|insurance policy|your policy|reservation|booking|booked|repair|service (call|visit|appointment)|work order|thank you for choosing|see you (on|at)|your (dentist|doctor|vet|stylist|technician)|office hours|call (us|our office)|reschedule)\b/i;
const BIZ_WORD = /\b(llc|inc|co|corp|ltd|pllc|dds|dmd|md|dental|clinic|office|center|centre|group|services?|studio|salon|shop|store|repair|auto|motors|insurance|bank|school|hospital|pharmacy|restaurant|grill|cafe|spa|plumbing|electric|realty|law|associates|partners)\b/i;
/** "Maria Lopez": two or three capitalized words, no business word. */
export const looksLikePerson = (n: string) => /^[A-Z][a-z'’-]+( [A-Z]\.?)?( [A-Z][a-z'’-]+){1,2}$/.test(n.trim()) && !BIZ_WORD.test(n);

/** "Smile Dental via Zocdoc <noreply@zocdoc.com>" → { name: "Smile Dental", address: "noreply@zocdoc.com" }. */
export function parseSender(from: string): { name: string; address: string } {
  const address = (from.match(/<([^>]+)>/)?.[1] ?? from.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? '').trim().toLowerCase();
  let name = from.replace(/<[^>]*>/, '').replace(/["']/g, '').trim();
  name = name.replace(/\s+(via|from|through)\s+.+$/i, '').replace(/\s*[|–—-]\s*(appointments?|reminders?|notifications?|billing|no-?reply)$/i, '').trim();
  if (name.toLowerCase() === address || name.includes('@')) name = '';
  return { name: name.slice(0, 120), address };
}
export const isNoReply = (addr: string) => /^(no-?reply|do-?not-?reply|noreply|donotreply|notifications?|mailer-daemon|bounce)/i.test(addr.split('@')[0] ?? '');

const PHONE_RE = /(?<![\d\w])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g;
const STREET = '(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|trl|trail|sq|square|pike|plaza|loop)';
const WORD = "(?:\\d+(?:st|nd|rd|th)|[A-Za-z][A-Za-z'-]*)"; // "Main", "5th" (not "PM." or another number)
const ADDR_RE = new RegExp(`\\b\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?${WORD}(?:\\s+${WORD}){0,3}\\s+${STREET}\\b\\.?(?:\\s+[NSEW]{1,2}\\b)?(?:,?\\s*(?:suite|ste\\.?|unit|#)\\s*[\\w-]+)?(?:,?\\s*[A-Za-z][A-Za-z .'-]{1,30},?\\s+[A-Z]{2}\\.?\\s+\\d{5}(?:-\\d{4})?)?`, 'gi');
const FOOTER = /(©|\(c\) ?\d{4}|all rights reserved|unsubscribe|privacy policy|you are receiving this|this email was sent|manage (your )?preferences|view (this email )?in (your )?browser)/i;
const URL_RE = /\bhttps?:\/\/[^\s<>()"'\]]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
const TRACKING = /(list-manage|click\.|links?\.|track|mandrillapp|sendgrid|ct\.|email\.|e\.|mailchi|safelinks|urldefense|google\.com\/maps|goo\.gl|bit\.ly|facebook|instagram|twitter|linkedin|youtube|tiktok|apple\.com|play\.google)/i;

export interface MailFacts { phones: string[]; address: string | null; website: string | null }
/**
 * Phone numbers, a street address and the website in an email (signature, appointment details). Platform footers
 * ("© Zocdoc, 568 Broadway…") are cut off first. `own` = your own numbers (never someone else's contact info).
 */
export function readFacts(text: string, sender: string, own: { phones?: string[] } = {}): MailFacts {
  let t = (text ?? '').slice(0, 20_000);
  // Cut the footer: the first footer word in the second half of the email.
  const half = Math.floor(t.length / 3);
  const f = t.slice(half).search(FOOTER);
  if (f >= 0) t = t.slice(0, half + f);
  t = t.replace(/^>.*$/gm, ''); // quoted replies are someone else's
  const mine = new Set((own.phones ?? []).map(normPhone).filter(Boolean));
  const phones: string[] = [];
  for (const line of t.split(/\n/)) {
    if (/\bfax\b/i.test(line)) continue;
    for (const m of line.matchAll(PHONE_RE)) {
      if (!/[\s.()-]/.test(m[0].trim())) continue; // 10 digits in a row: an order or account number
      const p = normPhone(m[0]);
      if (p && !mine.has(p) && !phones.includes(p)) phones.push(p);
    }
  }
  const addrs = [...t.matchAll(ADDR_RE)].map((m) => m[0].replace(/\s+/g, ' ').trim()).filter((a) => !/^\d{5}/.test(a));
  const withZip = addrs.filter((a) => /\b\d{5}(-\d{4})?$/.test(a));
  const viaPlatform = PLATFORM_DOMAINS.has(domainOf(sender));
  // From a booking platform: the first address (the appointment's place); from the business itself: its signature (the last).
  const address = (viaPlatform ? withZip[0] ?? addrs[0] : withZip[withZip.length - 1] ?? addrs[addrs.length - 1]) ?? null;
  const own2 = bizDomain(sender);
  const hosts = [...t.matchAll(URL_RE)].map((m) => m[0].replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase()).filter((h) => !TRACKING.test(h));
  const host = (own2 && hosts.find((h) => domainOf(h) === own2)) || (!own2 ? hosts.find((h) => { const d = bizDomain(h); return d && !SKIP_DOMAINS.has(d); }) : undefined);
  const website = host ? `https://${host}` : own2 ? `https://${own2}` : null;
  return { phones: phones.slice(0, 3).map(fmtPhone), address: address ? address.slice(0, 200) : null, website };
}

/** "Your dentist" + "next visit Oct 21" style description. */
export function describe(kind: string, extra?: string): string {
  const you = contactKind(kind).you;
  return [you, extra].filter(Boolean).join('; ');
}
export const monthYear = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** 📅 → 📇 The card of the place an appointment is with (same name or person, or the same street address). */
export function contactForAppt(list: Contact[], a: { with_who?: string | null; place?: string | null }): Contact | undefined {
  const k = addrKey(a.place);
  return list.find((c) => c.status === 'active' && ((!!a.with_who && (sameName(c.name, a.with_who) || sameName(c.person, a.with_who))) || (!!k && addrKey(c.address) === k)));
}
