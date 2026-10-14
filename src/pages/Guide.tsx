import type { ReactNode } from 'react';
import { Fold, Seg, Toggle } from '../components/ui';
import { ItemRow, LoanCalc, Totals } from '../components/Items';
import { AskChat, MiniRings, MonthHero, Ring, TimelineList } from '../components/Dash';
import { PurchaseRow, SpendingView } from '../components/Spending';
import { DateRow } from '../components/Dates';
import { timeline } from '../lib/timeline';
import { spendReport } from '../../supabase/functions/_shared/spend.ts';
import { AlertList, DocRow, SuggestionCard } from '../components/Inbox';
import { AlertBanks } from '../components/Bank';
import { AboutMe } from '../components/AboutMe';
import { UpdateBanner } from '../components/AppUpdate';
import { ApptCard } from '../components/Appointments';
import { BreachList, BrokerList, CreditCard, FindingRow, PaperRow, SenderRow, WeekCard } from '../components/Me';
import type { Alert, Appointment, Doc, Finding, Item, LifeDate, Paper, Purchase, Sender, Suggestion } from '../../supabase/functions/_shared/model.ts';
import { today } from '../../supabase/functions/_shared/money.ts';

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
const SUGG: Suggestion = { id: 's1', key: 'example gym', source: 'bank', name: 'Example Gym', category: 'membership', amount: 39, currency: 'USD', cycle: 'monthly', next_due: d(6), ends_on: null, trial_ends: null, merchant: 'example gym', details: {}, evidence: { charges: [{ date: d(-54), amount: 39 }, { date: d(-24), amount: 39 }] }, status: 'new', item_id: null, created_at: '' };
const ALERTS: Alert[] = [
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
  { id: 'p1', kind: 'passport', name: 'Passport', holder: 'Me', number_end: '4821', expires: d(52), notes: null, photo: null },
  { id: 'p2', kind: 'registration', name: 'Car registration', holder: 'Example car', number_end: null, expires: d(140), notes: null, photo: null },
];

const DATES: LifeDate[] = [
  { id: 'l1', kind: 'birthday', title: 'Example Mom’s birthday', next_date: d(5), every_months: 12, remind_days: 7, notes: null },
  { id: 'l2', kind: 'car', title: 'Oil change', next_date: d(21), every_months: 6, remind_days: 7, notes: 'every 5,000 miles' },
];
const aBase = { status: 'booked' as const, minutes: null, notes: null, history: [] as Appointment['history'] };
const APPTS: Appointment[] = [
  { ...aBase, id: 'ap1', key: 'ap1', title: 'Dentist: cleaning', kind: 'dental', day: d(2), time: '15:30', place: '12 Example St', with_who: 'Example Dental', source: 'text', source_from: 'Example Dental', notes: 'Arrive 10 minutes early.' },
  { ...aBase, id: 'ap2', key: 'ap2', title: 'Car service', kind: 'car', day: d(6), time: '09:00', place: null, with_who: 'Example Garage', source: 'email', source_from: 'Example Garage' },
  { ...aBase, id: 'ap3', key: 'ap3', title: 'Dinner for 2', kind: 'food', day: d(9), time: '19:45', place: 'Example Bistro', with_who: null, source: 'email', source_from: 'Example Reservations' },
] as Appointment[];
const APPT_ALERT: Alert[] = [{ id: 'aa1', kind: 'appt', key: '', title: '📅 Added to your calendar: Dentist: cleaning · in 2 days, 3:30 PM', body: '12 Example St. Found in a text from Example Dental. Wrong? Remove it on Home.', item_id: null, seen: false, created_at: '' }];
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
const RULES = { 'example market': 'groceries', 'example gas': 'gas', 'example cafe': 'dining', 'example pharmacy': 'health' };
const REPORT = spendReport(TX, RULES, ym(0), 31);

