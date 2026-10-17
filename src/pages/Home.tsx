import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { ItemForm } from '../components/Items';
import { AddedRow, AlertList } from '../components/Inbox';
import { useAddedActions } from './Inbox';
import { useVaultOpen } from './Vault';
import { goTo, takeParam } from '../lib/nav';
import { HIT_LABELS, navTarget } from '../lib/search';
import { WeekCard } from '../components/Me';
import { ApptCard, ApptDetails } from '../components/Appointments';
import { AskBar, AskChat, MiniRings, MonthHero, TimelineList, askError, type Turn } from '../components/Dash';
import { Sheet, errText, toast } from '../components/ui';
import { NearbyLink, WeekendCard, WeekendLists, useSaveToList } from '../components/Nearby';
import { isWeekendNow, spotToContact, zipOf } from '../../supabase/functions/_shared/place.ts';
import { api } from '../lib/supabase';
import { timeline } from '../lib/timeline';
import { addedFeed, seenAt } from '../lib/added';
import { weekSummary } from '../../supabase/functions/_shared/week.ts';
import { contactForAppt } from '../../supabase/functions/_shared/contacts.ts';
import { spendReport } from '../../supabase/functions/_shared/spend.ts';
import { monthly, today } from '../../supabase/functions/_shared/money.ts';
import type { Appointment, Item } from '../../supabase/functions/_shared/model.ts';
import type { AddedEntry } from '../lib/added';

