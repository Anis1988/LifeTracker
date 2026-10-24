import type { ReactNode } from 'react';
import { useState } from 'react';
import { Empty, Fold, FoldTarget, Seg, Toggle, shortDate } from '../components/ui';
import { takeParam } from '../lib/nav';
import { ItemRow, LoanCalc, Totals } from '../components/Items';
import { AskBar, AskChat, Ring, SpendCard, TimelineList } from '../components/Dash';
import { EmailControls } from '../components/Emails';
import { PeopleCtx, PersonChip, PersonFilter } from '../components/Person';
import { personOf } from '../../supabase/functions/_shared/mailPeople.ts';
import { PurchaseRow, SpendingView } from '../components/Spending';
import { MismatchPanel, PhotoPick, ReceiptDetailsView, SpendLine } from '../components/Receipts';
import { LogLines, type LogRow } from '../components/MoneyLog';
import { FilterBar, ReportAnswer, ReportAsk, ReportView } from '../components/Reports';
import { NO_FILTER, answerOf, buildReport, filterChips, type ReportFilter } from '../../supabase/functions/_shared/report.ts';
import type { SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { DateRow } from '../components/Dates';
import { timeline } from '../lib/timeline';
import { spendReport } from '../../supabase/functions/_shared/spend.ts';
import { AddedList, AddedRow, AlertList, DocRow } from '../components/Inbox';
import type { AddedEntry } from '../lib/added';
import { AlertBanks } from '../components/Bank';
import { GoogleAccounts, type GoogleExtra } from '../components/GoogleAccounts';
import { AboutMe } from '../components/AboutMe';
import { ApptCard } from '../components/Appointments';
import { ScriptView } from '../components/Negotiate';
import { ContactDetails, ContactGroup, KindChips, SearchBox, arrange, kindOptions } from '../components/Contacts';
import { Credit, NearbyLink, SpotList, TodoButtons, WebLoading, WeekendCard } from '../components/Nearby';
import type { Spot, Weekend } from '../../supabase/functions/_shared/place.ts';
import { PlaceCard } from '../components/MyList';
import type { ListPlace } from '../../supabase/functions/_shared/myList.ts';
import { APPS, AppCard, TotalCard, type AppSummary } from '../components/Apps';
import { BreachList, BrokerList, CreditCard, FindingRow, PaperRow, SenderRow, WeekCard } from '../components/Me';
import { LockScreen, PeopleEditor, ReadingCard, VaultDetails, VaultGroup, arrangeVault, vaultChips } from '../components/Vault';
import { PAPER_DEFAULTS, withDefaults, type Alert, type Appointment, type Contact, type Doc, type Finding, type Item, type LifeDate, type Paper, type Purchase, type Sender } from '../../supabase/functions/_shared/model.ts';
import { today } from '../../supabase/functions/_shared/money.ts';
import { SettingsSearch, SettingsTiles } from '../components/SettingsGrid';
import { PhoneTabBar } from '../components/Nav';
import { MenuList } from '../components/Menu';
import { SearchResults } from '../components/Search';
import { QuickAddList } from '../components/QuickAdd';
import { searchAll } from '../lib/search';
import { AddedCard } from './Home';
import { MailEveryPicker, MailPill } from '../components/MailCheck';

/* made-up examples, only for this guide */
const d = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
const base = { currency: 'USD', ends_on: null, trial_ends: null, autopay: true, status: 'active', merchant: null, account: null, website: null, notes: null, details: {}, source: 'manual', price_history: [], last_charged: null, last_amount: null, calendar: {} } as const;
const EX: Item[] = [
  { ...base, id: 'g1', name: 'Example Streaming', category: 'subscription', amount: 17.99, cycle: 'monthly', next_due: d(3), source: 'bank', price_history: [{ date: d(-27), amount: 17.99 }] },
  { ...base, id: 'g2', name: 'Example Home Loan', category: 'mortgage', amount: 2150, cycle: 'monthly', next_due: d(12), details: { balance: 280000, rate: 6.25, escrow: 420 } },
  { ...base, id: 'g3', name: 'Example Car Insurance', category: 'insurance', amount: 690, cycle: 'semiannual', next_due: d(40), ends_on: d(25), autopay: false },
  { ...base, id: 'g4', name: 'Example Music App', category: 'subscription', amount: 10.99, cycle: 'monthly', next_due: d(9), trial_ends: d(9) },
  { ...base, id: 'g5', name: 'Example Power Co', category: 'utility', amount: 96, cycle: 'monthly', next_due: d(18) },
] as Item[];
// 🆕 Made-up "What was added" feed (the 🔔 Inbox): each with ↶ Undo.
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const FEED: AddedEntry[] = [
  { key: 'f1', kind: 'bill', id: 'f1', icon: '🏋️', title: 'Example Gym', sub: '$39.00 every month · from your bank', where: 'Money → Bills', at: ago(2) },
  { key: 'f2', kind: 'receipt', id: 'f2', icon: '🧾', title: 'Example Cafe', sub: '$23.45 · receipt from an email · matched to your bank', where: 'Money → Spending', at: ago(5) },
  { key: 'f3', kind: 'appt', id: 'f3', icon: '🦷', title: 'Dentist: cleaning', sub: 'Thu, Oct 22, 3:30 PM · from a text', where: 'Calendar', at: ago(30) },
  { key: 'f4', kind: 'doc', id: 'f4', icon: '🐾', title: 'Rabies vaccine certificate', sub: 'Pets · Daizy · from an email', where: 'Vault', at: ago(52) },
  { key: 'f5', kind: 'contact', id: 'f5', icon: '🚗', title: 'Example Auto Repair', sub: 'Car · from your emails', where: 'Contacts', at: ago(200) },
];
const NEW_BILL = { ...base, id: 'g6', name: 'Example Gym', category: 'membership', amount: 39, cycle: 'monthly', next_due: d(6), source: 'bank', price_history: [] } as Item;
const ALERTS: Alert[] = [
  { id: 'a0', kind: 'found', key: '', title: 'Added: Example Gym $39.00 monthly — from your bank', body: 'Added to your bills by itself. Not a bill, or wrong? Tap Undo in the 🔔 Inbox (it won’t come back).', item_id: null, seen: false, created_at: '' },
  { id: 'a1', kind: 'price', key: '', title: 'Example Streaming went up: $15.49 → $17.99', body: 'That’s $30.00 more a year. Worth checking if you still need it.', item_id: null, seen: false, created_at: '' },
  { id: 'a2', kind: 'trial', key: '', title: `Example Music App: free trial ends in 3 days`, body: 'Cancel before then if you don’t want to pay $10.99.', item_id: null, seen: false, created_at: '' },
];
const DOC: Doc = { id: 'd1', path: '', file_name: 'policy-renewal.pdf', mime: 'application/pdf', size: 1, status: 'done', ai_by: 'Gemini Flash (free)', error: null, item_id: null, created_at: today(),
  extracted: { isBill: true, name: 'Example Car Insurance', merchant: 'Example Insurance', category: 'insurance', amount: 690, currency: 'USD', cycle: 'semiannual', nextDue: d(40), endsOn: d(25), trialEnds: null, last4: '', policyNumber: 'EX-123456', coverage: 'Liability 100/300, collision with $500 deductible, roadside help.', deductible: 500, balance: null, rate: null, summary: 'Your car insurance renews soon at $690 for 6 months.', warnings: ['Price up 8% at renewal'] } };

const fBase = { url: null, site: null, snippet: null, verdict: null, why: null, status: 'new', found_at: today(), check_after: null, created_at: '', updated_at: '' } as const;
const WEB: Finding[] = [
  { ...fBase, id: 'w1', kind: 'web', key: 'w1', title: 'Jordan Example - Example Bakery owner', url: 'https://example.com/team', site: 'example.com', snippet: 'Team page with a photo and a work email.', verdict: 'profile', why: 'Your own work page.' },
  { ...fBase, id: 'w2', kind: 'web', key: 'w2', title: '“Jordan Example” selling cheap phones', url: 'https://example.org/shop', site: 'example.org', snippet: 'A shop page using your name and photo.', verdict: 'worrying', why: 'Looks like a fake profile using your name.' },
];
const BROKER_ROWS: Finding[] = [
  { ...fBase, id: 'b1', kind: 'broker', key: 'spokeo', title: 'Spokeo', status: 'listed' },
  { ...fBase, id: 'b2', kind: 'broker', key: 'whitepages', title: 'Whitepages', status: 'requested', check_after: d(80) },
  { ...fBase, id: 'b3', kind: 'broker', key: 'radaris', title: 'Radaris', status: 'gone' },
];
const BREACH: Finding[] = [{ ...fBase, id: 'r1', kind: 'breach', key: 'Example Forum', title: 'Example Forum breach', found_at: d(-3) }];
const sBase = { first_seen: d(-120), unsub: { oneClick: 'https://example.com' }, spam: false, status: 'subscribed', auto: false, done_at: null, error: null, unread: 0 } as const;
const SENDERS: Sender[] = [
  { ...sBase, id: 'm1', address: 'deals@example-shop.com', name: 'Example Shop', sample: 'Last chance: 20% off everything', emails: 48, unread: 48, last_seen: d(-1), last_opened: null },
  { ...sBase, id: 'm2', address: 'news@example-paper.com', name: 'Example Paper', sample: 'Your morning briefing', emails: 30, last_seen: d(-1), last_opened: d(-2) },
  { ...sBase, id: 'm3', address: 'promo@example-travel.com', name: 'Example Travel', sample: 'Weekend getaways', emails: 12, unread: 12, last_seen: d(-9), last_opened: null, status: 'unsubscribed', auto: true, done_at: d(-2) },
  { ...sBase, id: 'm4', address: 'winner@example.biz', name: 'Prize Center', sample: 'You won!!!', emails: 6, unread: 6, last_seen: d(-4), last_opened: null, spam: true, unsub: {} },
] as Sender[];
const PAPERS: Paper[] = [
  { ...PAPER_DEFAULTS, id: 'p1', kind: 'passport', folder: 'ids', name: 'Passport', holder: 'Me', number_end: '4821', expires: d(52) },
  { ...PAPER_DEFAULTS, id: 'p2', kind: 'registration', folder: 'car', name: 'Car registration', holder: 'Example car', expires: d(140) },
];
// 📁 A made-up Vault: Daizy the dog's vaccines (one found in an email), IDs, the car, a lease, a tax form.
const VS = withDefaults({ vault: { emails: true, maxPerRun: 6, people: [{ name: 'Me', kind: 'me' }, { name: 'Daizy', kind: 'pet', emoji: '🐶' }, { name: 'Sam', kind: 'family', emoji: '👦' }], lock: { on: true, hash: '', salt: '', len: 4, minutes: 5, resetAsked: null } } });
const VAULT: Paper[] = [
  { ...PAPER_DEFAULTS, id: 'v1', folder: 'pets', name: 'Rabies vaccine certificate', holder: 'Daizy', doc_date: d(-325), expires: d(40), due_kind: 'due', tags: ['rabies', 'vet'], files: ['ex/1.pdf'], source: 'email',
    notes: 'From email: Daizy’s vaccine records — Example Pet Clinic, 2025-11-25', summary: 'Rabies vaccine given to Daizy (dog) at Example Pet Clinic. The next one is due in a year.', ai_by: 'Gemini Flash (free)' },
  { ...PAPER_DEFAULTS, id: 'v2', folder: 'pets', name: 'Vet check-up and DHPP booster', holder: 'Daizy', doc_date: d(-60), expires: d(305), due_kind: 'due', tags: ['vet', 'dhpp'], files: ['ex/1.jpg', 'ex/2.jpg'], source: 'scan' },
  { ...PAPER_DEFAULTS, id: 'v3', folder: 'ids', kind: 'passport', name: 'Passport', holder: 'Me', number_end: '4821', expires: d(52), files: ['ex/p.jpg'], source: 'scan' },
  { ...PAPER_DEFAULTS, id: 'v4', folder: 'car', kind: 'registration', name: 'Car registration', holder: 'Me', expires: d(140), files: ['ex/c.jpg'] },
  { ...PAPER_DEFAULTS, id: 'v5', folder: 'legal', name: 'Apartment lease', holder: 'Me', doc_date: d(-200), expires: d(165), tags: ['lease', 'home'], files: ['ex/l.pdf'], source: 'email' },
  { ...PAPER_DEFAULTS, id: 'v6', folder: 'school', name: 'Report card, spring', holder: 'Sam', doc_date: d(-130), tags: ['school'], files: ['ex/r.jpg'], source: 'scan' },
  { ...PAPER_DEFAULTS, id: 'v7', folder: 'taxes', name: '2025 W-2', holder: 'Me', doc_date: d(-250), tags: ['tax', '2025'], files: ['ex/w.pdf'], source: 'email', body: 'Wage and tax statement 2025 Example Employer' },
];
const VAULT_ALERT: Alert[] = [{ id: 'va1', kind: 'vault', key: '', title: '📁 Saved to your Vault: Rabies vaccine certificate (Daizy)', body: `From email: Daizy’s vaccine records — Example Pet Clinic. Next due ${d(40)}: you’ll get a heads-up.`, item_id: null, seen: false, created_at: '' }];

const DATES: LifeDate[] = [
  { id: 'l1', kind: 'birthday', title: 'Example Mom’s birthday', next_date: d(5), every_months: 12, remind_days: 7, notes: null },
  { id: 'l2', kind: 'car', title: 'Oil change', next_date: d(21), every_months: 6, remind_days: 7, notes: 'every 5,000 miles' },
];
const aBase = { status: 'booked' as const, minutes: null, notes: null, history: [] as Appointment['history'] };
const APPTS: Appointment[] = [
  { ...aBase, id: 'ap1', key: 'ap1', title: 'Dentist: cleaning', kind: 'dental', day: d(2), time: '15:30', place: '12 Example St', with_who: 'Example Dental', source: 'text', source_from: 'Example Dental', notes: 'Arrive 10 minutes early.' },
  { ...aBase, id: 'ap2', key: 'ap2', title: 'Car service', kind: 'car', day: d(6), time: '09:00', place: null, with_who: 'Example Garage', source: 'email', source_from: 'Example Garage', mailbox: 'sam@example.com' },
  { ...aBase, id: 'ap3', key: 'ap3', title: 'Dinner for 2', kind: 'food', day: d(9), time: '19:45', place: 'Example Bistro', with_who: null, source: 'email', source_from: 'Example Reservations' },
] as Appointment[];
const APPT_ALERT: Alert[] = [{ id: 'aa1', kind: 'appt', key: '', title: '📅 Added to your calendar: Dentist: cleaning · in 2 days, 3:30 PM', body: '12 Example St. Found in a text from Example Dental. Wrong? Remove it on Home.', item_id: null, seen: false, created_at: '' }];
const cBase = { key: '', person: null, phones: [] as string[], emails: [] as string[], website: null, address: null, notes: null, favorite: false, mine: [], status: 'active' as const };
const CONTACTS: Contact[] = [
  { ...cBase, id: 'c1', name: 'Example Dental', kind: 'dentist', person: 'Dr. Example', phones: ['(555) 010-0100'], website: 'https://www.example.com', address: '12 Example St, Springfield', emails: ['office@example.com'], description: 'Your dentist; next visit Oct 21', notes: 'Parking behind the building.', favorite: true, sources: ['email', 'appt'], last_seen: d(-6) },
  { ...cBase, id: 'c2', name: 'Example Auto Repair', kind: 'car', phones: ['(555) 238-0142'], address: '88 Sample Ave', description: 'Car care; last visit Aug 2026', sources: ['email'], last_seen: d(-60) },
  { ...cBase, id: 'c3', name: 'Example Insurance', kind: 'insurance', website: 'https://www.example.org', description: 'Your insurance; car insurance bill $690.00 every 6 months', sources: ['bill'], last_seen: d(-20) },
  { ...cBase, id: 'c4', name: 'Example Pet Clinic', kind: 'pet', phones: ['(555) 761-0177'], description: 'Our vet', sources: ['hand'], last_seen: d(-3) },
];
const BUYS: Purchase[] = [
  { id: 'u1', key: 'u1', store: 'Example Electronics', item: 'Headphones', amount: 149.99, bought: d(-12), return_by: d(2), warranty_ends: d(353), status: 'keep', notes: null },
  { id: 'u2', key: 'u2', store: 'Example Home', item: 'Desk lamp', amount: 39, bought: d(-5), return_by: d(25), warranty_ends: null, status: 'keep', notes: null },
];
// A made-up month of purchases (and 3 months before it) for the Spending example.
const ym = (n: number) => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() - n); return x.toISOString().slice(0, 7); };
const TX = [0, 1, 2, 3].flatMap((n) => [
  { posted: `${ym(n)}-02`, amount: -(n ? 410 : 362.4), description: 'EXAMPLE MARKET', merchant: 'example market' },
  { posted: `${ym(n)}-04`, amount: -(n ? 120 : 96.1), description: 'EXAMPLE GAS', merchant: 'example gas' },
  { posted: `${ym(n)}-05`, amount: -(n ? 180 : 214.5), description: 'EXAMPLE CAFE', merchant: 'example cafe' },
  { posted: `${ym(n)}-06`, amount: -(n ? 95 : 58.2), description: 'EXAMPLE PHARMACY', merchant: 'example pharmacy' },
]);
// Made-up "My apps" answers and a made-up price script.
const AI = (t: number, w: number, m: number, calls: number[], estimate = false) => ({ today: { calls: calls[0], usd: t }, week: { calls: calls[1], usd: w }, month: { calls: calls[2], usd: m }, estimate });
const APP_EX: AppSummary[] = [
  { app: 'lifetracker', lines: [{ icon: '📋', text: 'Next bill: Example Streaming $17.99 tomorrow', tone: 'info' }, { icon: '📅', text: 'Today: Dentist at 15:30', tone: 'info' }, { icon: '✅', text: 'Nothing waiting for you', tone: 'good' }], ai: AI(0.03, 0.09, 0.27, [6, 31, 120], true) },
  { app: 'trading', lines: [{ icon: '📈', text: 'Portfolio +1.2% today', tone: 'good' }, { icon: '🛑', text: '1 stock near its stop', tone: 'warn' }], ai: { ...AI(0.12, 0.61, 2.4, [4, 19, 77]), byModel: [{ model: 'Claude Sonnet', calls: 4, usd: 0.12 }] } },
];
const SCRIPT = {
  opener: 'Hi, I’ve been an Example Internet customer for about 3 years, and I’d like to talk about my bill.',
  ask: 'My bill went up to $79.99 a month. Is there a loyalty discount or a cheaper plan with the same speed you can give me?',
  ifNo: ['Could you check with the loyalty or retention team, please?', 'What promotions do you have for customers like me right now?'],
  switchLine: 'I like the service, but at this price I’m looking at other companies. I’d rather stay if we can find a better price.',
  tips: ['Before you call, look up what other internet companies near you offer today.', 'Write down the name of the person and the new price, and ask for it in writing.'],
  target: 'About $10–15 a month off, or the same speed for less.',
};

