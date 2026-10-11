/**
 * 👤 Shared lists for the "Me" part (plain TypeScript: the app and the server both import it).
 * Removal pages move from time to time; the site's own name + "opt out" always finds the current one.
 */

/** People-search sites (they sell your address, phone, relatives). `remove` = their official removal page. */
export const BROKERS: { id: string; name: string; domain: string; remove: string; note?: string }[] = [
  { id: 'whitepages', name: 'Whitepages', domain: 'whitepages.com', remove: 'https://www.whitepages.com/suppression-requests', note: 'Paste your listing’s address, then confirm by phone call.' },
  { id: 'spokeo', name: 'Spokeo', domain: 'spokeo.com', remove: 'https://www.spokeo.com/optout', note: 'Paste your listing’s address and an email; click the link they email you.' },
  { id: 'beenverified', name: 'BeenVerified', domain: 'beenverified.com', remove: 'https://www.beenverified.com/app/optout/search', note: 'Also removes PeopleLooker and NeighborWho.' },
  { id: 'peopleconnect', name: 'Intelius · Instant Checkmate · TruthFinder · US Search', domain: 'intelius.com', remove: 'https://suppression.peopleconnect.us/login', note: 'One removal for all PeopleConnect sites.' },
  { id: 'radaris', name: 'Radaris', domain: 'radaris.com', remove: 'https://radaris.com/control/privacy' },
  { id: 'mylife', name: 'MyLife', domain: 'mylife.com', remove: 'https://www.mylife.com/privacy-policy', note: 'Follow “Your privacy choices” on that page.' },
  { id: 'peoplefinders', name: 'PeopleFinders', domain: 'peoplefinders.com', remove: 'https://www.peoplefinders.com/opt-out' },
  { id: 'fastpeoplesearch', name: 'FastPeopleSearch', domain: 'fastpeoplesearch.com', remove: 'https://www.fastpeoplesearch.com/removal' },
  { id: 'truepeoplesearch', name: 'TruePeopleSearch', domain: 'truepeoplesearch.com', remove: 'https://www.truepeoplesearch.com/removal' },
  { id: 'peoplesearchnow', name: 'PeopleSearchNow', domain: 'peoplesearchnow.com', remove: 'https://www.peoplesearchnow.com/opt-out' },
  { id: 'searchpeoplefree', name: 'SearchPeopleFree', domain: 'searchpeoplefree.com', remove: 'https://www.searchpeoplefree.com/opt-out' },
  { id: 'usphonebook', name: 'USPhoneBook', domain: 'usphonebook.com', remove: 'https://www.usphonebook.com/opt-out' },
  { id: 'thatsthem', name: 'That’s Them', domain: 'thatsthem.com', remove: 'https://thatsthem.com/optout' },
  { id: 'nuwber', name: 'Nuwber', domain: 'nuwber.com', remove: 'https://nuwber.com/removal/link' },
  { id: 'clustrmaps', name: 'ClustrMaps', domain: 'clustrmaps.com', remove: 'https://clustrmaps.com/bl/opt-out' },
  { id: 'cyberbackgroundchecks', name: 'CyberBackgroundChecks', domain: 'cyberbackgroundchecks.com', remove: 'https://www.cyberbackgroundchecks.com/removal' },
  { id: 'advancedbackgroundchecks', name: 'Advanced Background Checks', domain: 'advancedbackgroundchecks.com', remove: 'https://www.advancedbackgroundchecks.com/removal' },
  { id: 'smartbackgroundchecks', name: 'Smart Background Checks', domain: 'smartbackgroundchecks.com', remove: 'https://www.smartbackgroundchecks.com/optout' },
  { id: 'familytreenow', name: 'FamilyTreeNow', domain: 'familytreenow.com', remove: 'https://www.familytreenow.com/optout' },
  { id: 'peekyou', name: 'PeekYou', domain: 'peekyou.com', remove: 'https://www.peekyou.com/about/contact/optout' },
  { id: 'acxiom', name: 'Acxiom (marketing data)', domain: 'acxiom.com', remove: 'https://isapps.acxiom.com/optout/optout.aspx' },
  { id: 'lexisnexis', name: 'LexisNexis', domain: 'lexisnexis.com', remove: 'https://optout.lexisnexis.com/' },
];
const BROKER_DOMAINS: Record<string, string> = { 'instantcheckmate.com': 'peopleconnect', 'truthfinder.com': 'peopleconnect', 'ussearch.com': 'peopleconnect', 'zabasearch.com': 'peopleconnect', 'peoplelooker.com': 'beenverified', 'neighborwho.com': 'beenverified' };
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
/** The people-search site a page belongs to, if any. */
export function brokerOf(url: string): (typeof BROKERS)[number] | undefined {
  const h = hostOf(url);
  if (!h) return undefined;
  const alias = Object.entries(BROKER_DOMAINS).find(([d]) => h === d || h.endsWith(`.${d}`))?.[1];
  return BROKERS.find((b) => b.id === alias || h === b.domain || h.endsWith(`.${b.domain}`));
}