const Example = ({ children, caption }: { children: ReactNode; caption: string }) => (
  <figure className="space-y-1.5">
    <div className="pointer-events-none select-none rounded-2xl border border-dashed border-stone-300 p-2 dark:border-slate-700" aria-hidden="true">{children}</div>
    <figcaption className="text-xs text-stone-500">{caption}</figcaption>
  </figure>
);
const P = ({ children }: { children: ReactNode }) => <p className="text-[15px] leading-relaxed text-stone-700 dark:text-slate-300">{children}</p>;

export function Guide() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-semibold">Guide</h1>
      <p className="text-sm text-stone-500">How LifeTracker works, in plain words. Tap a topic.</p>

      <Fold icon="✨" title="What it does" open>
        <P>LifeTracker keeps every regular payment in one place: subscriptions, mortgage or rent, insurance, utilities, phone and internet, loans, memberships. It shows what they cost each month and year, what’s due next, and warns you before a renewal, a free trial ending, or a price going up.</P>
        <P>It works by itself as much as possible: every morning it reads your bank’s purchase-alert emails and receipts in Gmail, and the documents you upload, then fills your Google Calendar. Anything new it finds waits in <b>Inbox</b> for your OK: nothing is added, paid or cancelled without you. The one exception, your choice: <b>appointments</b> in your emails and texts go straight into your calendar (and you can remove them).</P>
        <P>The <b>Me</b> tab is about you: where your name shows up online, people-search sites that list you, data breaches, the mailing lists you never read, documents that expire (passport, licence…) and your credit freeze. <b>My week</b> sums it all up on Home and in a weekly email.</P>
        <Example caption="Made-up example of Home: this month against a usual month, three rings, and what’s coming up.">
          <div className="space-y-2">
            <MonthHero total={1842} usual={2120} soFarUsual={2120} bills={2940} monthName="October" />
            <MiniRings rings={[{ label: 'Spending', sub: 'vs usual', value: 0.87, text: '87%', tone: 'emerald' }, { label: 'Bills', sub: 'this month', value: 5 / 8, text: '5/8', tone: 'teal' }, { label: 'Privacy', sub: 'credit frozen', value: 2 / 3, text: '2/3', tone: 'amber' }]} />
            <TimelineList moments={timeline({ items: EX, papers: PAPERS, dates: DATES, purchases: BUYS }, 30)} max={5} />
          </div>
        </Example>
        <P>The three rings: <b>Spending</b> (this month against a usual month), <b>Bills</b> (how many of this month’s bills already came), <b>Privacy</b> (credit bureaus frozen). Tap one to open it. <b>Coming up</b> mixes bills, free trials ending, renewals, documents, important dates and return windows; tap <b>See all</b> for the next 60 days.</P>
      </Fold>

      <Fold icon="🫧" title="How it looks and feels">
        <P>Everything sits on frosted glass over a slow, soft glow. When you tap a button it sinks a little, a glow spreads from your finger and it springs back. The tab bar at the bottom has a glass bubble that slides to the tab you open, and switches (like Bills | Spending | Returns) slide the same way.</P>
        <P>Rings and bars draw themselves in when a page opens. It follows your phone: light by day, dark at night. If your phone is set to <b>reduce motion</b>, all the movement stops and everything simply appears.</P>
        <Example caption="Made-up example: a switch, an on/off switch, a ring and a button, as they look in the app.">
          <div className="space-y-3">
            <Seg label="Example" options={[['a', 'Bills'], ['b', 'Spending'], ['c', 'Returns']]} value="b" onChange={() => undefined} />
            <div className="flex items-center gap-3">
              <Ring value={0.72} size={64} stroke={7} label="Example ring 72%"><span className="num text-[13px] font-semibold">72%</span></Ring>
              <span className="flex-1 text-sm">Daily check</span>
              <Toggle on label="Example switch" onChange={() => undefined} />
            </div>
            <span className="btn-primary w-full">Run the check now</span>
          </div>
        </Example>
        <P>The app icon is a small glowing planet with a ring and an amber moon: your life in the middle, with what’s coming up going around it.</P>
      </Fold>

      <Fold icon="💬" title="Ask LifeTracker">
        <P>Type a question in the bar on Home, in your own words: “How much did I spend eating out last month?”, “Which subscriptions renew this month?”, “What could I cancel?”, “When does my passport expire?”. The answer comes only from your own data, with follow-up questions to tap.</P>
        <P>Each question is one AI read: the free AIs first, Claude only if they can’t (Settings → AI). A short summary of your bills, spending, documents and dates goes to the AI with the question, nothing else.</P>
        <Example caption="Made-up question and answer.">
          <AskChat turns={[{ q: 'How much did I spend eating out last month?', a: 'In September you spent $180.00 eating out, mostly at Example Cafe (9 times). That’s about the same as a usual month.', by: 'Gemini Flash (free)', followUps: ['And on groceries?', 'Which month was highest?'] }]} />
        </Example>
      </Fold>

      <Fold icon="💸" title="Spending and budgets">
        <P>In <b>Money → Spending</b>: every purchase from your bank alert emails (or a bank CSV) is sorted into groceries, gas, eating out, shopping and so on, with free rules (no AI). You see this month (or last month) against your usual month (the 3 before), each category with a thin mark for its usual amount, and the shops it went to.</P>
        <P>Tap a category to set a <b>monthly budget</b>: you get a heads-up at 80% (change it in Settings → Spending & returns) and when it’s used up. A shop in the wrong category? Pick the right one next to it: that shop always goes there from now on. Transfers (Zelle, Venmo, cash) aren’t counted as spending.</P>
        <Example caption="Made-up month: eating out over its usual amount, groceries with a budget.">
          <SpendingView r={REPORT} budgets={{ groceries: 450, dining: 200 }} monthName="This month" />
        </Example>
      </Fold>

      <Fold icon="🧾" title="Returns and warranties">
        <P>Every morning LifeTracker looks for order confirmations and receipts in Gmail (a free check first, then the AI reads only real orders). It saves the shop, what you bought, the price, the <b>last day to return it</b> (from the email, or the store’s usual window like Best Buy 15 days, Amazon 30, Target 90) and any warranty.</P>
        <P>In <b>Money → Returns</b>: tap <b>Returning it</b> or <b>Keeping it</b>. You get a heads-up 3 days before a return window closes and a month before a warranty ends. Add any purchase by hand with ＋ Add.</P>
        <Example caption="Made-up purchases: one return window closing in 2 days, one still open.">
          <div className="space-y-2">{BUYS.map((p) => <PurchaseRow key={p.id} p={p} />)}</div>
        </Example>
      </Fold>

      <Fold icon="📆" title="Appointments (emails and texts)">
        <P>When you book something (doctor, dentist, car service, haircut, a table at a restaurant), the confirmation email or text is enough: LifeTracker finds it and <b>puts it straight into your Google Calendar</b> (the LifeTracker calendar), at the right time, with the place and reminders (1 day and 2 hours before; change it in Settings → Appointments). You get a heads-up saying what was added.</P>
        <P><b>Emails</b> are checked every hour. <b>Texts</b> work in the LifeTracker <b>Android app</b>: turn on “Read appointment texts” in Settings → Appointments and allow SMS. It also looks at your last 30 days of texts once. Your phone does a free check first, so other texts never leave it, and texts aren’t kept. Chat messages between Google Messages users (RCS) can’t be read; normal texts from businesses can.</P>
        <P>Moved to another day? The calendar moves too. Cancelled? It’s taken off. The same appointment in an email and a text counts once. Something wrong? Tap it on Home → <b>Remove it</b>.</P>
        <Example caption="Made-up appointments on Home, and the heads-up when one is added.">
          <div className="space-y-2">
            <ApptCard appts={APPTS} />
            <AlertList alerts={APPT_ALERT} />
          </div>
        </Example>
      </Fold>

      <Fold icon="🎂" title="Important dates and car care">
        <P>In <b>Me → Important dates</b>: birthdays, anniversaries, oil changes, tire rotations, dentist and check-ups, the HVAC filter… Pick a starter (one tap) or type your own, the next date, how often it repeats and when to remind you. After each date it moves to the next one by itself.</P>
        <P>You get a heads-up before each one, it’s on Home’s timeline, and it goes in your LifeTracker Google Calendar (repeating).</P>
        <Example caption="Made-up dates."><div>{DATES.map((x) => <DateRow key={x.id} d={x} />)}</div></Example>
      </Fold>

      <Fold icon="📋" title="Your bills">
        <P>Tap <b>＋ Add</b> in <b>Money → Bills</b>, pick a kind (subscription, insurance…), type the amount and how often, and the next payment date. The date moves forward by itself after each payment. <b>Autopay off</b> means you get a heads-up to pay it.</P>
        <P>Marking one <b>✂️ cancelled</b> keeps it in your history and shows how much you save a year.</P>
        <Example caption="Made-up bills: the monthly total, a price rise (↑ price) and a free trial.">
          <Totals items={EX} />
          <div>{EX.slice(0, 4).map((i) => <ItemRow key={i.id} i={i} />)}</div>
        </Example>
      </Fold>

      <Fold icon="🔎" title="Found for you (Inbox)">
        <P>When your bank shows the same company charging about the same amount at a steady rhythm (every week, month, quarter or year), or an email or document looks like a bill, it appears in <b>Inbox</b>. Tap <b>Add to my bills</b> (you can change anything first) or <b>Not a bill</b> (it won’t come back).</P>
        <Example caption="Made-up example found in a bank account.">
          <SuggestionCard s={SUGG} />
        </Example>
      </Fold>

      <Fold icon="🔔" title="Heads-ups">
        <P>On Home (and by email each morning if you turn it on): a price went up, a free trial ends in 3 days, a renewal or contract end is coming (30 days before by default), a bill not on autopay is due, or a new bill was found.</P>
        <Example caption="Made-up heads-ups."><AlertList alerts={ALERTS} /></Example>
      </Fold>

      <Fold icon="🏦" title="Your bank (free, by email)">
        <P>LifeTracker reads your bank the free way: your banks <b>email you each purchase</b>, and every morning LifeTracker finds those alert emails in your Gmail and reads the amount, the shop and the date. No bank password, no bank login, nothing paid, and no AI (free patterns). It only reads: nothing can be paid or moved.</P>
        <P>Once per bank: in its app, turn on <b>purchase / transaction alerts by email</b> for every card, for any amount ($0.01). Settings → Bank & cards shows the steps for Bank of America, SoFi and Capital One. Gmail must be connected (Settings → Google).</P>
        <P>Deposits, payments to your card and statements are skipped. The purchases go into the same bill finder: the same company charging about the same amount every month (or year) shows up in Inbox, and price rises are flagged. The first time it also looks back over your old alert emails (300 at a time, so a big inbox takes a few mornings or taps on Read now: Gmail only allows so many reads a minute).</P>
        <Example caption="Made-up example of Settings → Bank & cards.">
          <AlertBanks gmail read={128} banks={['Bank of America', 'Capital One']} />
        </Example>
        <P>No alerts yet? Download your transactions as a <b>CSV</b> from your bank and use <b>Import a bank CSV</b> in Inbox. A paid direct bank link (SimpleFIN) is also in Settings.</P>
      </Fold>

      <Fold icon="📊" title="My week">
        <P>A short summary on Home (and by email on the day you pick in Settings → Documents &amp; My week): money spent this week against a usual week, bills in the next 7 days, anything new about you online, mailing lists removed, documents expiring soon and your credit freeze.</P>
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
        <P>Fill in <b>About me</b> (at the top of Me, or in Settings): your name (and other spellings), your city, emails, phone numbers and usernames. Type each one (＋ adds another), then tap <b>Save</b>: a pop-up confirms what was saved, with a button to look for you right away. “Not saved yet” means you still need to tap Save. Every 7 days (you can change it) the free Gemini searches Google for them and sorts each page: your own profile, news, a people-search site, or <b>worrying</b> (a fake profile using your name, a scam, leaked documents or passwords, harassment).</P>
        <P>Only pages that really came back from the search are kept, so nothing is made up. New ones show in <b>Me</b>; worrying ones also as a heads-up. Tap <b>It’s fine</b> or <b>Not me</b> to clear them. For a worrying page: report it to the site, and ask Google to hide it with “Results about you”.</P>
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
        <P><b>Is a password leaked?</b> Type it in Me: it never leaves your phone (only the first 5 characters of a scrambled code are sent), and it isn’t saved.</P>
        <Example caption="Made-up breach."><BreachList rows={BREACH} /></Example>
      </Fold>

      <Fold icon="📭" title="Mailing lists (unsubscribe)">
        <P>From Gmail, LifeTracker counts who sends you newsletters and ads, how many, and when you last opened one. It reads only the <b>headers</b> (sender, subject, opened or not), never what’s inside.</P>
        <P><b>Unsubscribe</b> uses the official unsubscribe that real newsletters must include (the same one as Gmail’s Unsubscribe button). Most go with one tap, quietly, without opening any page. Some need an email (LifeTracker sends it from your Gmail) or a click on their page (it opens for you).</P>
        <P><b>Automatic</b> (Settings → Mailing lists): unsubscribes by itself from lists you haven’t opened in 60 days (you choose), listed in your morning email. Never from <b>Spam</b> (that would tell spammers your address works): <b>Block</b> those instead, so their emails go out of your inbox under the label “LifeTracker/Blocked”. Nothing is ever deleted. Tap <b>Keep</b> on any list you want to stay on.</P>
        <Example caption="Made-up mailing lists: never opened, opened often, unsubscribed automatically, and spam.">
          <ul className="divide-y divide-stone-200 dark:divide-slate-800">{SENDERS.map((x) => <SenderRow key={x.id} x={x} days={60} />)}</ul>
        </Example>
      </Fold>

      <Fold icon="🪪" title="Documents that expire">
        <P>In Me, <b>Add a document</b>: passport, driver’s licence, ID, car registration or inspection, insurance card, Global Entry, visa… Take a photo and the AI fills in the kind, name and expiry date (free AIs first); check it and save. Only the last 4 characters of the number are kept.</P>
        <P>You get heads-ups 90, 30 and 7 days before, and on the day. With Google Calendar connected, a “Start renewing” day is added 90 days before (passports take weeks) and the expiry day itself.</P>
        <Example caption="Made-up documents."><div className="divide-y divide-stone-200 dark:divide-slate-800">{PAPERS.map((p) => <PaperRow key={p.id} p={p} />)}</div></Example>
      </Fold>

      <Fold icon="🔒" title="Credit freeze and reports">
        <P>A <b>credit freeze</b> at the three credit bureaus is free, takes about 5 minutes each, and stops anyone from opening a loan or card in your name (the best protection against identity theft). You can lift it for a day when you apply for credit yourself. Me → Credit has the three freeze pages; mark each one done.</P>
        <P>Every 4 months you get a reminder to look at your free credit reports at annualcreditreport.com for accounts you don’t know.</P>
        <Example caption="Made-up example: two of three frozen.">
          <CreditCard c={{ equifax: 'frozen', experian: 'frozen', transunion: 'not', lastReport: d(-40), reportMonths: 4 }} />
        </Example>
      </Fold>

      <Fold icon="📅" title="Google Calendar">
        <P>Settings → <b>Connect Google Calendar</b>. LifeTracker makes its own <b>LifeTracker</b> calendar (it can’t see or change your other calendars) with each bill’s due date (repeating), renewals and trial ends, with a phone reminder a couple of days before, plus your appointments at their time. It updates itself every morning when your bills change, and within the hour for a new appointment.</P>
      </Fold>

      <Fold icon="✉️" title="Gmail receipts and forwarding">
        <P>Tick <b>Also read Gmail receipts</b>: each morning it looks for receipt, invoice, renewal and “free trial” emails (read-only). A free check first skips ads and shipping notices; only emails that look like bills are read by the AI.</P>
        <P>To add a bill from any email, <b>forward it to yourself with “+lifetracker”</b> (for example you+lifetracker@gmail.com, shown in Settings): it is picked up the next morning.</P>
      </Fold>

      <Fold icon="📄" title="Documents (bills, policies, statements)">
        <P>In Inbox, <b>Add a bill or document</b>: a photo or PDF of a bill, an insurance policy, a mortgage statement or a renewal letter. It is kept privately (only you can open it), and the AI reads the amount, dates, policy number, coverage and anything to watch out for.</P>
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

      <Fold icon="📱" title="Android app">
        <P>LifeTracker is also an app for Android phones: the same screens and the same data, in its own icon.</P>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>On your phone, open <b className="break-all">github.com/Anis1988/LifeTracker/releases/tag/android-latest</b> and tap <b>LifeTracker.apk</b>.</li>
          <li>Android asks to allow installing from your browser: tap <b>Settings → Allow</b>, then <b>Install</b>.</li>
          <li>Sign in with Google or your email: the browser opens a small LifeTracker page, tap <b>Open in the LifeTracker app</b> and you’re in.</li>
        </ol>
        <P>When a new version is ready, a banner at the top says so: tap <b>Update</b> and install it over the old one (your data stays). Connecting Google Calendar or Gmail opens your browser; when it says “connected”, come back to the app.</P>
        <Example caption="Made-up example of the update banner.">
          <UpdateBanner have={12} next={14} />
        </Example>
      </Fold>

      <Fold icon="🔐" title="Privacy">
        <P>Your data is in your own Supabase database. Each person only ever sees their own rows (Row Level Security). The bank access link and Google sign-in are encrypted, and the app itself can’t read them: only the server uses them. You can download everything or sign out in Settings.</P>
        <P>Ask LifeTracker sends a short summary of your own data with each question to the AI, only to answer it. Order emails are read only after a free check says they’re real orders.</P>
        <P>About me (your name, emails, phones, city) is private too; it is sent to the free Gemini only to run the searches. Mailing lists: only email headers are read. Document photos stay in your own private storage.</P>
      </Fold>

      <Fold icon="🛠️" title="Setting it up (one time)">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-700 dark:text-slate-300">
          <li><b>Supabase</b>: the project is linked to GitHub; pushing to <code>main</code> updates the database, the server functions and the website (see README).</li>
          <li><b>Sign-in code (optional)</b>: Supabase only lets you edit its emails once you use your own email sender (Authentication → Emails → SMTP settings, e.g. Resend). Then, in the <b>Magic Link</b> email, add <code>Or type this code: {'{{ .Token }}'}</code> to sign in with a 6-digit code too.</li>
          <li><b>Sign-in</b>: Supabase → Authentication → URL configuration: Site URL = the website address. For “Continue with Google”, turn on the Google provider with the same Google client.</li>
          <li><b>Server secrets</b> (Supabase → Edge Functions → Secrets): <code>LT_SECRET_KEY</code> (long random text), <code>CRON_SECRET</code>, <code>SITE_URL</code>, <code>LT_ALLOWED_EMAILS</code> (your email: only you can use the automatic parts), <code>GEMINI_API_KEY</code> (free), optional <code>GROQ_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>GOOGLE_CLIENT_ID</code>/<code>GOOGLE_CLIENT_SECRET</code>, <code>RESEND_API_KEY</code>.</li>
          <li><b>Google Cloud</b>: enable the Calendar and Gmail APIs, make an OAuth “Web” client with the redirect <code>https://&lt;project&gt;.supabase.co/functions/v1/google-callback</code>, add yourself as a test user, then publish the app (otherwise Google signs you out every 7 days).</li>
          <li><b>Morning run</b>: Supabase → Vault: add <code>lt_project_url</code> and <code>lt_cron_secret</code> (same as CRON_SECRET).</li>
          <li><b>Mailing lists (optional)</b>: Google Cloud → Google Auth Platform → Data Access → add the scope <code>gmail.modify</code>, then Settings → Mailing lists → Allow “Manage mailing lists”.</li>
          <li><b>Android app</b>: Supabase → Authentication → URL configuration → Redirect URLs: add <code>https://anis1988.github.io/LifeTracker/**</code> (so sign-in links reach the page that opens the app). Then install it (see “Android app”).</li>
          <li><b>iPhone</b>: open the website in Safari and “Add to Home Screen”.</li>
        </ol>
      </Fold>
    </div>
  );
}