/** 🆕 What was added by itself: the newest 3 with ↶ Undo, and "See all" for the whole feed (the 🔔 Inbox). */
export function AddedCard({ list, fresh, busy, onUndo, onOpen, onAll }: { list: AddedEntry[]; fresh: number; busy?: string; onUndo?: (e: AddedEntry) => void; onOpen?: (e: AddedEntry) => void; onAll?: () => void }) {
  return (
    <section className={`card !px-3 !py-2 ${fresh ? '!border-teal-400/50 shadow-[0_0_30px_-12px_#5eead4]' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <p className="label">🆕 What was added{fresh ? <span className="num"> · {fresh} new</span> : null}</p>
        <button className="btn-ghost min-h-[44px] text-xs" onClick={onAll}>See all →</button>
      </div>
      <ul>{list.slice(0, 3).map((e) => <AddedRow key={e.key} e={e} busy={busy === e.key} onUndo={onUndo && (() => onUndo(e))} onOpen={onOpen && (() => onOpen(e))} />)}</ul>
      {list.length > 3 && <p className="px-1 pb-1.5 text-[11px] text-slate-500 dark:text-slate-400">+{list.length - 3} more in the last 30 days.</p>}
    </section>
  );
}

const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const hello = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

/** Bills this month: monthly bills whose date already came this month (next one is next month), out of all due this month. */
export function billsThisMonth(items: Item[], t = today()) {
  const month = t.slice(0, 7);
  const active = items.filter((i) => i.status === 'active' && i.next_due);
  const monthlyOnes = active.filter((i) => i.cycle === 'monthly' || i.cycle === 'weekly' || i.cycle === 'biweekly');
  const done = monthlyOnes.filter((i) => i.next_due!.slice(0, 7) > month).length;
  const others = active.filter((i) => !monthlyOnes.includes(i) && (i.next_due!.slice(0, 7) === month || (i.last_charged ?? '').slice(0, 7) === month));
  const othersDone = others.filter((i) => (i.last_charged ?? '').slice(0, 7) === month).length;
  return { done: done + othersDone, total: monthlyOnes.length + others.length };
}

export function Home({ go }: { go: (tab: string) => void }) {
  const st = useStore();
  const s = st.settings;
  const [open, setOpen] = useState<Item | null>(null);
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<Turn[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [weekendOpen, setWeekendOpen] = useState(false);
  const [making, setMaking] = useState(false);
  const t = today();
  // 🎉 This weekend's list (made Friday morning) from Friday to Sunday, for the zip in Settings.
  const zip = zipOf(s);
  const wk = st.weekend && st.weekend.home.zip === zip && isWeekendNow(st.weekend, t) ? st.weekend : null;
  const dow = new Date(`${t}T12:00:00Z`).getUTCDay();
  const makeWeekend = async () => {
    setMaking(true);
    try {
      const x = await api<{ log: { steps: string[]; errors: string[] } }>('run', { part: 'weekend' });
      toast(x.log.errors.length ? 'err' : 'ok', [...x.log.steps, ...x.log.errors].join(' · ') || 'Done.');
      await st.reload();
    } catch (e) { toast('err', errText(e)); }
    setMaking(false);
  };
  const toNearby = (list?: boolean) => goTo('places', list ? 'list' : 'nearby');
  const saveToList = useSaveToList();
  // 🆕 What was added by itself (the 🔔 Inbox feed): the latest few here, with Undo; "See all" opens the whole feed.
  const feed = useMemo(() => addedFeed(st), [st]);
  const fresh = useMemo(() => { const since = seenAt(); return feed.filter((e) => Date.parse(e.at) > since); }, [feed]);
  const added = useAddedActions();
  const vaultOpen = useVaultOpen();
  // "#/home?appt=<id>" (🔎 search, Inbox) opens that appointment.
  useEffect(() => { const id = takeParam('appt', '#/home'); const a = id ? st.appts.find((x) => x.id === id) : null; if (a) setAppt(a); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => spendReport(st.tx, s.spend.rules, t.slice(0, 7), Number(t.slice(8, 10))), [st.tx, s.spend.rules, t]);
  const moments = useMemo(() => timeline({ items: st.items, papers: s.papers.on ? st.papers : [], dates: st.dates, purchases: st.purchases }, 30), [st.items, st.papers, st.dates, st.purchases, s.papers.on]); // appointments have their own card
  const bills = billsThisMonth(st.items, t);
  const frozen = (['equifax', 'experian', 'transunion'] as const).filter((b) => s.credit[b] === 'frozen').length;
  const lines = weekSummary({ items: st.items, findings: st.findings, senders: st.senders, papers: s.papers.on ? st.papers : [], settings: s, spent: st.spent, dates: st.dates, purchases: st.purchases });

  const ask = async (q: string) => {
    const before = chat ?? [];
    // "Open my lease", "show Example Dental", "where is my passport?": found on this phone, no AI needed.
    const hit = navTarget({ items: st.items, tx: st.tx, contacts: st.contacts, places: st.places, papers: st.papers, appts: st.appts, rules: s.spend.rules }, q, vaultOpen);
    if (hit) { setChat([...before, { q, a: `Here it is: ${hit.title}${hit.sub ? ` (${hit.sub})` : ''}, in ${HIT_LABELS[hit.kind].replace(/^\S+\s/, '')}.`, by: 'this phone (no AI)', open: { label: `Open ${hit.title}`, href: hit.href } }]); return; }
    setChat([...before]);
    setThinking(true);
    try {
      const a = await api<{ answer: string; followUps: string[]; by: string }>('ask', { question: q, history: before.filter((x) => !x.error).slice(-4).map((x) => ({ q: x.q, a: x.a.slice(0, 1900) })) });
      setChat([...before, { q, a: a.answer, by: a.by, followUps: a.followUps }]);
    } catch (e) { setChat([...before, { q, a: askError(e), error: true }]); }
    setThinking(false);
  };
  const sync = async () => {
    setBusy(true);
    try {
      const x = await api<{ log: { steps: string[]; errors: string[]; newAlerts: number } }>('sync');
      toast(x.log.errors.length ? 'err' : 'ok', x.log.errors.length ? x.log.errors[0] : `Up to date. ${x.log.newAlerts ? `${x.log.newAlerts} new heads-up(s).` : ''}`);
      await Promise.all([st.reload(), st.reloadStatus()]);
    } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  const openMoment = (m: { itemId?: string; apptId?: string; docId?: string }) => {
    if (m.docId) { goTo('me', 'vault', `?doc=${m.docId}`); return; }
    const a = st.appts.find((x) => x.id === m.apptId);
    if (a) { setAppt(a); return; }
    const i = st.items.find((x) => x.id === m.itemId);
    if (i) setOpen(i);
  };
  const empty = !st.items.length && !st.tx.length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="stagger space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            <h1 className="text-[28px] font-semibold leading-tight">{hello()}</h1>
          </div>
          <button className="btn h-11 w-11 !p-0 text-slate-700 dark:text-slate-200" disabled={busy} onClick={() => void sync()} aria-label="Sync now" title={`Checked ${ago(st.status?.lastRun?.lastRun)}`}>
            {busy ? <span className="spinner" /> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v4h-4M6 22v-4h4" /></svg>}
          </button>
        </div>
        {empty ? (
          <div className="card space-y-3 py-6 text-center">
            <span className="orb mx-auto" aria-hidden="true">🧾</span>
            <h2 className="text-xl font-semibold">Let’s find your bills</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Connect Gmail (bank alert emails) and LifeTracker finds your subscriptions, mortgage, insurance and spending by itself. Or add a bill by hand.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={() => goTo('me', 'settings', '/google')}>Connect Google</button>
              <button className="btn" onClick={() => goTo('inbox', undefined, '?add')}>Upload a bill</button>
              <button className="btn" onClick={() => goTo('money', 'bills', '?add')}>＋ Add by hand</button>
            </div>
          </div>
        ) : (
          <>
            <MonthHero total={r.total} usual={r.usual} soFarUsual={r.soFarUsual} bills={st.items.filter((i) => i.status === 'active').reduce((a, i) => a + monthly(i), 0)} monthName={new Date().toLocaleDateString('en-US', { month: 'long' })} />
            <MiniRings rings={[
              { label: 'Spending', sub: 'vs usual', value: r.usual ? r.total / r.usual : 0, text: r.usual ? `${Math.round((r.total / r.usual) * 100)}%` : '—', tone: r.usual && r.total > r.usual ? 'red' : 'emerald', onClick: () => goTo('money', 'spending') },
              { label: 'Bills', sub: 'this month', value: bills.total ? bills.done / bills.total : 0, text: `${bills.done}/${bills.total}`, tone: 'teal', onClick: () => goTo('money', 'bills') },
              { label: 'Privacy', sub: 'credit frozen', value: frozen / 3, text: `${frozen}/3`, tone: 'amber', onClick: () => goTo('me', 'privacy') },
            ]} />
          </>
        )}
        <AskBar onAsk={(q) => void ask(q)} disabled={thinking} />
        {feed.length > 0 && <AddedCard list={feed} fresh={fresh.length} busy={added.busy} onUndo={(e) => void added.undo(e)} onOpen={added.open} onAll={() => go('inbox')} />}
        <AlertList alerts={st.alerts} onSeen={(id) => void st.seeAlert(id)} />
      </div>
      <div className="stagger space-y-4">
        {(s.appts.on || st.appts.length > 0) && <ApptCard appts={st.appts} emailOn={s.appts.on} contacts={st.contacts} onRemove={(a) => st.removeAppt(a.id)} />}
        {wk ? <WeekendCard w={wk} onAll={() => setWeekendOpen(true)} />
          : <NearbyLink zip={zip} onGo={() => toNearby()} toDo={st.places.filter((p) => !p.done).length} onList={() => toNearby(true)} onMake={s.place.weekend && (dow === 5 || dow === 6 || dow === 0) ? () => void makeWeekend() : undefined} making={making} />}
        <TimelineList moments={moments} onAll={() => setAll(true)} onOpen={(m) => openMoment(m)} />
        <WeekCard lines={lines} onOpen={() => goTo('me', 'privacy')} />
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">🔄 Automatic check {ago(st.status?.lastRun?.lastRun)}{st.status?.lastRun?.errors?.length ? ` · ⚠ ${st.status.lastRun.errors[0]}` : ''}</p>
      </div>
      {all && <Sheet title="Next 60 days" onClose={() => setAll(false)}><TimelineList moments={timeline({ items: st.items, papers: s.papers.on ? st.papers : [], dates: st.dates, purchases: st.purchases, appts: st.appts }, 60)} max={200} title="Timeline" onOpen={(m) => { setAll(false); openMoment(m); }} /></Sheet>}
      {chat && <Sheet title="Ask LifeTracker" onClose={() => setChat(null)}><AskChat turns={chat} busy={thinking} onAsk={(q) => void ask(q)} /><div className="mt-3"><AskBar onAsk={(q) => void ask(q)} disabled={thinking} /></div></Sheet>}
      {weekendOpen && wk && <Sheet title="This weekend" onClose={() => setWeekendOpen(false)}><WeekendLists w={wk} contacts={st.contacts} onAdd={(x) => void st.saveContact(spotToContact(x)).then((r) => toast('ok', r.merged ? `${x.name} was already in Contacts.` : `${x.name} added to Contacts.`)).catch((e) => toast('err', errText(e)))} places={st.places} onSave={(x) => void saveToList(x)} /></Sheet>}
      {appt && <Sheet title={appt.title} onClose={() => setAppt(null)}><ApptDetails a={appt} contact={contactForAppt(st.contacts, appt)} onRemove={async () => { await st.removeAppt(appt.id); setAppt(null); }} /></Sheet>}
      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <ItemForm item={open} onSave={st.saveItem} onDelete={() => st.deleteItem(open.id)} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </div>
  );
}