const RULES = { 'example market': 'groceries', 'example gas': 'gas', 'example cafe': 'dining', 'example pharmacy': 'health' };
const REPORT = spendReport(TX, RULES, ym(0), 31);
// 🧾 made-up receipts in Spending
const MARKET = ['Bananas', 'Whole milk, 1 gal', 'Sourdough bread', 'Eggs, dozen', 'Baby spinach', 'Cheddar cheese', 'Chicken thighs', 'Rice, 2 lb', 'Olive oil', 'Apples, 3 lb', 'Greek yogurt', 'Coffee beans'];
const RECEIPTS: SpendTx[] = [
  { id: 'r1', posted: d(-2), amount: -23.45, description: 'Example Cafe', merchant: 'example cafe', source: 'alert', account: 'Example Bank card', receipt_path: 'example.jpg', note: 'From email: Your receipt from Example Cafe — Example Cafe, ' + d(-2),
    details: { store: 'Example Cafe', date: d(-2), total: 23.45, tax: 1.75, card: '4821', read: 'free', items: [{ name: 'Oat latte', qty: 2, price: 11.0 }, { name: 'Blueberry muffin', qty: 1, price: 3.95 }, { name: 'Tip', qty: null, price: 6.75 }] } },
  { id: 'r3', posted: d(-4), amount: -64.37, description: 'Example Market', merchant: 'example market', source: 'receipt', account: 'Receipt', receipt_path: 'example-2.jpg', note: 'Added by hand on ' + d(-4),
    details: { store: 'Example Market', date: d(-4), total: 64.37, tax: 2.15, card: '4821', read: 'ai', by: 'Gemini Flash (free)', items: MARKET.map((name, k) => ({ name, qty: k % 4 === 1 ? 2 : 1, price: [0.89, 7.58, 5.49, 4.29, 3.99, 6.49, 9.12, 3.29, 8.99, 4.99, 5.79, 11.49][k] })) } },
  { id: 'r2', posted: d(-6), amount: -86.12, description: 'Example Hardware', merchant: 'example hardware', source: 'receipt', account: 'Receipt', receipt_path: 'example.pdf', note: 'From email: Your Example Hardware receipt — Example Hardware, ' + d(-6),
    details: { store: 'Example Hardware', date: d(-6), total: 86.12, tax: 5.62, card: null, read: 'ai', by: 'Gemini Flash (free)', items: [{ name: 'Paint roller kit', qty: 1, price: 24.5 }, { name: 'Wall paint, 1 gal', qty: 2, price: 56.0 }] } },
];

// 📎 a made-up bank alert purchase, then the same purchase with a receipt added to it
const ALERT_TX: SpendTx = { id: 'a1', posted: d(-3), amount: -25.0, description: 'SQ *SAMPLE DINER', merchant: 'sample diner', source: 'alert', account: 'Example Bank card', receipt_path: null, note: null, details: null };
const ALERT_WITH: SpendTx = { ...ALERT_TX, receipt_path: 'example-3.jpg',
  details: { store: 'Sample Diner', date: d(-3), total: 21.0, tax: 1.5, card: '4821', read: 'ai', by: 'Gemini Flash (free)', mismatch: null, items: [{ name: 'Grilled cheese', qty: 1, price: 8.5 }, { name: 'Tomato soup', qty: 1, price: 5.0 }, { name: 'Iced tea', qty: 2, price: 6.0 }, { name: 'Tip', qty: null, price: 4.0 }] } };
const ALERT_ODD: SpendTx = { ...ALERT_WITH, details: { ...ALERT_WITH.details!, total: 31.4, items: [], mismatch: { receipt: 31.4, bank: 25, kept: false } } };
// 💸 the ONE list: a made-up few days of purchases from everywhere (alerts, a CSV, receipts), newest first
const GAS_TX: SpendTx = { id: 'g1', posted: d(-2), amount: -41.2, description: 'EXAMPLE GAS 0042', merchant: 'example gas', source: 'alert', account: 'Example Bank card', receipt_path: null, note: 'From email (sam@example.com)', details: null };
// 👥 made-up mailboxes: Jordan (the main one, blue edge) and Sam (an extra one, pink edge)
const JORDAN = personOf('jordan@example.com', true, { name: 'Jordan', color: 'sky' });
const SAM = personOf('sam@example.com', false, { name: 'Sam', color: 'pink' });
const GUIDE_PEOPLE = [JORDAN, SAM];
const SHOP_TX: SpendTx = { id: 'c1', posted: d(-4), amount: -18.99, description: 'EXAMPLE BOOKS ONLINE', merchant: 'example books online', source: 'csv', account: 'CSV import', receipt_path: null, note: null, details: null };
const DAYS_EX: [string, SpendTx[]][] = [[d(-2), [RECEIPTS[0], GAS_TX]], [d(-3), [ALERT_WITH]], [d(-4), [RECEIPTS[1], SHOP_TX]]];
// 📜 made-up Log lines
const at = (days: number, hm: string) => new Date(`${d(days)}T${hm}:00`).toISOString();
const LOG_EX: LogRow[] = [
  { id: 'l1', at: at(0, '10:42'), kind: 'change', ref: null, data: {}, text: 'Example Corner Shop · category Other → Groceries (rule saved: this shop from now on)' },
  { id: 'l2', at: at(-2, '18:05'), kind: 'receipt', ref: null, data: {}, text: 'Example Cafe $23.45 · receipt attached (a receipt email) · 3 items · total matches the bank' },
  { id: 'l3', at: at(-2, '17:31'), kind: 'purchase', ref: null, data: {}, text: 'Example Cafe $23.45 · from Example Bank …4821 alert → 🍽️ Eating out' },
  { id: 'l4', at: at(-3, '12:10'), kind: 'receipt', ref: null, data: {}, text: 'SQ *SAMPLE DINER $25.00 · receipt attached · 4 items · total matches' },
  { id: 'l5', at: at(-4, '09:15'), kind: 'bill', ref: null, data: {}, text: 'bill Example Streaming $15.49 monthly auto-added — from your bank' },
  { id: 'l6', at: at(-5, '20:02'), kind: 'change', ref: null, data: {}, text: 'Example Toys $12.00 · deleted' },
];

