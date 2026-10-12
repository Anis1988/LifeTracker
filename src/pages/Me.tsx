import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/supabase';
import { Fold, Sheet, errText, toast } from '../components/ui';
import { AboutMe } from '../components/AboutMe';
import { BreachList, BrokerList, CreditCard, FindingRow, PaperForm, PaperRow, PasswordCheck, SenderRow, WeekCard, senderFilter, type SenderView } from '../components/Me';
import { weekSummary } from '../../supabase/functions/_shared/week.ts';
import type { LifeDate, Paper, Sender } from '../../supabase/functions/_shared/model.ts';
import { DateForm, DateRow } from '../components/Dates';

const ago = (iso?: string | null) => {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** 👤 Everything about you: your name online, people-search sites, breaches, mailing lists, documents, credit. */
export function Me(_: { go: (tab: string) => void }) {
  const st = useStore();
  const s = st.settings;
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<SenderView>('stale');
  const [paper, setPaper] = useState<Partial<Paper> | null>(null);
  const [date, setDate] = useState<Partial<LifeDate> | null>(null);
  const [showAll, setShowAll] = useState(false);

  const web = st.findings.filter((f) => f.kind === 'web');
  const newWeb = web.filter((f) => f.status === 'new').sort((a, b) => Number(b.verdict === 'worrying') - Number(a.verdict === 'worrying'));
  const brokers = st.findings.filter((f) => f.kind === 'broker');
  const breaches = st.findings.filter((f) => f.kind === 'breach');
  const lines = useMemo(() => weekSummary({ items: st.items, findings: st.findings, senders: st.senders, papers: s.papers.on ? st.papers : [], settings: s, spent: st.spent, dates: st.dates, purchases: st.purchases }), [st.items, st.findings, st.senders, st.papers, s, st.spent]);
  const senders = st.senders.filter(senderFilter(view, s.unsub.days));
  const hasProfile = s.me.names.length > 0 || s.me.emails.length > 0;

  const run = async (part: 'online' | 'breaches' | 'lists' | 'week', label: string) => {
    setBusy(part);
    try {
      const r = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part });
      toast(r.log.errors.length ? 'err' : 'ok', [...r.log.steps, ...r.log.errors].join(' · ') || `${label}: nothing new.`);
      await Promise.all([st.reload(), st.reloadStatus()]);
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const unsub = async (x: Sender) => {
    setBusy(x.id);
    try {
      const r = await api<{ status: Sender['status']; open?: string; error?: string }>('unsubscribe', { id: x.id });
      if (r.error) toast('err', r.error);
      else if (r.open) { toast('info', 'This sender needs a click on their page: it opens now.'); window.open(r.open, '_blank', 'noopener,noreferrer'); }
      else toast('ok', `Unsubscribed from ${x.name || x.address}.`);
      await st.reload();
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const block = async (x: Sender) => {
    if (!confirm(`Block ${x.name || x.address}? Their emails will go out of your inbox into the label “LifeTracker/Blocked” (nothing is deleted).`)) return;
    setBusy(x.id);
    try {
      const r = await api<{ moved: number }>('block', { id: x.id });
      toast('ok', `Blocked. ${r.moved} email(s) moved out of the inbox.`);
      await st.reload();
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-semibold">Me</h1>
      <Fold icon="👤" title="About me" subtitle={hasProfile ? [s.me.names[0], s.me.places[0]].filter(Boolean).join(' · ') : 'Add your name so LifeTracker can look for you online'} open={!hasProfile}>
        <p className="text-sm text-stone-600 dark:text-slate-300">Private: only you can see it. Sent to the free Gemini only to run the searches.</p>
        <AboutMe me={s.me} onSave={(me) => st.saveSettings({ ...s, me })} onCheck={() => void run('online', 'Your name online')} />
      </Fold>
      <WeekCard lines={lines} />

      <Fold icon="🕵️" title="Your name online" subtitle={`${newWeb.length ? `${newWeb.length} new` : 'Nothing new'} · checked ${ago(st.status?.me?.lastOnline)}`} open={newWeb.some((f) => f.verdict === 'worrying')}>
        <p className="text-sm text-stone-600 dark:text-slate-300">Every {s.online.everyDays} days the free Gemini searches Google for your name with your city, and your exact emails, phones and usernames. Only pages that really came back from the search are kept.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={!!busy || !hasProfile} onClick={() => void run('online', 'Your name online')}>{busy === 'online' ? <><span className="spinner" /> Searching…</> : '🔎 Check now'}</button>
          {!!st.status?.me?.lastErrors?.length && <span className="text-xs text-amber-800 dark:text-amber-200">Last time: {st.status.me.lastErrors[0]}</span>}
        </div>
        {(showAll ? web : newWeb).map((f) => <FindingRow key={f.id} f={f} onSet={(p) => void st.setFinding(f.id, p).catch((e) => toast('err', errText(e)))} />)}
        {!newWeb.length && <p className="text-sm text-stone-500 dark:text-slate-400">{web.length ? 'Nothing new to look at.' : 'Nothing found yet.'}</p>}
        {web.length > newWeb.length && <button className="btn-ghost text-xs" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Only new' : `Show all ${web.length}`}</button>}
      </Fold>

      <Fold icon="🧹" title="People-search sites" subtitle={`${brokers.filter((b) => b.status === 'listed').length} list you · ${brokers.filter((b) => b.status === 'gone' || b.status === 'not-listed').length} clear`}>
        <p className="text-sm text-stone-600 dark:text-slate-300">These sites sell your address, phone and relatives. Removal is free but each site wants its own request (that’s why paid services exist). Found by the name search, or tap a site and set it yourself.</p>
        <BrokerList rows={brokers} onSet={(f, p) => void st.setFinding(f.id, p).catch((e) => toast('err', errText(e)))} />
      </Fold>

      <Fold icon="🔓" title="Data breaches & passwords" subtitle={`${breaches.filter((b) => b.status === 'new').length} to handle`}>
        <p className="text-sm text-stone-600 dark:text-slate-300">Sign up once (free) at <a className="underline" href="https://haveibeenpwned.com/NotifyMe" target="_blank" rel="noopener noreferrer">haveibeenpwned.com/NotifyMe</a> with each of your emails (or <a className="underline" href="https://monitor.mozilla.org" target="_blank" rel="noopener noreferrer">Mozilla Monitor</a>). Their alert emails are read from Gmail every morning (no AI).</p>
        <BreachList rows={breaches} onSet={(f, p) => void st.setFinding(f.id, p).catch((e) => toast('err', errText(e)))} />
        <button className="btn" disabled={!!busy || !st.status?.google.gmail} onClick={() => void run('breaches', 'Data breaches')}>{busy === 'breaches' ? <span className="spinner" /> : 'Read breach emails now'}</button>
        <p className="pt-1 text-sm font-medium">Is a password leaked?</p>
        <PasswordCheck />
      </Fold>

      <Fold icon="📭" title="Mailing lists" subtitle={st.senders.length ? `${st.senders.filter(senderFilter('stale', s.unsub.days)).length} not opened in ${s.unsub.days} days · ${st.senders.filter((x) => x.status === 'unsubscribed').length} unsubscribed` : 'Not scanned yet'}>
        {!st.status?.google.gmail ? <p className="text-sm text-amber-800 dark:text-amber-200">Connect Gmail first (Settings → Google).</p> : (
          <>
            <p className="text-sm text-stone-600 dark:text-slate-300">Only the email headers are read (who, subject, opened or not), never the contents. Unsubscribe uses the official unsubscribe that real newsletters carry; senders seen in Spam are never unsubscribed (block them instead).{s.unsub.auto ? ` Automatic: on, after ${s.unsub.days} days without opening.` : ''}</p>
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {([['stale', `Not opened in ${s.unsub.days} days`], ['all', 'All'], ['done', 'Done'], ['spam', 'Spam']] as [SenderView, string][]).map(([v, l]) => (
                <button key={v} role="tab" aria-selected={view === v} className={`chip !px-3 !py-1 ${view === v ? 'border-emerald-700 bg-emerald-800 text-white dark:border-emerald-600 dark:bg-emerald-600' : 'border-stone-300 text-stone-600 dark:border-slate-700 dark:text-slate-300'}`} onClick={() => setView(v)}>{l}</button>
              ))}
            </div>
            <ul className="divide-y divide-stone-200 dark:divide-slate-800">
              {senders.slice(0, 80).map((x) => (
                <SenderRow key={x.id} x={x} days={s.unsub.days} busy={busy === x.id}
                  onUnsub={() => void unsub(x)} onBlock={() => void block(x)}
                  onKeep={() => void st.setSender(x.id, { status: x.status === 'subscribed' ? 'kept' : 'subscribed' }).catch((e) => toast('err', errText(e)))} />
              ))}
            </ul>
            {!senders.length && <p className="text-sm text-stone-500 dark:text-slate-400">Nothing here.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn" disabled={!!busy} onClick={() => void run('lists', 'Mailing lists')}>{busy === 'lists' ? <><span className="spinner" /> Reading headers…</> : 'Scan now'}</button>
              <span className="text-xs text-stone-500 dark:text-slate-400">Last scan {ago(st.status?.mail?.lastSweep)}{st.status?.mail && !st.status.mail.sweepDone && st.status.mail.lastSweep ? ' · older emails still being read' : ''}</span>
            </div>
            {!st.status?.google.mailbox && <p className="text-xs text-stone-500 dark:text-slate-400">Some senders can only be unsubscribed by email, and blocking moves emails out of the inbox: both need “Manage mailing lists” in Settings → Mailing lists.</p>}
          </>
        )}
      </Fold>

      <Fold icon="🎂" title="Important dates & car care" subtitle={st.dates.length ? `${st.dates.length} saved · next ${st.dates[0].title}` : 'Birthdays, oil changes, check-ups…'} open={st.dates.length > 0}>
        <div className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.06]">{st.dates.map((d) => <DateRow key={d.id} d={d} onOpen={() => setDate(d)} />)}</div>
        <button className="btn-primary" onClick={() => setDate({})}>＋ Add a date</button>
        <p className="text-xs text-slate-500 dark:text-slate-400">A heads-up before each one, on Home’s timeline, and in your Google Calendar (repeating).</p>
      </Fold>

      <Fold icon="🪪" title="Documents that expire" subtitle={st.papers.length ? `${st.papers.length} saved${st.papers[0]?.expires ? ` · next ${st.papers[0].name}` : ''}` : 'Passport, licence, registration…'} open={st.papers.length > 0}>
        <div className="divide-y divide-stone-200 dark:divide-slate-800">{st.papers.map((p) => <PaperRow key={p.id} p={p} onOpen={() => setPaper(p)} />)}</div>
        <button className="btn-primary" onClick={() => setPaper({ kind: 'passport' })}>＋ Add a document</button>
        <p className="text-xs text-stone-500 dark:text-slate-400">Heads-ups {s.papers.remind.join(', ')} days before it expires, and in your Google Calendar (a “start renewing” day 90 days before).</p>
      </Fold>

      <Fold icon="🔒" title="Credit freeze & reports" subtitle={`${(['equifax', 'experian', 'transunion'] as const).filter((b) => s.credit[b] === 'frozen').length} of 3 frozen`}>
        <CreditCard c={s.credit} onChange={(c) => void st.saveSettings({ ...s, credit: c }).catch((e) => toast('err', errText(e)))} />
      </Fold>

      {date && (
        <Sheet title={date.id ? date.title ?? 'Date' : 'Add a date'} onClose={() => setDate(null)}>
          <DateForm d={date} onSave={st.saveDate} onDelete={date.id ? () => st.deleteDate(date.id!) : undefined} onDone={() => setDate(null)} />
        </Sheet>
      )}
      {paper && (
        <Sheet title={paper.id ? paper.name ?? 'Document' : 'Add a document'} onClose={() => setPaper(null)}>
          <PaperForm paper={paper} userId={st.session.user.id} onDone={() => setPaper(null)} onSave={st.savePaper}
            onDelete={paper.id ? () => st.deletePaper(paper as Paper) : undefined}
            read={(path) => api('read-paper', { path })} />
        </Sheet>
      )}
    </div>
  );
}
