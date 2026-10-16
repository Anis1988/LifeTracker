/**
 * Shared by the app (src/) and the server functions: the shape of the data, the categories, the settings and
 * their defaults. Plain TypeScript only (no Deno or browser APIs), so both sides import the same file.
 */

export type Cycle = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'once';
export const CYCLES: { id: Cycle; label: string; perYear: number }[] = [
  { id: 'weekly', label: 'Every week', perYear: 52 },
  { id: 'biweekly', label: 'Every 2 weeks', perYear: 26 },
  { id: 'monthly', label: 'Every month', perYear: 12 },
  { id: 'quarterly', label: 'Every 3 months', perYear: 4 },
  { id: 'semiannual', label: 'Every 6 months', perYear: 2 },
  { id: 'yearly', label: 'Every year', perYear: 1 },
  { id: 'once', label: 'One time', perYear: 0 },
];

export type Category =
  | 'subscription' | 'mortgage' | 'rent' | 'insurance' | 'utility' | 'phone' | 'internet' | 'loan'
  | 'credit-card' | 'car' | 'health' | 'membership' | 'tax' | 'savings' | 'other';
export const CATEGORIES: { id: Category; icon: string; label: string }[] = [
  { id: 'subscription', icon: '📺', label: 'Subscriptions' },
  { id: 'mortgage', icon: '🏠', label: 'Mortgage' },
  { id: 'rent', icon: '🔑', label: 'Rent' },
  { id: 'insurance', icon: '🛡️', label: 'Insurance' },
  { id: 'utility', icon: '💡', label: 'Utilities' },
  { id: 'phone', icon: '📱', label: 'Phone' },
  { id: 'internet', icon: '🌐', label: 'Internet & TV' },
  { id: 'loan', icon: '🏦', label: 'Loans' },
  { id: 'credit-card', icon: '💳', label: 'Credit cards' },
  { id: 'car', icon: '🚗', label: 'Car' },
  { id: 'health', icon: '🩺', label: 'Health' },
  { id: 'membership', icon: '🏋️', label: 'Memberships' },
  { id: 'tax', icon: '🧾', label: 'Taxes' },
  { id: 'savings', icon: '🐖', label: 'Savings & investing' },
  { id: 'other', icon: '📦', label: 'Other' },
];
export const catOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export interface Item {
  id: string;
  user_id?: string;
  name: string;
  category: Category;
  amount: number;
  currency: string;
  cycle: Cycle;
  next_due: string | null; // YYYY-MM-DD
  ends_on: string | null; // contract end / renewal / payoff
  trial_ends: string | null;
  autopay: boolean;
  status: 'active' | 'paused' | 'cancelled';
  merchant: string | null;
  account: string | null;
  website: string | null;
  notes: string | null;
  details: ItemDetails;
  source: 'manual' | 'bank' | 'document' | 'email';
  price_history: { date: string; amount: number }[];
  last_charged: string | null;
  last_amount: number | null;
  calendar: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

/** Extra facts depending on the kind of bill. */
export interface ItemDetails {
  // 🏠 mortgage / loans
  balance?: number;
  rate?: number; // yearly interest %
  termMonths?: number;
  startDate?: string;
  extra?: number; // extra paid each month
  escrow?: number; // part of the payment that is taxes + insurance
  // 🛡️ insurance
  policyNumber?: string;
  coverage?: string; // short summary
  deductible?: number;
  insurer?: string;
  // anything else the AI found
  last4?: string;
  documentId?: string;
  dueDay?: number; // a bill due on the 29th–31st: its real day, kept when a short month moves it earlier
  negotiate?: Negotiation; // 💬 "Get a lower price": the script (kept per price, so it's never paid twice) and how it went
}

/** 💬 A short phone/chat script to ask the company for a better price (written by the AI, free ones first). */
export interface NegotiateScript {
  opener: string; // what to say first
  ask: string; // the ask itself
  ifNo: string[]; // what to say if they say no
  switchLine: string; // only when you're OK to switch: "I'm thinking of cancelling…" ('' otherwise)
  tips: string[]; // before / during the call (e.g. look at competitors' current offers first)
  target: string; // a fair thing to aim for, in words
}
export interface Negotiation {
  key: string; // price|cycle|ok to switch: the cached script is reused while these stay the same
  script: NegotiateScript;
  by: string;
  at: string;
  okSwitch: boolean;
  result?: { note: string; newPrice: number | null; at: string };
}
/** Kinds of bills where asking for a lower price usually works. */
export const NEGOTIABLE: Category[] = ['internet', 'phone', 'insurance', 'utility', 'subscription', 'membership'];

export interface Suggestion {
  id: string;
  key: string;
  source: 'bank' | 'document' | 'email';
  name: string;
  category: Category | null;
  amount: number | null;
  currency: string | null;
  cycle: Cycle | null;
  next_due: string | null;
  ends_on: string | null;
  trial_ends: string | null;
  merchant: string | null;
  details: ItemDetails;
  evidence: { charges?: { date: string; amount: number }[]; subject?: string; from?: string; documentId?: string; note?: string };
  status: 'new' | 'accepted' | 'ignored';
  item_id: string | null;
  created_at: string;
}

export interface Alert { id: string; kind: 'price' | 'trial' | 'renewal' | 'due' | 'found' | 'sync' | 'me' | 'breach' | 'paper' | 'credit' | 'unsub' | 'budget' | 'return' | 'warranty' | 'date' | 'appt'; key: string; title: string; body: string | null; item_id: string | null; seen: boolean; created_at: string }

// ---------- 👤 Me: name online, people-search sites, breaches, mailing lists, documents that expire ----------
export interface Finding {
  id: string; kind: 'web' | 'broker' | 'breach'; key: string; title: string; url: string | null; site: string | null; snippet: string | null;
  verdict: 'profile' | 'people-search' | 'news' | 'worrying' | 'other' | null; why: string | null;
  status: string; found_at: string; check_after: string | null; created_at: string; updated_at: string;
}
export interface Sender {
  id: string; address: string; name: string | null; sample: string | null; emails: number; unread: number;
  first_seen: string | null; last_seen: string | null; last_opened: string | null;
  unsub: { oneClick?: string; web?: string; mailto?: string }; spam: boolean;
  status: 'subscribed' | 'unsubscribed' | 'web' | 'kept' | 'blocked' | 'failed'; auto: boolean; done_at: string | null; error: string | null;
}
export interface Paper { id: string; kind: string; name: string; holder: string | null; number_end: string | null; expires: string | null; notes: string | null; photo: string | null; created_at?: string }
export type Freeze = 'unknown' | 'frozen' | 'not';

// ---------- 🧾 returns & warranties, 🎂 important dates ----------
export interface Purchase { id: string; key: string; store: string; item: string | null; amount: number | null; bought: string; return_by: string | null; warranty_ends: string | null; status: 'keep' | 'kept' | 'returning' | 'returned' | 'ignored'; notes: string | null; created_at?: string }
export interface LifeDate { id: string; kind: string; title: string; next_date: string; every_months: number | null; remind_days: number; notes: string | null; created_at?: string }
export const DATE_KINDS: { id: string; icon: string; label: string }[] = [
  { id: 'birthday', icon: '🎂', label: 'Birthday' },
  { id: 'anniversary', icon: '💍', label: 'Anniversary' },
  { id: 'car', icon: '🚗', label: 'Car care' },
  { id: 'health', icon: '🩺', label: 'Health' },
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'pet', icon: '🐾', label: 'Pet' },
  { id: 'other', icon: '📌', label: 'Other' },
];
export const dateKind = (id: string) => DATE_KINDS.find((k) => k.id === id) ?? DATE_KINDS[DATE_KINDS.length - 1];

