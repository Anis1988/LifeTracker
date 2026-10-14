import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, supabase } from './supabase';
import { withDefaults, type Alert, type Appointment, type Doc, type Finding, type Item, type LifeDate, type Paper, type Purchase, type Sender, type Settings, type Suggestion } from '../../supabase/functions/_shared/model.ts';
import type { SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { spentOf, type WeekInput } from '../../supabase/functions/_shared/week.ts';
import { today } from '../../supabase/functions/_shared/money.ts';
import { allRows } from '../../supabase/functions/_shared/rows.ts';
import { flushTexts } from './texts';

/** What the server reports (bank, Google, AI use today, last automatic run, which keys are set). */
export interface Status {
  bank: { connected: boolean; lastSync?: string | null; accounts?: { name: string; balance: number; currency: string }[]; errors?: string[] };
  google: { connected: boolean; email?: string | null; calendar?: boolean; gmail?: boolean; lastGmail?: string | null; alertsScanned?: string | null; alertsRead?: number; alertBanks?: string[]; mailbox?: boolean };
  me?: { lastOnline: string | null; lastErrors: string[]; weekSent: string | null; breachScanned: string | null };
  mail?: { lastSweep: string | null; sweepDone: boolean; headsRead: number; apptsScanned?: string | null };
  phone?: { since: string | null; lastText: string | null };
  lastRun: { lastRun?: string; steps?: string[]; errors?: string[] } | null;
  aiUsed: Record<string, number>;
  keys: Record<'gemini' | 'groq' | 'openrouter' | 'claude' | 'google' | 'email' | 'secret', boolean>;
  email?: string;
}

interface Store {
  session: Session;
  items: Item[];
  suggestions: Suggestion[];
  alerts: Alert[];
  docs: Doc[];
  findings: Finding[];
  senders: Sender[];
  papers: Paper[];
  spent: WeekInput['spent'];
  tx: SpendTx[]; // money in and out, the last ~7 months (Spending, Home)
  purchases: Purchase[];
  dates: LifeDate[];
  appts: Appointment[]; // booked, from yesterday on
  settings: Settings;
  status: Status | null;
  statusErr: string;
  loading: boolean;
  reload: () => Promise<void>;
  reloadStatus: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  saveItem: (i: Partial<Item> & { name: string }) => Promise<Item>;
  deleteItem: (id: string) => Promise<void>;
  setSuggestion: (id: string, patch: Partial<Suggestion>) => Promise<void>;
  seeAlert: (id: string) => Promise<void>;
  setFinding: (id: string, patch: Partial<Finding>) => Promise<void>;
  addBroker: (b: { id: string; name: string; domain: string }, patch: Partial<Finding>) => Promise<void>;
  setSender: (id: string, patch: Partial<Sender>) => Promise<void>;
  savePaper: (p: Partial<Paper> & { name: string }) => Promise<Paper>;
  deletePaper: (p: Paper) => Promise<void>;
  savePurchase: (p: Partial<Purchase> & { store: string }) => Promise<Purchase>;
  deletePurchase: (id: string) => Promise<void>;
  saveDate: (d: Partial<LifeDate> & { title: string; next_date: string }) => Promise<LifeDate>;
  deleteDate: (id: string) => Promise<void>;
  removeAppt: (id: string) => Promise<void>;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

const check = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export function StoreProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [spent, setSpent] = useState<WeekInput['spent']>({ week: 0, usualWeek: null, top: [] });
  const [tx, setTx] = useState<SpendTx[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [dates, setDates] = useState<LifeDate[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<Settings>(withDefaults(null));
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const since = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(`${today()}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10); // this phone's yesterday
    const [i, s, a, d, st, f, se, p, tx, pu, ld, ap] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('suggestions').select('*').eq('status', 'new').order('created_at', { ascending: false }),
      supabase.from('alerts').select('*').eq('seen', false).order('created_at', { ascending: false }).limit(50),
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('settings').select('data').maybeSingle(),
      supabase.from('findings').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('senders').select('*').order('emails', { ascending: false }).limit(500),
      supabase.from('papers').select('*').order('expires', { ascending: true, nullsFirst: false }),
      // More than 1,000 rows come in pages (Supabase sends at most 1,000 at a time).
      allRows<SpendTx>((a, b) => supabase.from('transactions').select('posted, amount, description, merchant, item_id').gte('posted', since).order('posted', { ascending: false }).order('external_id').range(a, b), 10000).then((data) => ({ data })),
      supabase.from('purchases').select('*').neq('status', 'ignored').order('bought', { ascending: false }).limit(300),
      supabase.from('life_dates').select('*').order('next_date'),
      supabase.from('appointments').select('*').eq('status', 'booked').gte('day', yesterday).order('day').order('time').limit(200),
    ]);
    setItems(check(i) ?? []);
    setSuggestions(check(s) ?? []);
    setAlerts(check(a) ?? []);
    setDocs(check(d) ?? []);
    // The "Me" tables may not exist yet for a moment after an update: keep going without them.
    setFindings((f.data as Finding[]) ?? []);
    setSenders((se.data as Sender[]) ?? []);
    setPapers((p.data as Paper[]) ?? []);
    setSpent(spentOf(tx.data ?? [], undefined, withDefaults((st.data?.data ?? null) as Partial<Settings> | null).spend.rules));
    setTx((tx.data as SpendTx[]) ?? []);
    setPurchases((pu.data as Purchase[]) ?? []);
    setDates((ld.data as LifeDate[]) ?? []);
    setAppts((ap.data as Appointment[]) ?? []);
    const saved = withDefaults((st.data?.data ?? null) as Partial<Settings> | null);
    // 📅 Appointment times are in your time zone: remember this device's the first time.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!saved.appts.timeZone && tz) {
      saved.appts = { ...saved.appts, timeZone: tz };
      void supabase.from('settings').upsert({ user_id: session.user.id, data: saved });
    }
    setSettings(saved);
    setLoading(false);
  }, []);
  const reloadStatus = useCallback(async () => {
    try {
      setStatus(await api<Status>('status'));
      setStatusErr('');
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload().catch(() => setLoading(false));
    void reloadStatus();
    void flushTexts(); // 💬 Android app: appointment texts that couldn't be sent earlier
    // Back to the app (another device or the morning run may have changed things): fresh data.
    const back = () => document.visibilityState === 'visible' && void reload().catch(() => undefined);
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [reload, reloadStatus]);

  const store = useMemo<Store>(() => ({
    session, items, suggestions, alerts, docs, findings, senders, papers, spent, tx, purchases, dates, appts, settings, status, statusErr, loading, reload, reloadStatus,
    saveSettings: async (s) => {
      const prev = settings;
      setSettings(s);
      const r = await supabase.from('settings').upsert({ user_id: session.user.id, data: s });
      if (r.error) setSettings(prev); // not saved: show what is really saved
      check(r);
    },
    saveItem: async (i) => {
      const row = { ...i, user_id: session.user.id };
      delete (row as Partial<Item>).created_at;
      delete (row as Partial<Item>).updated_at;
      const saved = check(await (i.id ? supabase.from('items').update(row).eq('id', i.id) : supabase.from('items').insert(row)).select().single()) as Item;
      setItems((cur) => [...cur.filter((x) => x.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      return saved;
    },
    deleteItem: async (id) => {
      check(await supabase.from('items').delete().eq('id', id));
      setItems((cur) => cur.filter((x) => x.id !== id));
    },
    setSuggestion: async (id, patch) => {
      check(await supabase.from('suggestions').update(patch).eq('id', id));
      setSuggestions((cur) => cur.filter((x) => x.id !== id || patch.status === 'new'));
    },
    seeAlert: async (id) => {
      setAlerts((cur) => cur.filter((x) => x.id !== id));
      check(await supabase.from('alerts').update({ seen: true }).eq('id', id));
    },
    setFinding: async (id, patch) => {
      setFindings((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      check(await supabase.from('findings').update(patch).eq('id', id));
    },
    addBroker: async (b, patch) => {
      // A people-search site not checked yet has no row: make it with the status you picked.
      const row = check(await supabase.from('findings').upsert({ user_id: session.user.id, kind: 'broker', key: b.id, title: b.name, site: b.domain, url: null, ...patch }, { onConflict: 'user_id,kind,key' }).select().single()) as Finding;
      setFindings((cur) => [row, ...cur.filter((x) => x.id !== row.id)]);
    },
    setSender: async (id, patch) => {
      setSenders((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      check(await supabase.from('senders').update(patch).eq('id', id));
    },
    savePaper: async (p) => {
      const row = { ...p, user_id: session.user.id };
      delete (row as Partial<Paper>).created_at;
      const saved = check(await (p.id ? supabase.from('papers').update(row).eq('id', p.id) : supabase.from('papers').insert(row)).select().single()) as Paper;
      setPapers((cur) => [...cur.filter((x) => x.id !== saved.id), saved].sort((a, b) => (a.expires ?? '9') < (b.expires ?? '9') ? -1 : 1));
      return saved;
    },
    deletePaper: async (p) => {
      if (p.photo) await supabase.storage.from('docs').remove([p.photo]);
      check(await supabase.from('papers').delete().eq('id', p.id));
      setPapers((cur) => cur.filter((x) => x.id !== p.id));
    },
    savePurchase: async (p) => {
      const row = { ...p, user_id: session.user.id, key: p.key ?? `hand:${crypto.randomUUID()}` };
      delete (row as Partial<Purchase>).created_at;
      const saved = check(await (p.id ? supabase.from('purchases').update(row).eq('id', p.id) : supabase.from('purchases').insert(row)).select().single()) as Purchase;
      setPurchases((cur) => [saved, ...cur.filter((x) => x.id !== saved.id)].filter((x) => x.status !== 'ignored').sort((a, b) => (a.bought < b.bought ? 1 : -1)));
      return saved;
    },
    deletePurchase: async (id) => {
      check(await supabase.from('purchases').delete().eq('id', id));
      setPurchases((cur) => cur.filter((x) => x.id !== id));
    },
    saveDate: async (d) => {
      const row = { ...d, user_id: session.user.id };
      delete (row as Partial<LifeDate>).created_at;
      const saved = check(await (d.id ? supabase.from('life_dates').update(row).eq('id', d.id) : supabase.from('life_dates').insert(row)).select().single()) as LifeDate;
      setDates((cur) => [...cur.filter((x) => x.id !== saved.id), saved].sort((a, b) => a.next_date.localeCompare(b.next_date)));
      return saved;
    },
    deleteDate: async (id) => {
      check(await supabase.from('life_dates').delete().eq('id', id));
      setDates((cur) => cur.filter((x) => x.id !== id));
    },
    removeAppt: async (id) => {
      setAppts((cur) => cur.filter((x) => x.id !== id));
      check(await supabase.from('appointments').update({ status: 'removed' }).eq('id', id));
      await api('run', { part: 'calendar' }); // off the calendar now
    },
  }), [session, items, suggestions, alerts, docs, findings, senders, papers, spent, tx, purchases, dates, appts, settings, status, statusErr, loading, reload, reloadStatus]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
