import type { ReactNode } from 'react';
import { Fold } from '../components/ui';
import { ItemRow, LoanCalc, Totals, Upcoming } from '../components/Items';
import { AlertList, DocRow, SuggestionCard } from '../components/Inbox';
import { BankCard } from '../components/Bank';
import type { Alert, Doc, Item, Suggestion } from '../../supabase/functions/_shared/model.ts';
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
        <P>It works by itself as much as possible: every morning it reads your bank (read-only), your Gmail receipts, and the documents you upload, then fills your Google Calendar. Anything new it finds waits in <b>Inbox</b> for your OK: nothing is added, paid or cancelled without you.</P>
        <Example caption="Made-up example of Home: the total, by category, and what’s coming up.">
          <div className="space-y-2"><Totals items={EX} /><Upcoming items={EX} days={30} /></div>
        </Example>
      </Fold>

      <Fold icon="📋" title="Your bills">
        <P>Tap <b>＋ Add</b> in <b>Bills</b>, pick a kind (subscription, insurance…), type the amount and how often, and the next payment date. The date moves forward by itself after each payment. <b>Autopay off</b> means you get a heads-up to pay it.</P>
        <P>Marking one <b>✂️ cancelled</b> keeps it in your history and shows how much you save a year.</P>
        <Example caption="Made-up bills: a price rise (↑ price) and a free trial.">
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

      <Fold icon="🏦" title="Linking your bank">
        <P>Settings → Bank & cards → <b>Connect a bank</b>. Plaid’s own window opens: pick your bank and log in there (your bank password goes to Plaid, never to LifeTracker). It is <b>read-only</b>: nothing can be paid or moved. Free for up to 10 bank logins; one login covers all your accounts at that bank.</P>
        <P>The first time it reads up to 2 years of transactions (it can take a few minutes to arrive), then every morning. If a bank asks you to log in again, a <b>Log in again</b> button appears. <b>Disconnect</b> removes the link at Plaid too.</P>
        <Example caption="Made-up example of a connected bank in Settings.">
          <BankCard p={{ kind: 'x', institution: 'Example Bank', lastSync: new Date().toISOString(), accounts: [{ name: 'Example Bank Checking …1234', balance: 2840.12, currency: 'USD' }, { name: 'Example Bank Card …9876', balance: 412.5, currency: 'USD' }], error: null, needsLogin: false }} />
        </Example>
        <P>No bank link? Download your transactions as a <b>CSV</b> from your bank and use <b>Import a bank CSV</b> in Inbox. SimpleFIN (paid) is still offered as another option.</P>
      </Fold>

      <Fold icon="📅" title="Google Calendar">
        <P>Settings → <b>Connect Google Calendar</b>. LifeTracker makes its own <b>LifeTracker</b> calendar (it can’t see or change your other calendars) with each bill’s due date (repeating), renewals and trial ends, with a phone reminder a couple of days before. It updates itself every morning when your bills change.</P>
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

      <Fold icon="🔐" title="Privacy">
        <P>Your data is in your own Supabase database. Each person only ever sees their own rows (Row Level Security). The bank access link and Google sign-in are encrypted, and the app itself can’t read them: only the server uses them. You can download everything or sign out in Settings.</P>
      </Fold>

      <Fold icon="🛠️" title="Setting it up (one time)">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-700 dark:text-slate-300">
          <li><b>Supabase</b>: the project is linked to GitHub; pushing to <code>main</code> updates the database, the server functions and the website (see README).</li>
          <li><b>Sign-in</b>: Supabase → Authentication → URL configuration: Site URL = the website address. For “Continue with Google”, turn on the Google provider with the same Google client.</li>
          <li><b>Server secrets</b> (Supabase → Edge Functions → Secrets): <code>LT_SECRET_KEY</code> (long random text), <code>CRON_SECRET</code>, <code>SITE_URL</code>, <code>LT_ALLOWED_EMAILS</code> (your email: only you can use the automatic parts), <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> (free Trial at dashboard.plaid.com), <code>GEMINI_API_KEY</code> (free), optional <code>GROQ_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>GOOGLE_CLIENT_ID</code>/<code>GOOGLE_CLIENT_SECRET</code>, <code>RESEND_API_KEY</code>.</li>
          <li><b>Google Cloud</b>: enable the Calendar and Gmail APIs, make an OAuth “Web” client with the redirect <code>https://&lt;project&gt;.supabase.co/functions/v1/google-callback</code>, add yourself as a test user, then publish the app (otherwise Google signs you out every 7 days).</li>
          <li><b>Morning run</b>: Supabase → Vault: add <code>lt_project_url</code> and <code>lt_cron_secret</code> (same as CRON_SECRET).</li>
          <li><b>iPhone / Android</b>: open the website and “Add to Home Screen”.</li>
        </ol>
      </Fold>
    </div>
  );
}