// ---------- 📅 appointments (found in emails and texts, put straight in the calendar: owner's choice) ----------
export interface Appointment {
  id: string; key: string; title: string; kind: string;
  day: string; // YYYY-MM-DD
  time: string | null; // HH:MM (24 h, your time zone); null = all day
  minutes: number | null; place: string | null; with_who: string | null; notes: string | null;
  source: 'email' | 'text' | 'hand'; source_from: string | null;
  status: 'booked' | 'cancelled' | 'removed';
  history: { at: string; what: string }[];
  created_at?: string; updated_at?: string;
}
export const APPT_KINDS: { id: string; icon: string; label: string }[] = [
  { id: 'health', icon: '🩺', label: 'Doctor & health' },
  { id: 'dental', icon: '🦷', label: 'Dentist' },
  { id: 'car', icon: '🚗', label: 'Car' },
  { id: 'beauty', icon: '💇', label: 'Hair & beauty' },
  { id: 'home', icon: '🏠', label: 'Home & repairs' },
  { id: 'pet', icon: '🐾', label: 'Pet' },
  { id: 'work', icon: '💼', label: 'Work & meetings' },
  { id: 'food', icon: '🍽️', label: 'Restaurant' },
  { id: 'other', icon: '📅', label: 'Other' },
];
export const apptKind = (id: string) => APPT_KINDS.find((k) => k.id === id) ?? APPT_KINDS[APPT_KINDS.length - 1];