/** 🪪 Kinds of documents that expire. */
export const PAPER_KINDS: { id: string; icon: string; label: string; renew?: string }[] = [
  { id: 'passport', icon: '🛂', label: 'Passport', renew: 'https://travel.state.gov/content/travel/en/passports/have-passport/renew.html' },
  { id: 'license', icon: '🪪', label: 'Driver’s licence' },
  { id: 'id', icon: '🆔', label: 'ID card' },
  { id: 'registration', icon: '🚗', label: 'Car registration' },
  { id: 'inspection', icon: '🔧', label: 'Car inspection / emissions' },
  { id: 'insurance', icon: '🛡️', label: 'Insurance card' },
  { id: 'trusted', icon: '✈️', label: 'Global Entry / TSA PreCheck', renew: 'https://ttp.cbp.dhs.gov/' },
  { id: 'visa', icon: '📗', label: 'Visa / green card / work permit' },
  { id: 'membership', icon: '🎟️', label: 'Membership card' },
  { id: 'other', icon: '📄', label: 'Other' },
];
export const paperKind = (id: string) => PAPER_KINDS.find((k) => k.id === id) ?? PAPER_KINDS[PAPER_KINDS.length - 1];

/** 🔒 The three credit bureaus: a freeze is free, stops new credit in your name, and you can lift it any time. */
export const BUREAUS: { id: 'equifax' | 'experian' | 'transunion'; name: string; freeze: string }[] = [
  { id: 'equifax', name: 'Equifax', freeze: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/' },
  { id: 'experian', name: 'Experian', freeze: 'https://www.experian.com/freeze/center.html' },
  { id: 'transunion', name: 'TransUnion', freeze: 'https://www.transunion.com/credit-freeze' },
];
export const FREE_REPORTS = 'https://www.annualcreditreport.com';

/** Breach-alert emails (Have I Been Pwned, Mozilla Monitor, Google): read like the bank alerts, free, no AI. */
export const BREACH_QUERY = 'from:(haveibeenpwned.com OR monitor.mozilla.org OR mozilla.com OR google.com) (breach OR pwned OR "dark web" OR exposed OR leaked)';
export function parseBreach(m: { from: string; subject: string; text: string; date: string }): { name: string; title: string } | null {
  const from = m.from.toLowerCase();
  if (!/haveibeenpwned|mozilla|google/.test(from)) return null;
  const all = `${m.subject}\n${m.text}`;
  if (!/breach|pwned|dark web|exposed|leak/i.test(all)) return null;
  // "You've been pwned in the Example data breach" / "found in the Example breach" / "Breach: Example"
  const name = all.match(/(?:pwned in|found in|appeared in|part of) (?:the |a )?([A-Z0-9][\w .&'-]{1,40}?) (?:data )?breach/i)?.[1]
    ?? all.match(/breach(?:ed site)?\s*:\s*([^\n]{2,40})/i)?.[1]
    ?? m.subject.replace(/^(re|fwd?):\s*/i, '').slice(0, 60);
  return { name: name.trim(), title: m.subject.slice(0, 160) || `Data breach: ${name}` };
}