// 📍 made-up places near a made-up zip
const spBase = { phone: null, website: null, route: false, from: 'osm' as const, lat: 0, lon: 0 };
const SPOTS: Spot[] = [
  { ...spBase, name: 'Example Family Dental', kind: 'dentist', address: '410 Example Rd, Springfield', phone: '(555) 010-0144', website: 'https://www.example.com', miles: 1.2, minutes: 4, route: true },
  { ...spBase, name: 'Sample Smiles', kind: 'dentist', address: '77 Sample Ave, Springfield', miles: 2.8, minutes: 9, route: true },
  { ...spBase, name: 'Example Dental Care', kind: 'dentist', address: 'Example Pike, Riverton', miles: 6.4, minutes: 17 },
];
// 📌 made-up places on My list
const lpBase = { user_id: '', phone: null, website: null, lat: null, lon: null, route: true, when_text: null, about: null, source: null, note: null, planned: null, done: false, done_at: null, rating: null, created_at: ago(30), updated_at: ago(2) };
const LIST_EX: ListPlace[] = [
  { ...lpBase, id: 'l1', name: 'Sample Bistro', kind: 'food', address: '9 Main St, Springfield', about: 'italian', miles: 1.6, minutes: 5, planned: d(1), note: 'Try the mushroom pasta. Book a table for 4.' },
  { ...lpBase, id: 'l2', name: 'Example Nature Park', kind: 'fun', address: null, about: 'park', miles: 2.4, minutes: 7, done: true, done_at: ago(26), rating: 5, note: 'Great trail by the creek.' },
];
const HOME_EX = { zip: '00000', town: 'Springfield', state: 'XX', lat: 0, lon: 0 };
const WEEKEND_EX: Weekend = {
  home: HOME_EX, friday: d(0), by: ['OpenStreetMap', 'Gemini (free) with Google Search'], at: ago(2),
  events: [{ ...spBase, name: 'Example Fall Market', kind: 'event', address: 'Town Square, Springfield', when: 'Sat 9 am – 1 pm', source: 'https://www.example.org', from: 'web', miles: 3.1, minutes: 10, route: true }],
  near: [
    { ...spBase, name: 'Example Nature Park', kind: 'fun', address: null, about: 'park', miles: 2.4, minutes: 7, route: true },
    { ...spBase, name: 'Sample Bistro', kind: 'food', address: '9 Main St, Springfield', about: 'italian', miles: 1.6, minutes: 5, route: true },
  ],
  far: [{ ...spBase, name: 'Example Lake State Park', kind: 'trip', address: 'Lakeview, XX', miles: 58, minutes: 85, from: 'web', source: 'https://www.example.org' }],
};

// 📬 Email checks example: made-up "now" 10:38 today, last check 10:30 found 3 new emails.
const clock = (h: number, m: number) => { const x = new Date(); x.setHours(h, m, 0, 0); return x.getTime(); };
function MailCheckDemo() {
  const [every, setEvery] = useState(15);
  return (
    <div className="space-y-3">
      <MailPill every={every} now={clock(10, 38)} check={{ at: new Date(clock(10, 30)).toISOString(), state: 'ok', text: '3 new', every, next: null }} />
      <MailPill every={every} now={clock(10, 38)} check={{ at: new Date(clock(10, 15)).toISOString(), state: 'slow', text: 'stopped: Gmail asked to slow down', every, next: null }} />
      <MailPill every={0} now={clock(10, 38)} />
      <MailEveryPicker every={every} onChange={setEvery} />
    </div>
  );
}
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const GMAIL_EXTRAS: GoogleExtra[] = [
  { kind: 'google:2', email: 'sam@example.com', on: true, gmail: true, mailbox: false, lastScan: hoursAgo(0.4), lastError: null, connectedAt: null, person: { name: 'Sam', color: 'pink' } },
  { kind: 'google:3', email: 'old.shopping@example.com', on: false, gmail: true, mailbox: false, lastScan: hoursAgo(30), lastError: null, connectedAt: null },
];

// 📊 made-up purchases for Reports: Jordan's (bank alerts = the main mailbox) and Sam's (receipts from Sam's email)
const rp = (id: string, days: number, amount: number, description: string, sam = false): SpendTx => ({ id, posted: d(days), amount: -amount, description, merchant: description.toLowerCase(), source: sam ? 'receipt' : 'alert', account: 'Example Bank card', receipt_path: null, note: sam ? 'From email (sam@example.com): your receipt' : null, details: null });
const REPORT_TX: SpendTx[] = [
  rp('p1', -1, 64.37, 'Example Market'), rp('p2', -3, 23.45, 'Example Cafe', true), rp('p3', -4, 41.2, 'Example Gas'), rp('p4', -6, 88.1, 'Example Market', true),
  rp('p5', -8, 15.5, 'Example Pizza'), rp('p6', -10, 52.75, 'Example Market'), rp('p7', -12, 31.9, 'Example Cafe', true), rp('p8', -13, 19.99, 'Example Books Online'),
  rp('q1', -33, 120.4, 'Example Market'), rp('q2', -36, 64.0, 'Example Cafe', true), rp('q3', -40, 38.5, 'Example Gas'), rp('q4', -44, 95.3, 'Example Market', true),
];
const REPORT_RULES = { 'example market': 'groceries', 'example cafe': 'dining', 'example pizza': 'dining', 'example gas': 'gas', 'example books online': 'shopping' };
const REPORT_CTX = { rules: REPORT_RULES, people: [JORDAN, SAM], today: d(0) };
const REPORT_F: ReportFilter = { ...NO_FILTER, period: { kind: 'custom', from: d(-27), to: d(0) } };
const FOOD_F: ReportFilter = { ...REPORT_F, cats: ['groceries', 'dining'], person: SAM.email };
const REPORT_EX = buildReport(REPORT_TX, REPORT_F, REPORT_CTX);
const FOOD_EX = buildReport(REPORT_TX, FOOD_F, REPORT_CTX);

const Example = ({ children, caption }: { children: ReactNode; caption: string }) => (
  <figure className="space-y-1.5">
    <div className="pointer-events-none relative select-none space-y-2 rounded-[24px] border border-dashed border-teal-600/25 bg-white/30 p-2.5 pt-7 dark:border-teal-300/20 dark:bg-white/[0.02]" aria-hidden="true">
      <span className="label absolute left-3 top-2 !text-[9.5px] !text-teal-700/80 dark:!text-teal-300/70">Example</span>
      {children}
    </div>
    <figcaption className="px-1 text-xs text-slate-500 dark:text-slate-400">{caption}</figcaption>
  </figure>
);
const P = ({ children }: { children: ReactNode }) => <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>;

/** Made-up search for "example 25": the matched words lit, a receipt line found by an item on it, and the locked-Vault row. */
function SearchExample() {
  const all = searchAll({ items: EX, tx: RECEIPTS, contacts: CONTACTS, places: LIST_EX, papers: [], appts: APPTS, rules: RULES }, 'example', { vaultOpen: false, max: 2 });
  const groups = all.slice(0, 4);
  return (
    <div className="space-y-3">
      <div className="input qfield flex w-full items-center gap-3 !pl-4 text-slate-900 dark:text-slate-50"><span aria-hidden="true">🔎</span>example</div>
      <SearchResults q="example" example active={0} groups={groups} />
    </div>
  );
}