export interface Doc {
  id: string; path: string; file_name: string; mime: string; size: number;
  status: 'new' | 'reading' | 'done' | 'failed'; extracted: Extracted | null; ai_by: string | null; error: string | null; item_id: string | null; created_at: string;
}

/** What the AI reads from a bill, policy, statement or email. */
export interface Extracted {
  isBill: boolean; // a recurring payment or a bill to pay (not an ad or a one-off receipt)
  name: string; // e.g. "Netflix", "State Farm car insurance"
  merchant: string; // the company
  category: Category;
  amount: number | null;
  currency: string;
  cycle: Cycle | null;
  nextDue: string | null;
  endsOn: string | null; // renewal / contract end / policy period end
  trialEnds: string | null;
  last4: string;
  policyNumber: string;
  coverage: string;
  deductible: number | null;
  balance: number | null; // loans / mortgage: what is still owed
  rate: number | null;
  summary: string; // 1-2 plain sentences
  warnings: string[]; // price going up, auto-renewal, cancellation deadline…
}

// ---------- AI (Settings → AI): free ones first, Claude (paid) only when they run out or fail ----------
export type Provider = 'gemini' | 'groq' | 'openrouter' | 'claude';
export interface ModelInfo { id: string; name: string; pictures: boolean; pdf: boolean }
export const PROVIDERS: { id: Provider; name: string; paid: boolean; env: string; models: ModelInfo[] }[] = [
  { id: 'gemini', name: 'Gemini', paid: false, env: 'GEMINI_API_KEY', models: [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', pictures: true, pdf: true },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite', pictures: true, pdf: true },
    { id: 'gemini-pro-latest', name: 'Gemini Pro', pictures: true, pdf: true },
  ] },
  { id: 'groq', name: 'Groq', paid: false, env: 'GROQ_API_KEY', models: [
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', pictures: true, pdf: false },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', pictures: false, pdf: false },
  ] },
  { id: 'openrouter', name: 'OpenRouter', paid: false, env: 'OPENROUTER_API_KEY', models: [
    { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (free)', pictures: true, pdf: false },
    { id: 'deepseek/deepseek-chat-v3.1:free', name: 'DeepSeek V3.1 (free)', pictures: false, pdf: false },
  ] },
  { id: 'claude', name: 'Claude', paid: true, env: 'ANTHROPIC_API_KEY', models: [
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', pictures: true, pdf: true },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', pictures: true, pdf: true },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', pictures: true, pdf: true },
  ] },
];
export const providerOf = (p: Provider) => PROVIDERS.find((x) => x.id === p)!;

export interface AiSlot { on: boolean; model: string; dailyLimit: number | null } // null = no limit

export interface Settings {
  ai: {
    order: Provider[]; // tried in this order; Claude is the paid safety net at the end
    slots: Record<Provider, AiSlot>;
    readEmails: boolean; // let the AI read receipt emails found in Gmail
    maxPerRun: number; // most emails/documents read by the AI in one automatic run
  };
  bank: { lookbackDays: number; minCharges: number; alerts: boolean }; // recurring = seen at least this many times; alerts = read bank alert emails
  calendar: { on: boolean; remindDays: number; renewals: boolean; trials: boolean };
  gmail: { on: boolean; plusTag: string }; // forwarding: you+lifetracker@gmail.com
  notify: { email: boolean; dueDays: number; renewalDays: number };
  currency: string;
  /** 👤 About me: what to look for online (private to you). */
  me: { names: string[]; emails: string[]; phones: string[]; places: string[]; usernames: string[] };
  online: { on: boolean; everyDays: number }; // 🕵️ search the web for you (free AI with Google Search)
  unsub: { on: boolean; auto: boolean; days: number; tidy: boolean }; // 📭 mailing lists; auto = unsubscribe from senders not opened in `days`
  papers: { on: boolean; remind: number[] }; // 🪪 heads-ups this many days before a document expires
  credit: { equifax: Freeze; experian: Freeze; transunion: Freeze; lastReport: string | null; reportMonths: number }; // 🔒
  week: { on: boolean; day: number }; // 📊 "My week" email (0 = Sunday)
  /** 💸 spending: monthly budgets per spending category, your own category for a shop, warn at this share of a budget. */
  spend: { budgets: Record<string, number>; rules: Record<string, string>; alertAt: number };
  purchases: { on: boolean; maxPerRun: number }; // 🧾 read order emails for returns & warranties
  /** 📅 appointments in emails (and texts, Android app) → straight into the calendar; reminders in minutes before. */
  appts: { on: boolean; timeZone: string; remind: number[] };
}

export const DEFAULT_SETTINGS: Settings = {
  ai: {
    order: ['gemini', 'groq', 'openrouter', 'claude'],
    slots: {
      gemini: { on: true, model: 'gemini-flash-latest', dailyLimit: 200 },
      groq: { on: true, model: 'meta-llama/llama-4-maverick-17b-128e-instruct', dailyLimit: 200 },
      openrouter: { on: false, model: 'meta-llama/llama-4-maverick:free', dailyLimit: 50 },
      claude: { on: true, model: 'claude-sonnet-5-5', dailyLimit: 10 },
    },
    readEmails: true,
    maxPerRun: 15,
  },
  bank: { lookbackDays: 400, minCharges: 2, alerts: true },
  calendar: { on: true, remindDays: 2, renewals: true, trials: true },
  gmail: { on: true, plusTag: 'lifetracker' },
  notify: { email: true, dueDays: 3, renewalDays: 30 },
  currency: 'USD',
  me: { names: [], emails: [], phones: [], places: [], usernames: [] },
  online: { on: true, everyDays: 7 },
  unsub: { on: true, auto: false, days: 60, tidy: true },
  papers: { on: true, remind: [90, 30, 7] },
  credit: { equifax: 'unknown', experian: 'unknown', transunion: 'unknown', lastReport: null, reportMonths: 4 },
  week: { on: true, day: 0 },
  spend: { budgets: {}, rules: {}, alertAt: 0.8 },
  purchases: { on: true, maxPerRun: 8 },
  appts: { on: true, timeZone: '', remind: [1440, 120] },
};

/** Saved settings merged over the defaults (new options get their default). */
export function withDefaults(s: Partial<Settings> | null | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  const ai = s?.ai;
  return {
    ...d, ...s,
    ai: {
      ...d.ai, ...ai,
      order: (ai?.order?.length ? ai.order : d.ai.order).filter((p) => p in d.ai.slots),
      slots: Object.fromEntries((Object.keys(d.ai.slots) as Provider[]).map((p) => [p, { ...d.ai.slots[p], ...ai?.slots?.[p] }])) as Settings['ai']['slots'],
    },
    bank: { ...d.bank, ...s?.bank },
    calendar: { ...d.calendar, ...s?.calendar },
    gmail: { ...d.gmail, ...s?.gmail },
    notify: { ...d.notify, ...s?.notify },
    me: { ...d.me, ...s?.me },
    online: { ...d.online, ...s?.online },
    unsub: { ...d.unsub, ...s?.unsub },
    papers: { ...d.papers, ...s?.papers },
    credit: { ...d.credit, ...s?.credit },
    week: { ...d.week, ...s?.week },
    spend: { ...d.spend, ...s?.spend, budgets: { ...s?.spend?.budgets }, rules: { ...s?.spend?.rules } },
    purchases: { ...d.purchases, ...s?.purchases },
    appts: { ...d.appts, ...s?.appts },
  };
}