export function Guide() {
  // "#/guide?t=<topic>" (from 🔎 search) opens that topic and scrolls to it.
  const [topic] = useState(() => takeParam('t', '#/guide'));
  return (
    <FoldTarget.Provider value={topic || null}>
    <PeopleCtx.Provider value={GUIDE_PEOPLE}>
    <div className="stagger mx-auto max-w-2xl space-y-3">
      <h1 className="text-[28px] font-semibold leading-tight">Guide</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">How LifeTracker works, in plain words. Tap a topic.</p>

      <Fold icon="✨" title="What it does" open>
        <P>LifeTracker keeps every regular payment in one place: subscriptions, mortgage or rent, insurance, utilities, phone and internet, loans, memberships. It shows what they cost each month and year, what’s due next, and warns you before a renewal, a free trial ending, or a price going up.</P>
        <P>It works <b>by itself</b> (your choice: fully automatic, no OK needed): every hour (or as often as you pick in 📬 Email checks) it reads your bank’s purchase-alert emails, receipts, bills and documents in Gmail, and whatever you scan or upload, and <b>adds what it finds straight away</b>: bills go into your bills, receipts into Spending, documents into your Vault, appointments into your calendar, the places you deal with into Contacts. Each time you get a heads-up, and <b>What was added</b> on Home (and the <b>🔔 Inbox</b> bell at the top) lists what was added lately, each with <b>↶ Undo</b> (it’s taken away and won’t come back). It never pays, cancels or moves money: it has no way to. Deleting something of yours still asks first.</P>
        <P>At the bottom of your phone: <b>Home</b> (calm: your spending first), <b>Money</b> (Bills · Spending · Returns · Log), the round <b>＋</b> that adds anything, <b>📊 Reports</b> (your spending, your way) and <b>Places</b> (Contacts · Nearby · My list). At the top: <b>☰ Menu</b> on the left (every page, including <b>Me</b>: Vault · Privacy · Settings, the Guide, My apps and Sign out), then <b>🔎 search</b> and the <b>🔔 Inbox</b> on the right. On a computer all the tabs also sit at the top.</P>
        <P><b>Me → 🛡️ Privacy</b> is about you: where your name shows up online, people-search sites that list you, data breaches, the mailing lists you never read, important dates and your credit freeze. Documents that expire (passport, licence…) are in <b>Me → 📁 Vault</b>. <b>My week</b> sums it all up on Home and, if you want, in an email (✉️ Emails to me).</P>
      </Fold>

      <Fold icon="🏠" title="Home (calm, spending first)">
        <P>The app always opens on <b>Home</b>, and the first thing on Home is <b>what you spent this month</b>: one big number, the ring (how much of a usual month that is), one short line (under or over a usual month so far) and your top 3 categories. <b>See all spending</b> opens Money → Spending. Each tab still remembers which part you used last.</P>
        <Example caption="Made-up top of Home: spending first, then Ask.">
          <div className="space-y-3">
            <SpendCard total={1842} usual={2120} soFarUsual={1990} top={[{ id: 'groceries', amount: 612.4 }, { id: 'dining', amount: 288.1 }, { id: 'gas', amount: 164 }]} monthName="October" onAll={() => undefined} />
            <AskBar disabled />
          </div>
        </Example>
        <P>Below it, in this order: the <b>💬 Ask</b> bar, the next <b>3 things coming up</b> (bills, appointments, trials, renewals, documents, dates, return windows; <b>See more</b> shows 60 days), the weekend or <b>Nearby</b> link, and <b>My week</b>.</P>
        <Example caption="Made-up Coming up: only the next 3 on Home.">
          <TimelineList moments={timeline({ items: EX, papers: PAPERS, dates: DATES, purchases: BUYS, appts: APPTS }, 30)} max={3} onAll={() => undefined} />
        </Example>
        <P>At the very bottom, quietly: <b>What was added</b> folded to one line (tap <b>View</b> for the newest 3 with ↶ Undo, or open the 🔔 Inbox), then the <b>heads-ups</b>, then when email was last checked.</P>
        <Example caption="Made-up bottom of Home: What was added, folded.">
          <AddedCard list={FEED} week={7} />
        </Example>
      </Fold>

      <Fold icon="🧭" title="Finding your way (tabs, search, ＋)">
        <P>Each tab has a switch at the top for its parts (like <b>Bills | Spending | Returns</b>), and it remembers the part you used last on this phone. Tap the tab again any time; the phone’s back button closes an open panel (or the ☰ Menu) first, then goes back to Home.</P>
        <P>On a phone the bar at the bottom is <b>Home · Money · ＋ · Reports · Places</b>.</P>
        <P><b>☰ Menu</b> is the button at the top-left of every page. It slides in from the left and is the map of the whole app. Each tab is one closed line: tap it to open it and see its parts, then tap the part you want (the menu closes and takes you there). Only one tab is open at a time; tap it again to close it. <b>Home</b> is a single line. <b>Reports</b> holds your ⭐ saved reports, and <b>Me → Settings</b> has an arrow that opens every Settings square. The tab you’re in starts open with your page lit. Type in the box at the top to find a page by name (“vault”, “zip”, “budgets”): the matching tabs open by themselves. Inbox, Guide, My apps, Search and Sign out (it asks first) are at the bottom. Close it with ✕, a tap on the page beside it, or the back button.</P>
        <Example caption="Made-up tab bar: Reports is open; ＋ sits in the middle.">
          <PhoneTabBar tab="reports" example />
        </Example>
        <Example caption="Made-up Menu, all tabs closed.">
          <MenuList saved={[{ id: 's1', name: 'Sam’s food', filter: FOOD_F }]} meCount={2} example startOpen={null} />
        </Example>
        <Example caption="Made-up Menu with Money opened (you’re in Spending) and two saved reports.">
          <MenuList saved={[{ id: 's1', name: 'Sam’s food', filter: FOOD_F }, { id: 's2', name: 'Groceries this year', filter: REPORT_F }]} meCount={2} example here={{ tab: 'money', view: 'spending' }} startOpen="money" onSignOut={() => undefined} />
        </Example>
        <P><b>Where did it go?</b> Nothing was removed, things just moved:</P>
        <div className="card overflow-hidden !p-0">
          <table className="w-full text-left text-sm">
            <thead><tr className="label"><th className="px-3 py-2 font-normal">Before</th><th className="px-3 py-2 font-normal">Now</th></tr></thead>
            <tbody className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.06]">
              {[['Money → 📊 Reports', '📊 Reports, its own tab at the bottom'], ['☰ Menu tab at the bottom', '☰ at the top-left of every page'], ['Places in ☰ Menu', '📍 Places, back at the bottom'], ['Me tab at the bottom', '☰ Menu → 👤 Me (a tab at the top on a computer)'], ['Contacts tab', 'Places → 📇 Contacts'], ['Contacts → 📍 Nearby', 'Places → 🔎 Nearby'], ['Nearby → 📌 My list', 'Places → 📌 My list'], ['Vault tab', 'Me → 📁 Vault'], ['Me tab', 'Me → 🛡️ Privacy'], ['Documents that expire (Me)', 'Me → 📁 Vault (same documents)'], ['Settings tab', 'Me → ⚙️ Settings'], ['Guide and My apps (top)', '☰ Menu, the bottom of Me, and Settings'], ['🆕 “added by itself” card', 'Home → What was added (the 🔔 bell still opens all)']].map(([a, b]) => (
                <tr key={a}><td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{a}</td><td className="px-3 py-2.5 font-semibold">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>Old links still work: “Settings → Nearby” and the like open the right square in Me → Settings, and old “Money → Reports” links open 📊 Reports.</P>
        <P><b>🔎 Search</b> (the magnifier at the top, on every page) finds a word anywhere in the app as you type: bills, purchases and the lines on their receipts, returns, the money log, what was added, contacts, Nearby’s weekend list, My list, your Vault documents (only while the Vault is open: a locked Vault shows one 🔒 line instead), appointments, Privacy (your name online, people-search sites, breaches, mailing lists, important dates, credit freezes), Settings and this Guide.</P>
        <P>Capitals and accents don’t matter (“cafe” finds “Café”). Type several words and only things with all of them show up. Numbers find amounts (“25” finds $25.00 and $25.49) and phone numbers by their digits. Best matches come first (in the name, then at the start of a word), then the newest. The words you typed are lit up, with a short line showing where they were found. Results come grouped by section with how many; tap a section chip at the top to see only that one. Tap a result and it opens right where it lives.</P>
        <P>Before you type: your recent searches (on this phone only) and a chip for each section, to look through just that one. On a computer, press <b>/</b> or <b>Ctrl K</b> anywhere to open it, ↑ ↓ to move and Enter to open. No AI and nothing sent anywhere.</P>
        <Example caption="Made-up search for “example”: the words found are lit up; the Vault is locked, so its documents aren’t searched.">
          <SearchExample />
        </Example>
        <P><b>＋ Add</b>: a receipt (photo or PDF, read at once), a bill, a bill as a photo or PDF, a document to the Vault, a place (opens Nearby’s search) or a contact. Each opens the usual way of adding it.</P>
        <Example caption="Made-up ＋ panel (the receipt button sits above these).">
          <QuickAddList example />
        </Example>
        <P><b>💬 Ask can open things</b>: “open my lease”, “show Example Dental”, “where is my passport?” finds it on your phone (no AI, nothing paid) and gives you an <b>Open</b> button.</P>
        <Example caption="Made-up “open” question.">
          <AskChat turns={[{ q: 'show Example Dental', a: 'Here it is: Example Dental (Dr. Example · (555) 010-0100 · 12 Example St), in Contacts.', by: 'this phone (no AI)', open: { label: 'Open Example Dental', href: '#/guide' } }]} />
        </Example>
      </Fold>

      <Fold icon="🫧" title="How it looks and feels">
        <P>Everything sits on frosted glass over a slow, soft glow. The edge of each card catches the light like real glass: bright at the top, a hint of colour at the bottom. When a page opens, its cards float in one after the other. When you tap a button or a row it sinks a little, a glow spreads from your finger and it springs back. The tab bar at the bottom has a glass bubble that slides to the tab you open, and switches (like Bills | Spending | Returns) slide the same way.</P>
        <P>Panels (a bill, a date, Ask) slide up from the bottom; their title and ✕ stay at the top while you scroll. While your data loads you see a soft shimmering outline of the page instead of a spinner, and an empty list shows a small floating bubble with a word on what to do. Rings and bars draw themselves in. Big numbers are big, labels are small, and everything you tap is at least a fingertip tall.</P>
        <P>It follows your phone: light by day, dark at night. If your phone is set to <b>reduce motion</b>, all the movement stops and everything simply appears.</P>
        <Example caption="Made-up example: a switch, an on/off switch, a ring, a button, a loading outline and an empty list, as they look in the app.">
          <div className="space-y-3">
            <Seg label="Example" options={[['a', 'Bills'], ['b', 'Spending'], ['c', 'Returns']]} value="b" onChange={() => undefined} />
            <div className="card flex items-center gap-3 !py-3">
              <Ring value={0.72} size={64} stroke={7} label="Example ring 72%"><span className="num text-[13px] font-semibold">72%</span></Ring>
              <span className="flex-1 text-sm font-semibold">Daily check</span>
              <Toggle on label="Example switch" onChange={() => undefined} />
            </div>
            <span className="btn-primary w-full">Run the check now</span>
            <div className="card flex items-center gap-3 !py-3"><div className="skel h-11 w-11 shrink-0 !rounded-2xl" /><div className="flex-1 space-y-2"><div className="skel h-3.5 w-2/3" /><div className="skel h-3 w-1/3" /></div></div>
            <Empty icon="📬">Nothing new lately. What’s added by itself shows up here.</Empty>
          </div>
        </Example>
        <P>The app icon is a small glowing planet with a ring and an amber moon: your life in the middle, with what’s coming up going around it.</P>
      </Fold>

      <Fold icon="⚙️" title="Settings">
        <P><b>Me → ⚙️ Settings</b> is a grid of squares, one per topic (About me, Google, Appointments, Spending, Bank, Vault, Contacts, Nearby, AI…, plus My apps and this Guide). Each square shows in a few words how it’s set right now: a teal dot when it’s on, a grey one when it’s off. Tap a square and its settings slide up in a panel; ✕ (or the phone’s back button) closes it. Everything saves as soon as you change it.</P>
        <P>Can’t find something? Type in the <b>search box</b> at the top: “zip”, “PIN”, “budget”, “Gmail”… only the squares that have it stay. When another page says “Settings → Nearby”, tapping it opens that square straight away.</P>
        <Example caption="Made-up example of the Settings grid.">
          <div className="space-y-2.5">
            <SettingsSearch q="" onChange={() => undefined} />
            <SettingsTiles tiles={[
              { id: 'a', icon: '📍', title: 'Nearby', status: '12345 · weekend on' },
              { id: 'b', icon: '📁', title: 'Vault', status: '14 docs · 🔒 PIN' },
              { id: 'c', icon: '🤖', title: 'AI', status: '3 AIs set up' },
              { id: 'd', icon: '📭', title: 'Mailing lists', status: 'Off', off: true },
            ]} />
          </div>
        </Example>
      </Fold>

      <Fold icon="💬" title="Ask LifeTracker">
        <P>Type a question in the bar on Home, in your own words: “How much did I spend eating out last month?”, “Which subscriptions renew this month?”, “What could I cancel?”, “When does my passport expire?”. The answer comes only from your own data, with follow-up questions to tap. It knows your zip code too: “find me a dentist near me” answers with your contacts and the closest dentists on the free map, with miles and drive time.</P>
        <P>Each question is one AI read: the free AIs first, Claude only if they can’t (Settings → AI). A short summary of your bills, spending, documents, dates, contacts and your zip code goes to the AI with the question, nothing else.</P>
        <Example caption="Made-up question and answer.">
          <AskChat turns={[{ q: 'How much did I spend eating out last month?', a: 'In September you spent $180.00 eating out, mostly at Example Cafe (9 times). That’s about the same as a usual month.', by: 'Gemini Flash (free)', followUps: ['And on groceries?', 'Which month was highest?'] }]} />
        </Example>
      </Fold>

      <Fold icon="💸" title="Spending and budgets">
        <P>In <b>Money → Spending</b> every purchase is in <b>one list</b>: from your bank alert emails, a bank CSV, your bank link and your receipts, all together, newest first, by day. Nothing is shown twice. Each line has the shop, its <b>category</b>, the amount, where it came from (📧 bank alert email, 📄 CSV, 🏦 bank link, 🧾 receipt only) and a small picture when it has a receipt. A receipt’s items open right there with <b>▾</b>.</P>
        <P>At the top: this month (or last month) against your usual month (the 3 before), then each category’s total. The category on a line is <b>always the one its money is counted in</b>. Tap a category (or a chip above the list) to see only its purchases; tap it again for all. <b>🎯 Budgets</b> sets a monthly budget per category: you get a heads-up at 80% (change it in Settings → Spending & returns) and when it’s used up. Transfers (Zelle, Venmo, cash) are listed but not counted as spending.</P>
        <Example caption="Made-up month: eating out over its usual amount, groceries with a budget.">
          <SpendingView r={REPORT} budgets={{ groceries: 450, dining: 200 }} monthName="This month" />
        </Example>
        <Example caption="Made-up purchases: a cafe receipt from an email on a bank alert (items opened), gas from an alert, a diner receipt you added to its bank alert, a grocery receipt you scanned, a book shop from a CSV.">
          <div className="card !px-3 !py-1">
            {DAYS_EX.map(([day, xs]) => (
              <div key={day}>
                <p className="label border-t border-slate-900/[0.06] pb-0.5 pt-2.5 first:border-0 dark:border-white/[0.06]">{shortDate(day)}</p>
                <ul>{xs.map((t) => <SpendLine key={t.id} t={t} rules={RULES} example startOpen={t.id === 'r1'} />)}</ul>
              </div>
            ))}
          </div>
        </Example>
        <P><b>🔎 Search</b> and the <b>category chips</b> sit right above the list. Search finds any purchase in any month as you type: a shop, something on a receipt (“latte”), an amount (“23.45”), a month (“March”), a category or words from the email it came from. It all happens on your phone.</P>
        <P><b>Tap a line</b> to change it: <b>✎ Edit</b> the shop name, date, amount or note; pick another <b>category</b> (that shop always goes there from now on, and its total moves with it); add, replace or remove its receipt; or <b>🗑 Delete</b> it (it asks first).</P>
        <Example caption="Made-up $25.00 bank alert, tapped: add its receipt.">
          <div className="card space-y-3">
            <ReceiptDetailsView t={ALERT_TX} rules={{}} actions={{ attach: <div className="col-span-2 space-y-1"><p className="label px-1">📎 Add its receipt</p><PhotoPick busy={false} onFile={() => undefined} example /></div>, line: () => undefined, del: () => undefined }} />
          </div>
        </Example>
        <P><b>🧾 Receipts.</b> A receipt in your email (the email itself, or a photo or PDF attached to it) comes in <b>by itself</b>. A paper one: tap <b>📷 Take photo</b> (the camera opens straight away) or <b>🖼️ Choose photo / PDF</b> (your gallery or files). The same two buttons are on a purchase (📎 Add its receipt) and in ＋. It’s made smaller on your phone and read once (the free AIs first; the same file is never paid for twice), then saved, nothing to press after.</P>
        <P><b>Never counted twice</b>: when a receipt has the same amount as a bank purchase (to the cent, or with a tip line), within 3 days and with a matching shop name (“Sample Diner” = “SQ *SAMPLE DINER”), it’s <b>attached to that purchase</b> instead of adding a second one, whichever comes first. If you add a receipt to a purchase and the totals differ, you choose:</P>
        <Example caption="Made-up receipt whose total isn’t the bank’s.">
          <MismatchPanel t={ALERT_ODD} />
        </Example>
        <P>The receipt’s picture: tap it for full screen (tap again to zoom) with ⬇ Download, ↗ Share and 🗑 Delete; a receipt that is an email opens the email.</P>
        <Example caption="Made-up receipt sheet: what was read from it.">
          <div className="card"><ReceiptDetailsView t={RECEIPTS[0]} rules={{}} example actions={{ edit: () => undefined, del: () => undefined }} /></div>
        </Example>
        <P><b>How often</b>: your Gmail is checked <b>every hour</b> by itself (change it in Settings → 📬 Email checks) for receipts, bank alerts, bills, orders and documents (free checks first, so most hours cost nothing). Settings → Spending & returns shows when it last checked.</P>
      </Fold>

      <Fold icon="📊" title="Reports (your spending, your way)">
        <P><b>📊 Reports</b> (its own tab, at the bottom on a phone) shows your spending the way you want it. Pick what to look at with the chips: <b>📅 period</b> (this month, last month, the last 3, 6 or 12 months, this year, a month, or your own dates), <b>🏷️ categories</b> (one or several; “Food” = groceries + eating out), <b>👥 person</b> (everyone, or just one person’s email), <b>🔎 shop or item</b> (“Amazon”, or “latte” from your receipts), <b>where it came from</b> (bank alert, receipt, CSV) and a <b>smallest amount</b>. They work together, and ↺ Reset clears them. This phone remembers your last choice.</P>
        <P>On a phone the chips fold into one line, <b>Filters: This month · All people · Edit</b>: tap <b>Edit</b> to change them, <b>Done</b> to fold them again. On a computer they always show.</P>
        <P>The report, one card at a time: the <b>total</b> in big numbers and how it compares with the same stretch just before (▲ more / ▼ less, in words), <b>who spent it</b> (each person in their colour), <b>by category</b>, <b>top shops</b>, a chart <b>by day, week or month</b>, and the purchases themselves (tap one to open it). Each chart has its amounts written on it. Long lists show their <b>top 5</b> first; <b>Show all</b> opens the rest. Tap a category, a shop or a name to see only that.</P>
        <P><b>All of it is worked out on your phone</b> from purchases already there: no AI, nothing sent. Picking just one person is only a filter, so it’s free too. Older months are loaded when you pick a longer period.</P>
        <Example caption="Made-up four weeks: Jordan (blue) and Sam (pink).">
          <FilterBar f={REPORT_F} t={d(0)} people={[JORDAN, SAM]} saved={[{ id: 's1', name: 'Sam’s food', filter: FOOD_F }]} example />
          <ReportView r={REPORT_EX} f={REPORT_F} rules={REPORT_RULES} people={[JORDAN, SAM]} t={d(0)} many={3} example />
        </Example>
        <P><b>💬 Ask in your own words</b> at the top: “how much on food this month”, “Sam’s Amazon spending last 3 months”, “top shops in September”, “compare groceries this month vs last”, “purchases over $50 last week”. Your phone reads the question with free rules and shows the report for it with a one-line answer, plus <b>Understood as</b> chips: tap one to change it, ✕ to drop it. Only if it understands nothing at all, the question (with your category names, people’s names and shop names, never your amounts) goes to the free AI, Claude last, within the daily limits, and the same question is never paid for twice. Your last 10 questions stay on this phone.</P>
        <Example caption="Made-up question, read on the phone (free).">
          <ReportAsk example />
          <ReportAnswer turn={{ q: 'How much did Sam spend on food lately?', a: '', at: '' }} answer={answerOf(FOOD_EX, FOOD_F, 'total', [JORDAN, SAM])} chips={filterChips(FOOD_F, [JORDAN, SAM], d(0))} />
        </Example>
        <P><b>⭐ Save this report</b> keeps the filters under a name, as a chip you tap next time (and a line in ☰ Menu under Reports); saved reports are the same on all your devices (“This month” always means the current one).</P>
      </Fold>

      <Fold icon="📜" title="Money log">
        <P><b>Money → Log</b> is a short diary of your money, newest first, each line with its date and time: where a purchase came from and the category it counts in, a receipt attached (how many items, whether the total matches), a category you changed, a purchase edited or deleted, a bill added by itself or undone.</P>
        <P>Search it, or show only <b>Purchases</b>, <b>Receipts</b>, <b>Bills</b> or <b>Changes</b>. Tap a line to open that purchase or bill (if it’s still there). The first time you open it, this month’s purchases already there are written in. Lines are kept for 180 days.</P>
        <Example caption="Made-up log lines.">
          <div className="space-y-2">
            <KindChips label="Show" options={[{ id: 'all', label: 'All', n: 6 }, { id: 'purchase', label: '💳 Purchases', n: 1 }, { id: 'receipt', label: '🧾 Receipts', n: 2 }, { id: 'bill', label: '📋 Bills', n: 1 }, { id: 'change', label: '✎ Changes', n: 2 }]} value="all" onChange={() => undefined} />
            <LogLines rows={LOG_EX} example whoOf={(x) => (x.id === 'l2' || x.id === 'l3' ? JORDAN : null)} />
          </div>
        </Example>
      </Fold>

      <Fold icon="🧾" title="Returns and warranties">
        <P>Every hour LifeTracker looks for <b>order confirmations</b> in Gmail (a free check first, then the AI reads only real orders). Returns is only for “can I still return it?”: the money is counted once, in Spending (receipts go there). It saves the shop, what you bought, the price, the <b>last day to return it</b> (from the email, or the store’s usual window like Best Buy 15 days, Amazon 30, Target 90) and any warranty.</P>
        <P>In <b>Money → Returns</b>: tap <b>Returning it</b> or <b>Keeping it</b>. You get a heads-up 3 days before a return window closes and a month before a warranty ends. Add any purchase by hand with ＋ Add.</P>
        <Example caption="Made-up purchases: one return window closing in 2 days, one still open.">
          <div className="space-y-2">{BUYS.map((p) => <PurchaseRow key={p.id} p={p} />)}</div>
        </Example>
      </Fold>

      <Fold icon="📆" title="Appointments (emails and texts)">
        <P>When you book something (doctor, dentist, car service, haircut, a table at a restaurant), the confirmation email or text is enough: LifeTracker finds it and <b>puts it straight into your Google Calendar</b> (the LifeTracker calendar), at the right time, with the place and reminders (1 day and 2 hours before; change it in Settings → Appointments). You get a heads-up saying what was added.</P>
        <P><b>Emails</b> are checked every hour (or as often as you pick in 📬 Email checks). <b>Texts</b> work in the LifeTracker <b>Android app</b>: turn on “Read appointment texts” in Settings → Appointments and allow SMS. It also looks at your last 30 days of texts once. Your phone does a free check first, so other texts never leave it, and texts aren’t kept. Chat messages between Google Messages users (RCS) can’t be read; normal texts from businesses can.</P>
        <P>Moved to another day? The calendar moves too. Cancelled? It’s taken off. The same appointment in an email and a text counts once. Something wrong? Tap it on Home → <b>Remove it</b>.</P>
        <Example caption="Made-up appointments on Home, and the heads-up when one is added.">
          <div className="space-y-2">
            <ApptCard appts={APPTS} />
            <AlertList alerts={APPT_ALERT} />
          </div>
        </Example>
      </Fold>

      <Fold icon="📇" title="Contacts (your dentist, garage, insurer…)">
        <P><b>Places → 📇 Contacts</b> keeps the places you deal with: name, kind (dentist, doctor, car, home repairs, hair & beauty, pet, school, bank, insurance, utilities, government, restaurant, shop), the person if there is one, phone, website, address, email and a short line on what they are to you. Tap the phone button to call, or open a card for the website, the map and the email.</P>
        <P><b>They come by themselves</b> (your choice: straight in, no OK needed): from your <b>appointments</b> (who and where), your <b>bills</b> (insurance, bank, car, health, utilities: not streaming) and the shops in Returns, and every morning from <b>Gmail</b>: the sender, and the phone number, website and street address in the email’s signature, read with free rules. Newsletters, private emails from friends, big online services and “no-reply” emails without real details are skipped. Only when the free rules can’t tell who sent an email does the AI look (free AIs first, a few a day at most, and never twice for the same sender). <b>Look in my emails now</b> runs it at once.</P>
        <P><b>No doubles</b>: the same place found in an appointment, a bill and an email (or typed by you) is one card. Cards are matched by phone number (“(555) 010-0100” = “555.010.0100”), website, email address, or a name that means the same (“The Example Dental Office LLC” = “Example Dental”); new details are added to the card, never twice. Two branches with different phones and streets stay two cards. Two cards that are really one? Open one → <b>⇄ Same as…</b>.</P>
        <P>Add one with <b>＋ Add</b> here, or the round ＋ in the tab bar → A contact.</P>
        <P><b>Your edits win</b>: what you type (＋ Add or ✎ Edit) is never changed by the automatic finds; they can only fill in what’s missing. Not a contact? Open it → <b>✕ Not a contact</b>: it goes away for good and won’t come back from your emails (Settings → Contacts can show it again). ★ Favourites stay at the top.</P>
        <P><b>Search</b> finds anything as you type: a name, the person, a kind (“dentist”), a few digits of the phone (“555 0100”), the website, a street, an email or words in the notes. The chips show one kind (more chips than fit? slide the row sideways); <b>A–Z</b> groups by kind, <b>Recent</b> shows the newest first. An appointment on Home shows its contact card with a Call button.</P>
        <Example caption="Made-up contacts: kind chips, a favourite at the top, then by kind.">
          <div className="space-y-2">
            <KindChips options={kindOptions(CONTACTS)} value="all" onChange={() => undefined} />
            {arrange(CONTACTS, { q: '', kind: 'all', sort: 'name' }).slice(0, 3).map((g) => <ContactGroup key={g.title} title={g.title} list={g.list} />)}
          </div>
        </Example>
        <Example caption="Made-up search: a few digits of the phone find the card.">
          <div className="space-y-2">
            <SearchBox q="555 0100" onChange={() => undefined} />
            {arrange(CONTACTS, { q: '555 0100', kind: 'all', sort: 'name' }).map((g) => <ContactGroup key={g.title} title={g.title} list={g.list} />)}
          </div>
        </Example>
        <Example caption="Made-up card: call, website, map and email in one tap; where it came from.">
          <div className="card"><ContactDetails c={CONTACTS[0]} /></div>
        </Example>
      </Fold>

      <Fold icon="📍" title="Nearby (places, things to do, this weekend)">
        <P>Your <b>zip code</b> (Settings → Nearby; 45245 until you change it) tells LifeTracker where home is. Distances are straight-line miles from the middle of that zip; the drive time is a real road route when the free route service answers, otherwise a guess marked <b>“about”</b>.</P>
        <P><b>Places → 🔎 Nearby → 🔎 Find</b>: type what you need (“dentist”, “oil change”, “pizza”) or tap a quick word (slide the row of words sideways for more). Opening Nearby never searches by itself: nothing is looked up until you tap a word, tap Find or pick a group in Things to do. The closest places come first, each with its address, phone and website when known, the miles and the drive time. Tap <b>＋ Contacts</b> to keep one (if it’s already there, the details are just added); it lights up as <b>✓ In Contacts</b>. Tap it again to take it back out (only a contact added from that place; one you already had, or one found in your emails, stays), with <b>↶ Undo</b> for a few seconds. The free map (OpenStreetMap) is asked first; only when it has little does the free Gemini search Google (if Gemini is used up, Claude searches the web instead: paid, a few cents, within its daily limit), and a place is kept only if its page really came back from that search.</P>
        <P><b>Results come in steps</b>, so you don’t wait for everything: the places from the free map show first with a guessed drive time (“about”, a bit faded); a moment later the real road times fill in on the same rows. Only when the map has little (and always for events) a <b>🌐 Searching the web…</b> row shimmers underneath and turns into the places found on the web, or a short note if it found nothing more. You can tap ＋ Contacts or ＋ My list on any of them right away. Starting a new search drops the old one.</P>
        <P><b>🎉 Things to do</b>: tap <b>Food</b>, <b>Fun</b>, <b>Events</b> or <b>Trips</b>: restaurants, fun places (parks, museums, bowling…), events (looked up on the web, always with a link to where they were found) and day trips farther away. Every search is remembered for a while, so asking again costs nothing.</P>
        <P><b>This weekend</b>: every Friday morning you get a short list of ideas close by and a bit farther, each with miles and drive time: a card on Home (Friday to Sunday), a heads-up and the morning email. Turn it off in Settings → Nearby. The <b>💬 Ask</b> bar knows your zip too: “find me a dentist” answers with your contacts and the closest ones.</P>
        <Example caption="Made-up search for “dentist”: closest first, with miles and drive time.">
          <SpotList title="“dentist” closest first" spots={SPOTS} contacts={[]} onAdd={() => undefined} />
          <Credit by={['OpenStreetMap']} />
        </Example>
        <Example caption="Made-up search a second after tapping Find: the map’s places are in (drive times still “about”), and the web is still looking.">
          <SpotList title="“tire shop” closest first" spots={SPOTS.slice(0, 1)} pending />
          <WebLoading />
        </Example>
        <Example caption="🎉 Things to do when you open it: nothing looked up yet, waiting for a tap.">
          <TodoButtons value={null} onPick={() => undefined} />
        </Example>
        <Example caption="Made-up “This weekend” card on Home (Friday to Sunday).">
          <WeekendCard w={WEEKEND_EX} onAll={() => undefined} />
        </Example>
        <Example caption="The rest of the week, Home shows the way in to Nearby.">
          <NearbyLink zip="45245" onGo={() => undefined} toDo={3} onList={() => undefined} />
        </Example>
        <P><b>📌 My list</b>: tap <b>＋ My list</b> on anything in Find, Things to do or the weekend list to keep it for later (it lights up as <b>✓ On my list</b>, so it’s never saved twice; tap it again to take it off My list, with <b>↶ Undo</b> that puts it back with its note and stars). <b>Places → 📌 My list</b> shows them all with the miles and drive time from when you saved them. Search by name, street, kind or a word from your note; show <b>To do</b>, <b>✓ Done</b> or <b>All</b>; sort by closest, newest or planned day. Tap a place to change its name, note, planned day, address, phone or website, or to delete it (it asks first).</P>
        <P>Went there? Tap <b>✓ Been there</b>: a <b>BEEN THERE ✓</b> stamp lands on the card with the day you went, and you can give it 1 to 5 stars (or skip). Tapped it by mistake? Tap the lit <b>✓ Been there</b> again: it goes back to “to do”, the stamp and stars come off (↶ Undo puts them back). You can also open it and tap <b>↩ Not done yet</b>. Home shows how many are still to do, and 💬 Ask knows the names on your list.</P>
        <Example caption="Made-up My list: one planned for tomorrow, one already done (with its stamp and 5 stars).">
          {LIST_EX.map((p) => <PlaceCard key={p.id} p={p} fresh={p.done} onOpen={() => undefined} onDone={() => undefined} onRate={() => undefined} />)}
        </Example>
      </Fold>

      <Fold icon="📁" title="Vault (your documents)">
        <P><b>Me → 📁 Vault</b> keeps your important papers in one safe place: your pet’s vaccines and vet records (like Daizy 🐶), medical papers, IDs and passports, the house (deed, lease, warranties, manuals), the car (registration, title, insurance card), school, taxes, contracts, certificates… Bills and receipts are not kept here: they belong in <b>Money</b>.</P>
        <P><b>📷 Scan</b>: take a photo of the page with the camera, or pick several photos or a PDF at once (several pages become <b>one PDF</b>, made on your phone). That’s all: it’s <b>read and saved by itself</b> straight away. The AI reads it once and fills in the title, the folder, who it’s for, the date on it, and when it expires or is <b>due again</b> (like Daizy’s next rabies shot), then its card opens. Something wrong, or a page to add? Tap <b>✎ Edit</b>. A receipt goes to Money → Spending instead, and a file you already have isn’t saved twice (the one you have opens). It uses the free AIs first, Claude only if they can’t, and the same file is never read (or paid for) twice; if no AI can read it just then, it’s saved anyway for you to fill in. Only the last 4 characters of any number are kept.</P>
        <Example caption="Made-up scan of two pages, being read: it saves by itself, then the document opens.">
          <ReadingCard pages={2} />
        </Example>
        <P><b>Find anything</b>: the search looks in the title, who it’s for, the folder, tags, your notes and the words read from the document (“rabies”, “Daizy”, “W-2”). The chips show one folder, or one person or pet. A date coming up shows on the right (amber when it’s close); you get a heads-up before it (30 and 7 days for something due again, 90, 30 and 7 for something that expires), it’s on Home’s timeline, and it goes in your LifeTracker calendar (you can turn either off per document).</P>
        <Example caption="Made-up Vault: folders, people and pets, Daizy’s vaccines on top.">
          <div className="space-y-2">
            <KindChips options={vaultChips(VAULT, VS).folders} value="all" onChange={() => undefined} label="Folder" />
            <KindChips options={vaultChips(VAULT, VS).people} value="all" onChange={() => undefined} label="For whom" />
            {arrangeVault(VAULT, { q: '', folder: 'all', who: 'all' }).slice(0, 3).map((g) => <VaultGroup key={g.title} title={g.title} list={g.list} s={VS} />)}
          </div>
        </Example>
        <Example caption="Made-up search: “daizy” finds both of her records.">
          <div className="space-y-2">
            <SearchBox q="daizy" onChange={() => undefined} placeholder="Title, Daizy, vaccine, tag…" label="Search documents" />
            {arrangeVault(VAULT, { q: 'daizy', folder: 'all', who: 'all' }).map((g) => <VaultGroup key={g.title} title={g.title} list={g.list} s={VS} />)}
          </div>
        </Example>
        <P>Tap a document to see it: <b>👁 Open</b> shows the pages full screen (tap a page to zoom in, then move around; a PDF opens in your phone’s viewer), <b>⬇ Save</b> downloads it, <b>↗ Share</b> sends it (to the vet, a school…), <b>✎ Edit</b> and <b>🗑 Delete</b> (the files go too).</P>
        <Example caption="Made-up document card, found in an email.">
          <div className="card"><VaultDetails p={VAULT[0]} s={VS} example onEdit={() => undefined} onDelete={() => undefined} /></div>
        </Example>
        <P><b>From your emails</b> (Gmail, read-only): every hour, files attached to your emails are looked at. A free check first (the file name, the subject, the words): vaccine and vet records, medical results, certificates, insurance policies, contracts, leases, tax forms, registrations, tickets and permits are <b>saved straight into the Vault</b> (your choice), with <b>“From email: subject — sender, date”</b> in the note and a heads-up. <b>Receipts, invoices and bills go to Money instead</b>: a bill goes straight into <b>Money → Bills</b> (like one you upload), and a receipt from a business goes to <b>Money → Spending</b>, written out with its picture (it also shows in Returns only when the store has a return window). A receipt you scan in the Vault goes to Spending by itself. Newsletters, ads and logos are skipped. Only files the free check can’t place go to the AI (free ones first, 6 a run by default), and the same file is never saved twice. <b>✉️ Look in my emails now</b> (in the Vault) runs it at once; turn it off in Settings → Vault.</P>
        <Example caption="Made-up heads-up when a document is found in an email."><AlertList alerts={VAULT_ALERT} /></Example>
        <P><b>People & pets</b> (Settings → Vault): the names documents can be for, each with an icon (pets get a paw, or 🐶, 🐱…). The AI picks one of them when it reads a document.</P>
        <Example caption="Made-up list: you, Daizy the dog and Sam."><PeopleEditor people={VS.vault.people} onChange={() => undefined} /></Example>
        <P><b>🔒 Lock</b> (optional, Settings → Vault): a 4–6 digit PIN asked when you open the Vault. It locks again after a few minutes (you choose) and every time you leave the app. In the Android app you can also use your fingerprint or face. To be honest about it: the lock is a <b>privacy screen</b> for when someone else holds your phone. Your documents are always protected by your sign-in (nobody else can open them), and only a scrambled copy of the PIN is kept. Forgot it? Tap <b>Forgot your PIN?</b>: you’re signed out, and after signing in again with your email you choose a new one. Turning the lock off or changing the PIN asks for the PIN.</P>
        <Example caption="Made-up lock screen."><LockScreen len={4} onPin={() => undefined} onForgot={() => undefined} /></Example>
        <P><b>Safe and private</b>: the files are in your own private storage. They’re opened with links that work for 2 minutes only, never public. Ask LifeTracker can see your documents’ titles and dates (to answer “when is Daizy’s next shot?”), never what’s inside them.</P>
      </Fold>

      <Fold icon="💬" title="Get a lower price on a bill">
        <P>Internet, phone, TV, insurance, utilities and subscriptions often lower the price if you ask. Open the bill (Money → Bills) and tap <b>💬 Get a lower price</b>. The AI writes a short script in plain words to read on the phone or in their chat: what to say first, the ask, and what to say if they say no. It uses the bill’s name, its price, how long you’ve had it and any price rises. It never makes up other companies’ prices: it tells you to look them up yourself before you call.</P>
        <P>Turn on <b>I’m OK to switch company</b> only if you really would: then the script also says, calmly, that you’re looking at other companies. Afterwards write how it went and the new price, and tap <b>Save</b>: only then does the bill change (the new price shows in its price changes).</P>
        <P>It is 1 AI read (free AIs first, Claude only if they can’t). The script is kept for that price, so opening it again costs nothing; tap ↻ New script for another one.</P>
        <Example caption="Made-up script for an internet bill, with “OK to switch” on.">
          <ScriptView s={SCRIPT} by="Gemini Flash (free)" />
        </Example>
      </Fold>

      <Fold icon="📱" title="My apps (all your apps on one page)">
        <P>Tap <b>📱 My apps</b> in ☰ Menu (or at the bottom of Me, or the My apps square in Me → Settings) to open a page with all your apps: Trend Videos, Trading, Scam Check, CalorieTracker, LifeTracker and CarLoaner. Each card shows a few words on how it’s doing, an <b>Open</b> button, and what its <b>paid AI</b> cost today, in the last 7 days and this month. The card at the top adds them all up.</P>
        <P>The first time, tap <b>🔑 Codes</b> and type each app’s access code (the one you already open it with), and CarLoaner’s address. They stay <b>only in that browser</b> and each code goes only to its own app. LifeTracker uses your sign-in. “Code needed” means a code is missing or wrong; “Couldn’t reach it” means the app didn’t answer. Tap ↻ for fresh numbers.</P>
        <P>Free AIs count as $0. “About” means an estimate: the app counts its AI calls and uses a rough price per call.</P>
        <Example caption="Made-up My apps page: the total, two apps that answered, one without its code and one that didn’t answer.">
          <TotalCard results={APP_EX} total={5} />
          <AppCard app={APPS[0]} url="https://example.com/lifetracker" st={{ s: 'ok', data: APP_EX[0] }} />
          <AppCard app={APPS[2]} url="https://example.com/trading" st={{ s: 'ok', data: APP_EX[1] }} />
          <AppCard app={APPS[3]} url="https://example.com/scam-check" st={{ s: 'code', wrong: false }} />
          <AppCard app={APPS[1]} url="https://example.com/videos" st={{ s: 'offline', why: 'Couldn’t reach it.' }} />
        </Example>
      </Fold>

      <Fold icon="🎂" title="Important dates and car care">
        <P>In <b>Me → 🛡️ Privacy → Important dates</b>: birthdays, anniversaries, oil changes, tire rotations, dentist and check-ups, the HVAC filter… Pick a starter (one tap) or type your own, the next date, how often it repeats and when to remind you. After each date it moves to the next one by itself.</P>
        <P>You get a heads-up before each one, it’s on Home’s timeline, and it goes in your LifeTracker Google Calendar (repeating).</P>
        <Example caption="Made-up dates."><div>{DATES.map((x) => <DateRow key={x.id} d={x} />)}</div></Example>
      </Fold>

      <Fold icon="📋" title="Your bills">
        <P>Tap <b>＋ Add</b> in <b>Money → Bills</b>, pick a kind (subscription, insurance…), type the amount and how often, and the next payment date. The date moves forward by itself after each payment. <b>Autopay off</b> means you get a heads-up to pay it.</P>
        <P>Marking one <b>✂️ cancelled</b> keeps it in your history and shows how much you save a year.</P>
        <P><b>Added by themselves</b>: when your bank shows the same company charging about the same amount at a steady rhythm (every week, month, quarter or year), or an email or a document is a bill, it goes <b>straight into your bills</b> (no OK needed), with a heads-up like “Added: Example Gym $39.00 monthly — from your bank”. New ones sit at the top of Money → Bills for 2 weeks with a <b>✨ new</b> mark. Not a bill, or not yours? Tap <b>↶ Undo</b>: it’s taken away and <b>won’t come back</b>. Already have it? Then it isn’t added twice: your bill gets the new date, amount or renewal instead (a price change gets a heads-up).</P>
        <Example caption="Made-up bill found in a bank account and added by itself, with its Undo, and the same bill in the list.">
          <div className="card !px-3 !py-2"><p className="label px-1 pb-0.5 pt-1.5">🆕 Added by itself · 1</p><ul><AddedRow e={FEED[0]} onUndo={() => undefined} /></ul></div>
          <div><ItemRow i={NEW_BILL} fresh /></div>
        </Example>
        <Example caption="Made-up bills: the monthly total, a price rise (↑ price) and a free trial.">
          <Totals items={EX} />
          <div>{EX.slice(0, 4).map((i) => <ItemRow key={i.id} i={i} />)}</div>
        </Example>
      </Fold>

      <Fold icon="🆕" title="What was added (Inbox)">
        <P><b>Inbox</b> is the 🔔 bell at the top of the screen. Nothing waits there for your OK any more: it shows <b>what LifeTracker added by itself</b> in the last 30 days, newest first: bills (from your bank, bill emails or documents), receipts from emails, documents from emails, contacts and appointments. The number on the bell is how many are new since you last looked. At the bottom of Home, <b>What was added</b> is one quiet line (“🔔 7 things added this week · View”); open it for the newest 3.</P>
        <P>Tap one to see it where it went. Wrong? Tap <b>↶ Undo</b>: a bill is removed, a receipt taken off Spending (a bank purchase stays, without the receipt), a document deleted, a contact hidden, an appointment taken off your calendar, and <b>it won’t be added again</b>. Below the list: add a bill or document by hand (read at once), and import a bank CSV.</P>
        <Example caption="Made-up Inbox: what was added today, this week and earlier, each with Undo.">
          <AddedList list={FEED} onUndo={() => undefined} />
        </Example>
      </Fold>

      <Fold icon="🔔" title="Heads-ups">
        <P>At the bottom of Home (and in your email, as you choose in ✉️ Emails to me): a price went up, a free trial ends in 3 days, a renewal or contract end is coming (30 days before by default), a bill not on autopay is due, or a bill was <b>added by itself</b> (with Undo in the 🔔 Inbox).</P>
        <Example caption="Made-up heads-ups."><AlertList alerts={ALERTS} /></Example>
      </Fold>

      <Fold icon="✉️" title="Emails to me">
        <P>You choose how many emails LifeTracker sends you, in <b>Settings → ✉️ Emails to me</b>. Everything still shows in the app (Home and the 🔔 bell); this only limits emails.</P>
        <P><b>Automatic emails</b> on or off. <b>How often, at most</b>: <b>One summary a day</b> (the usual: everything new in one email in the morning; nothing new = no email), <b>One a week</b> (on your My week day), <b>Only important</b> (a bill due that isn’t on autopay, a price going up, a security alert; sent when found, still at most one a day) or <b>Never</b>.</P>
        <P>Then tick what may be in it: what was added, bills due, price changes, weekend ideas, the weekly summary, security alerts. “What was added” starts off. Things you already saw in the app aren’t emailed again.</P>
        <Example caption="Made-up choices: one summary a day, without “What was added”.">
          <div className="card"><EmailControls s={{ on: true, often: 'daily', kinds: { added: false, due: true, price: true, weekend: true, week: true, security: true } }} weekDay="Sunday" to="jordan@example.com" last={{ lastSent: ago(20), lastSubject: 'LifeTracker: today, 3 things' }} /></div>
        </Example>
      </Fold>

      <Fold icon="👥" title="Whose email it came from">
        <P>With more than one Gmail connected, everything found in an email shows <b>whose mailbox</b> it came from: a small dot with a name, like <PersonChip p={SAM} /> or <PersonChip p={JORDAN} />. Each person’s entries also get a soft coloured edge on the left in their colour (for example blue for one, pink for the other), so you can tell them apart at a glance. It’s on <b>everything</b> found in an email: Home’s Coming up, heads-ups, bills (even old ones), purchases and receipts, the Log, What was added, appointments, contacts, Vault documents, returns, search results and Ask’s Open button; the details of a bill or appointment say “Found in Sam’s email”. Only the name shows, never the address (a heads-up says “from Sam’s email”), and the daily email to you starts those lines with “Sam:”. Things you typed in yourself or got from a bank file have no name.</P>
        <P>Pick the name and colour for each mailbox in <b>Settings → Google</b> (saved on the server, the same on every device). In Spending and the Log, <b>Person</b> shows only one person’s entries.</P>
        <Example caption="Made-up Coming up and heads-up: the car service was found in Sam’s email.">
          <div className="space-y-2">
            <TimelineList moments={timeline({ items: [], papers: [], dates: [], purchases: [], appts: APPTS.filter((a) => a.source === 'email') }, 30)} max={2} />
            <AlertList alerts={[{ id: 'pa1', kind: 'found', key: '', title: 'Added: Example Insurance $89.00 monthly — from Sam’s email', body: null, item_id: null, seen: false, created_at: '', mailbox: 'sam@example.com' }]} />
          </div>
        </Example>
        <Example caption="Made-up purchases: gas from Sam’s bank alert email, a cafe receipt from Jordan’s email.">
          <div className="space-y-2">
            <PersonFilter value="all" onChange={() => undefined} />
            <div className="card !px-3 !py-1"><ul><SpendLine t={GAS_TX} rules={RULES} example /><SpendLine t={RECEIPTS[0]} rules={RULES} example /></ul></div>
          </div>
        </Example>
      </Fold>

      <Fold icon="🏦" title="Your bank (free, by email)">
        <P>LifeTracker reads your bank the free way: your banks <b>email you each purchase</b>, and every hour LifeTracker finds those alert emails in your Gmail and reads the amount, the shop and the date. No bank password, no bank login, nothing paid, and no AI (free patterns). It only reads: nothing can be paid or moved.</P>
        <P>Once per bank: in its app, turn on <b>purchase / transaction alerts by email</b> for every card, for any amount ($0.01). Settings → Bank & cards shows the steps for Bank of America, SoFi and Capital One. Gmail must be connected (Settings → Google).</P>
        <P><b>Auto Pay notices</b> (“Your Auto Pay payment will be processed soon”, like GEICO’s) are read for free too: the company, the amount and the payment day go straight into Bills, marked as on Auto Pay, so you’re not told to pay it yourself.</P>
        <P><b>PayPal</b> works too, with nothing to turn on: its “You paid $19.99 USD to Netflix.com” receipts are read the same way, so a monthly PayPal charge (like Netflix) shows up in Spending and, after two months in a row, as a bill.</P>
        <P>Deposits, payments to your card and statements are skipped. The purchases go into the same bill finder: the same company charging about the same amount every month (or year) is <b>added to your bills by itself</b> (Undo in the 🔔 Inbox), and price rises are flagged. The first time it also looks back over your old alert emails (300 at a time, so a big inbox takes a few mornings or taps on Read now: Gmail only allows so many reads a minute).</P>
        <Example caption="Made-up example of Settings → Bank & cards.">
          <AlertBanks gmail read={128} banks={['Bank of America', 'Capital One']} />
        </Example>
        <P>No alerts yet? Download your transactions as a <b>CSV</b> from your bank and use <b>Import a bank CSV</b> in Inbox (the 🔔 bell at the top). A paid direct bank link (SimpleFIN) is also in Settings.</P>
      </Fold>

      <Fold icon="📊" title="My week">
        <P>A short summary on Home (and inside your email on the day you pick in Settings → My week, if “Weekly summary” is on in ✉️ Emails to me): money spent this week against a usual week, bills in the next 7 days, anything new about you online, mailing lists removed, documents expiring soon and your credit freeze.</P>
        <Example caption="Made-up example of My week.">
          <WeekCard lines={[
            { icon: '💸', text: 'Spent $412.30 this week (a usual week: $385.00). Most at Example Market $96.10, Example Gas $52.00.' },
            { icon: '📋', text: '2 bills in the next 7 days: $28.98 (Example Streaming, Example Music App).' },
            { icon: '📭', text: 'Unsubscribed from 3 mailing lists (some automatically): Example Travel, Example Shoes, Example Deals.', tone: 'good' },
            { icon: '🛂', text: 'Passport expires in 52 days.', tone: 'warn' },
          ]} />
        </Example>
      </Fold>

      <Fold icon="🕵️" title="Your name online">
        <P>Fill in <b>About me</b> (at the top of Me → Privacy, or in Settings): your name (and other spellings), your city, emails, phone numbers and usernames. Type each one (＋ adds another), then tap <b>Save</b>: a pop-up confirms what was saved, with a button to look for you right away. “Not saved yet” means you still need to tap Save. Every 7 days (you can change it) the free Gemini searches Google for them and sorts each page: your own profile, news, a people-search site, or <b>worrying</b> (a fake profile using your name, a scam, leaked documents or passwords, harassment).</P>
        <P>Only pages that really came back from the search are kept, so nothing is made up. New ones show in <b>Me → Privacy</b>; worrying ones also as a heads-up. Tap <b>It’s fine</b> or <b>Not me</b> to clear them. For a worrying page: report it to the site, and ask Google to hide it with “Results about you”.</P>
        <Example caption="Made-up About me (Save does nothing here).">
          <AboutMe me={{ names: ['Jordan Example'], places: ['Example City'], emails: ['jordan@example.com'], phones: [], usernames: ['jordan_ex'] }} example />
        </Example>
        <Example caption="Made-up examples: your own page, and a worrying one.">
          <div className="space-y-2">{WEB.map((f) => <FindingRow key={f.id} f={f} />)}</div>
        </Example>
      </Fold>

      <Fold icon="🧹" title="People-search sites">
        <P>Sites like Spokeo, Whitepages and Radaris sell your address, phone and relatives. LifeTracker keeps a checklist of the 22 biggest ones; the name search marks the ones that list you. Tap a site for its free removal page and the steps, then tap <b>Removal sent</b>. They often add you back, so you get a reminder to look again after 3 months.</P>
        <P>Removal can’t be done automatically: each site wants its own form, a captcha and an email confirmation (that’s what paid services charge for).</P>
        <Example caption="Made-up checklist: one site lists you, one removal sent, one removed.">
          <BrokerList rows={BROKER_ROWS} />
        </Example>
      </Fold>

      <Fold icon="🔓" title="Data breaches and passwords">
        <P>Sign up once (free) at <b>haveibeenpwned.com/NotifyMe</b> with each of your emails, or at Mozilla Monitor. When a site that has your email is hacked, they email you; LifeTracker reads that email in Gmail and tells you which password to change. No AI, nothing paid.</P>
        <P><b>Is a password leaked?</b> Type it in Me → Privacy: it never leaves your phone (only the first 5 characters of a scrambled code are sent), and it isn’t saved.</P>
        <Example caption="Made-up breach."><BreachList rows={BREACH} /></Example>
      </Fold>

      <Fold icon="📭" title="Mailing lists (unsubscribe)">
        <P>From Gmail, LifeTracker counts who sends you newsletters and ads, how many, and when you last opened one. It reads only the <b>headers</b> (sender, subject, opened or not), never what’s inside.</P>
        <P><b>Unsubscribe</b> uses the official unsubscribe that real newsletters must include (the same one as Gmail’s Unsubscribe button). Most go with one tap, quietly, without opening any page. Some need an email (LifeTracker sends it from your Gmail) or a click on their page (it opens for you).</P>
        <P><b>Automatic</b> (Settings → Mailing lists): unsubscribes by itself from lists you haven’t opened in 60 days (you choose), listed in your morning email. Never from <b>Spam</b> (that would tell spammers your address works): <b>Block</b> those instead, so their emails go out of your inbox under the label “LifeTracker/Blocked”. Nothing is ever deleted. Tap <b>Keep</b> on any list you want to stay on.</P>
        <Example caption="Made-up mailing lists: never opened, opened often, unsubscribed automatically, and spam.">
          <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.06]">{SENDERS.map((x) => <SenderRow key={x.id} x={x} days={60} />)}</ul>
        </Example>
      </Fold>

      <Fold icon="🪪" title="Documents that expire">
        <P>Your passport, driver’s licence, ID, car registration or inspection, insurance card, Global Entry, visa… are kept in the <b>📁 Vault</b> (scan them there; the AI fills in the kind, name and expiry date). They show in the Vault with their date (the soonest first in each folder) and on Home’s timeline. Only the last 4 characters of the number are kept.</P>
        <P>You get heads-ups 90, 30 and 7 days before, and on the day. With Google Calendar connected, a “Start renewing” day is added 90 days before (passports take weeks) and the expiry day itself.</P>
        <Example caption="Made-up documents."><div className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.06]">{PAPERS.map((p) => <PaperRow key={p.id} p={p} />)}</div></Example>
      </Fold>

      <Fold icon="🔒" title="Credit freeze and reports">
        <P>A <b>credit freeze</b> at the three credit bureaus is free, takes about 5 minutes each, and stops anyone from opening a loan or card in your name (the best protection against identity theft). You can lift it for a day when you apply for credit yourself. Me → Privacy → Credit has the three freeze pages; mark each one done.</P>
        <P>Every 4 months you get a reminder to look at your free credit reports at annualcreditreport.com for accounts you don’t know.</P>
        <Example caption="Made-up example: two of three frozen.">
          <CreditCard c={{ equifax: 'frozen', experian: 'frozen', transunion: 'not', lastReport: d(-40), reportMonths: 4 }} />
        </Example>
      </Fold>

      <Fold icon="📅" title="Google Calendar">
        <P>Settings → <b>Connect Google Calendar</b>. LifeTracker makes its own <b>LifeTracker</b> calendar (it can’t see or change your other calendars) with each bill’s due date (repeating), renewals and trial ends, with a phone reminder a couple of days before, plus your appointments at their time. It updates itself every morning when your bills change, and within the hour for a new appointment.</P>
      </Fold>

      <Fold icon="📬" title="Email checks (how often)">
        <P>Your Gmail is read by itself <b>every hour</b> unless you change it: Settings → <b>📬 Email checks</b>. Pick <b>15m, 30m, 1h, 2h or 4h</b> (minutes or hours), or <b>Off</b> (only in the morning run). Checks always happen on the quarter hour: :00, :15, :30, :45. Each check reads only emails it hasn’t seen yet (bank alerts, PayPal, Auto Pay, bills, receipts, orders, documents, appointments, in every Google account you added). Gmail allows far more than this, and the AI daily limits stay the same, so checking more often doesn’t cost more.</P>
        <P>Once Gmail is connected, a small line at the top of <b>every tab</b> shows how often, the last check and what it found, and the next one, in your own time. Tap it to change the setting. ✓ = all fine, ⏸ = Gmail asked to slow down (the rest comes next check), ⚠ = a problem.</P>
        <Example caption="Made-up example: the line at the top (a normal check, a paused one, and Off) and the picker. Try the picker: it only changes this example.">
          <MailCheckDemo />
        </Example>
      </Fold>

      <Fold icon="✉️" title="Gmail receipts and forwarding">
        <P>Tick <b>Also read Gmail receipts</b>: at every email check (every hour unless you change it) it looks for receipt, invoice, renewal and “free trial” emails (read-only). A free check first skips ads and shipping notices; only emails that look like bills are read by the AI, and a bill goes <b>straight into your bills</b> (or updates the one you have).</P>
        <P>To add a bill from any email, <b>forward it to yourself with “+lifetracker”</b> (for example you+lifetracker@gmail.com, shown in Settings): it is picked up the next morning.</P>
        <P><b>More than one email address?</b> Settings → Google → <b>＋ Add another Google account</b>. Google asks which account; pick the other one and allow reading Gmail. That mailbox is then read just like your main one, every hour: bank alerts, PayPal receipts, Auto Pay notices, bills, receipts, orders, appointments, documents, contacts, data breaches and mailing lists. Its appointments go into your main LifeTracker calendar. Anything found there says where it came from, like “From email (work@…)”, and a bank alert that reaches both mailboxes is counted once.</P>
        <P>Each extra account has its own <b>switch</b> (off = not read, nothing deleted), its last look, and <b>Disconnect</b> (it asks first; what was already found stays). The same address can’t be added twice. Managing mailing lists there (archive and label) is a separate “yes” for that account.</P>
        <Example caption="Made-up example of Settings → Google with two extra accounts (one switched off).">
          <GoogleAccounts main={{ email: 'jordan@example.com', gmail: true, calendar: true, lastScan: hoursAgo(0.3) }} extras={GMAIL_EXTRAS} canAdd />
        </Example>
      </Fold>

      <Fold icon="📄" title="Documents (bills, policies, statements)">
        <P>In Inbox (the 🔔 bell at the top), <b>Add a bill or document</b>: a photo or PDF of a bill, an insurance policy, a mortgage statement or a renewal letter. It is kept privately (only you can open it), and it’s <b>read at once</b>: the amount, dates, policy number, coverage and anything to watch out for. A bill goes <b>straight into your bills</b> (or updates the one you have), with Undo in the Inbox. Bill files found attached to your emails show up here too, marked ✉️ with the email they came from. A paper that turns out not to be a bill (a contract, a certificate) can go to your Vault with <b>📁 Move to Vault</b>.</P>
        <Example caption="Made-up example of a read document."><DocRow d={DOC} /></Example>
      </Fold>

      <Fold icon="🏠" title="Mortgage and loans">
        <P>Add your mortgage as a bill of kind <b>Mortgage</b> and fill in the balance, the interest rate and the part of the payment that is escrow (taxes and insurance). LifeTracker shows when it will be paid off, the interest left, and what paying a little extra each month saves.</P>
        <Example caption="Made-up mortgage: $280,000 at 6.25%, $1,730 a month without escrow, $200 extra.">
          <LoanCalc balance={280000} rate={6.25} payment={1730} extra={200} />
        </Example>
      </Fold>

      <Fold icon="🤖" title="The AI and what it costs">
        <P>Reading documents and emails uses an AI. The <b>free ones go first</b> (Gemini, then Groq, in the order you set in Settings → AI). <b>Claude</b> (paid, a few cents) only reads when the free ones are over their daily limit, not set up, can’t read that kind of file, or fail. Each AI has its own daily limit; finding bills in your bank uses no AI at all.</P>
      </Fold>

      <Fold icon="🔐" title="Privacy">
        <P>Your data is in your own Supabase database. Each person only ever sees their own rows (Row Level Security). The bank access link and Google sign-in are encrypted, and the app itself can’t read them: only the server uses them. You can download everything or sign out in Settings.</P>
        <P>Ask LifeTracker sends a short summary of your own data with each question to the AI, only to answer it. Order emails are read only after a free check says they’re real orders.</P>
        <P>📍 Nearby sends only your zip code’s map point and what you typed to the free map services (OpenStreetMap, the OSRM route service, zippopotam.us) and, for web searches, to the free Gemini (or Claude when Gemini is used up); never your name or anything else.</P>
        <P>About me (your name, emails, phones, city) is private too; it is sent to the free Gemini only to run the searches. Mailing lists: only email headers are read. Document photos and your Vault files stay in your own private storage, opened only with links that last 2 minutes.</P>
      </Fold>

      <Fold icon="🛠️" title="Setting it up (one time)">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li><b>Supabase</b>: the project is linked to GitHub; pushing to <code>main</code> updates the database, the server functions and the website (see README).</li>
          <li><b>Sign-in code (optional)</b>: Supabase only lets you edit its emails once you use your own email sender (Authentication → Emails → SMTP settings, e.g. Resend). Then, in the <b>Magic Link</b> email, add <code>Or type this code: {'{{ .Token }}'}</code> to sign in with a 6-digit code too.</li>
          <li><b>Sign-in</b>: Supabase → Authentication → URL configuration: Site URL = the website address. For “Continue with Google”, turn on the Google provider with the same Google client.</li>
          <li><b>Server secrets</b> (Supabase → Edge Functions → Secrets): <code>LT_SECRET_KEY</code> (long random text), <code>CRON_SECRET</code>, <code>SITE_URL</code>, <code>LT_ALLOWED_EMAILS</code> (your email: only you can use the automatic parts), <code>GEMINI_API_KEY</code> (free), optional <code>GROQ_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>GOOGLE_CLIENT_ID</code>/<code>GOOGLE_CLIENT_SECRET</code>, <code>RESEND_API_KEY</code>.</li>
          <li><b>Google Cloud</b>: enable the Calendar and Gmail APIs, make an OAuth “Web” client with the redirect <code>https://&lt;project&gt;.supabase.co/functions/v1/google-callback</code>, add yourself as a test user (and every extra Gmail address you add in Settings → Google, while the app is still in Testing), then publish the app (otherwise Google signs you out every 7 days).</li>
          <li><b>Morning run</b>: Supabase → Vault: add <code>lt_project_url</code> and <code>lt_cron_secret</code> (same as CRON_SECRET).</li>
          <li><b>Mailing lists (optional)</b>: Google Cloud → Google Auth Platform → Data Access → add the scope <code>gmail.modify</code>, then Settings → Mailing lists → Allow “Manage mailing lists”.</li>
          <li><b>iPhone / Android</b>: open the website and “Add to Home Screen”.</li>
        </ol>
      </Fold>
    </div>
    </PeopleCtx.Provider>
    </FoldTarget.Provider>
  );
}
