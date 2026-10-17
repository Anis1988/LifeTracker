import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, supabase } from './supabase';
import { withDefaults, type Alert, type Appointment, type Contact, type Doc, type Finding, type Item, type LifeDate, type Paper, type Purchase, type Sender, type Settings, type Suggestion } from '../../supabase/functions/_shared/model.ts';
import type { SpendTx } from '../../supabase/functions/_shared/spend.ts';
import { spentOf, type WeekInput } from '../../supabase/functions/_shared/week.ts';
import { today } from '../../supabase/functions/_shared/money.ts';
import { allRows } from '../../supabase/functions/_shared/rows.ts';
import { changedFields, contactKey, ownerMerge, sameContact, unionEmails, unionPhones } from '../../supabase/functions/_shared/contacts.ts';
import { flushTexts } from './texts';
import type { Weekend } from '../../supabase/functions/_shared/place.ts';

/** What the server reports (bank, Google, AI use today, last automatic run, which keys are set). */
export interface Status {
  bank: { connected: boolean; lastSync?: string | null; accounts?: { name: string; balance: number; currency: string }[]; errors?: string[] };
  google: { connected: boolean; email?: string | null; calendar?: boolean; gmail?: boolean; lastGmail?: string | null; alertsScanned?: string | null; alertsRead?: number; alertBanks?: string[]; mailbox?: boolean };
  me?: { lastOnline: string | null; lastErrors: string[]; weekSent: string | null; breachScanned: string | null };
  mail?: { lastSweep: string | null; sweepDone: boolean; headsRead: number; apptsScanned?: string | null; contactsScanned?: string | null; vaultScanned?: string | null; receiptsScanned?: string | null; mailChecked?: string | null };
  phone?: { since: string | null; lastText: string | null };
  lastRun: { lastRun?: string; steps?: string[]; errors?: string[] } | null;
  aiUsed: Record<string, number>;
  keys: Record<'gemini' | 'groq' | 'openrouter' | 'claude' | 'google' | 'email' | 'secret', boolean>;
  email?: string;
}

const TX_COLS = 'id, posted, amount, description, merchant, item_id, account, source, receipt_path, note, details, created_at';

interface Store {
  session: Session;
  items: Item[];
  added: Suggestion[]; // 🆕 bills added by themselves in the last 45 days (the Inbox feed, with Undo)
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
  contacts: Contact[]; // 📇 all of them, hidden ones too ("Not a contact")
  weekend: Weekend | null; // 🎉 the newest "This weekend" list (made on Friday by the morning run)
  settings: Settings;
  status: Status | null;
  statusErr: string;
  loading: boolean;
  reload: () => Promise<void>;
  reloadStatus: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  saveItem: (i: Partial<Item> & { name: string }) => Promise<Item>;
  deleteItem: (id: string) => Promise<void>;
  /** 🆕 Undo a bill that was added by itself: the bill goes, and the find is remembered as "not a bill" (never again). */
  undoBill: (s: Suggestion) => Promise<void>;
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
  /** 📇 Add or edit a card. A new one that matches a card you already have (phone, website, email, name) is merged into it. */
  saveContact: (c: Partial<Contact> & { name: string }) => Promise<{ contact: Contact; merged: boolean }>;
  setContact: (id: string, patch: Partial<Pick<Contact, 'favorite' | 'status'>>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  mergeContacts: (keep: Contact, other: Contact) => Promise<Contact>;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

const check = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export function StoreProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [added, setAdded] = useState<Suggestion[]>([]);
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [weekend, setWeekend] = useState<Weekend | null>(null);
  const [settings, setSettings] = useState<Settings>(withDefaults(null));
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const since = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(`${today()}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10); // this phone's yesterday
    const recent = new Date(Date.now() - 45 * 86400_000).toISOString();
    const [i, s, a, d, st, f, se, p, tx, pu, ld, ap, co, nb] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('suggestions').select('*').eq('status', 'accepted').not('item_id', 'is', null).gte('updated_at', recent).order('updated_at', { ascending: false }).limit(200),
      supabase.from('alerts').select('*').eq('seen', false).order('created_at', { ascending: false }).limit(50),
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('settings').select('data').maybeSingle(),
      supabase.from('findings').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('senders').select('*').order('emails', { ascending: false }).limit(500),
      supabase.from('papers').select('*').order('expires', { ascending: true, nullsFirst: false }),
      // More than 1,000 rows come in pages (Supabase sends at most 1,000 at a time).
      // 🧾 with the receipt columns (a moment after an update they may not exist yet: then without them).
      allRows<SpendTx>((a, b) => supabase.from('transactions').select(TX_COLS).gte('posted', since).order('posted', { ascending: false }).order('external_id').range(a, b), 10000)
        .catch(() => allRows<SpendTx>((a, b) => supabase.from('transactions').select('posted, amount, description, merchant, item_id').gte('posted', since).order('posted', { ascending: false }).order('external_id').range(a, b), 10000))
        .then((data) => ({ data })),
      supabase.from('purchases').select('*').neq('status', 'ignored').order('bought', { ascending: false }).limit(300),
      supabase.from('life_dates').select('*').order('next_date'),
      supabase.from('appointments').select('*').eq('status', 'booked').gte('day', yesterday).order('day').order('time').limit(200),
      supabase.from('contacts').select('*').order('name').limit(3000),
      supabase.from('nearby').select('data').eq('kind', 'weekend').order('updated_at', { ascending: false }).limit(1),
    ]);
    setItems(check(i) ?? []);
    setAdded(((check(s) ?? []) as Suggestion[]).filter((x) => x.evidence?.auto));
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
    setContacts((co.data as Contact[]) ?? []);
    setWeekend(((nb.data?.[0]?.data ?? null) as Weekend | null)); // may not exist for a moment after an update
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
    session, items, added, alerts, docs, findings, senders, papers, spent, tx, purchases, dates, appts, contacts, weekend, settings, status, statusErr, loading, reload, reloadStatus,
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
    undoBill: async (sg) => {
      // Remembered first (so it never comes back), then the bill itself (its heads-ups go with it).
      check(await supabase.from('suggestions').update({ status: 'ignored', item_id: null }).eq('id', sg.id));
      if (sg.item_id) check(await supabase.from('items').delete().eq('id', sg.item_id));
      setAdded((cur) => cur.filter((x) => x.id !== sg.id));
      setItems((cur) => cur.filter((x) => x.id !== sg.item_id));
      setAlerts((cur) => cur.filter((x) => !sg.item_id || x.item_id !== sg.item_id));
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
      delete (row as Partial<Paper>).updated_at;
      const saved = check(await (p.id ? supabase.from('papers').update(row).eq('id', p.id) : supabase.from('papers').insert(row)).select().single()) as Paper;
      setPapers((cur) => [...cur.filter((x) => x.id !== saved.id), saved].sort((a, b) => (a.expires ?? '9') < (b.expires ?? '9') ? -1 : 1));
      return saved;
    },
    deletePaper: async (p) => {
      // 📁 The row and every page / PDF it keeps (in the private bucket).
      const files = [...new Set([...(p.files ?? []), ...(p.photo ? [p.photo] : [])])];
      if (files.length) { const r = await supabase.storage.from('docs').remove(files); if (r.error) throw new Error(r.error.message); }
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
    saveContact: async (c) => {
      const clean = (x: Partial<Contact>) => ({
        name: x.name!.trim().slice(0, 120), kind: x.kind || 'other', person: x.person?.trim() || null, phones: unionPhones(x.phones ?? [], []), emails: unionEmails(x.emails ?? [], []),
        website: x.website?.trim() ? (/^https?:\/\//i.test(x.website.trim()) ? x.website.trim() : `https://${x.website.trim()}`) : null,
        address: x.address?.trim() || null, description: x.description?.trim() || null, notes: x.notes?.trim() || null, favorite: !!x.favorite,
      });
      const put = (row: Contact) => setContacts((cur) => [...cur.filter((x) => x.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name)));
      const fields = clean(c);
      const old = c.id ? contacts.find((x) => x.id === c.id) : contacts.find((x) => sameContact(x, fields));
      if (old) {
        // Your edits (and what you typed for a card you already had) become "set by you": automatic finds never change them.
        const typed = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && !(Array.isArray(v) && !v.length)));
        const next: Contact = c.id ? { ...old, ...fields }
          : { ...old, ...typed, phones: unionPhones(old.phones, fields.phones), emails: unionEmails(old.emails, fields.emails), favorite: old.favorite || fields.favorite, notes: fields.notes || old.notes };
        const mine = [...new Set([...old.mine, ...changedFields(old, next), ...(c.id ? [] : changedFields({}, fields))])];
        const sources = c.id ? old.sources : [...new Set([...old.sources, 'hand' as const])]; // an edit isn't "added by you"
        const saved = check(await supabase.from('contacts').update({ ...clean(next), mine, sources, status: 'active' }).eq('id', old.id).select().single()) as Contact;
        put(saved);
        return { contact: saved, merged: !c.id };
      }
      const mine = changedFields({}, fields);
      const row = { ...fields, user_id: session.user.id, sources: ['hand'], mine, status: 'active', last_seen: today() };
      let key = contactKey(fields);
      for (let n = 0; ; n++) {
        const r = await supabase.from('contacts').insert({ ...row, key }).select().single();
        if (r.error?.code === '23505' && n < 3) { key = `${contactKey(fields)}#${crypto.randomUUID().slice(0, 6)}`; continue; } // same identity text, different place
        const saved = check(r) as Contact;
        put(saved);
        return { contact: saved, merged: false };
      }
    },
    setContact: async (id, patch) => {
      setContacts((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      check(await supabase.from('contacts').update(patch).eq('id', id));
    },
    deleteContact: async (id) => {
      check(await supabase.from('contacts').delete().eq('id', id));
      setContacts((cur) => cur.filter((x) => x.id !== id));
    },
    mergeContacts: async (keep, other) => {
      const m = ownerMerge(keep, other);
      // Delete first: the merged card may take the other one's phone/website (one row per place).
      check(await supabase.from('contacts').delete().eq('id', other.id));
      const saved = check(await supabase.from('contacts').update({ name: m.name, kind: m.kind, person: m.person, phones: m.phones, emails: m.emails, website: m.website, address: m.address, description: m.description, notes: m.notes, favorite: m.favorite, sources: m.sources, mine: m.mine, last_seen: m.last_seen, status: 'active' }).eq('id', keep.id).select().single()) as Contact;
      setContacts((cur) => [...cur.filter((x) => x.id !== keep.id && x.id !== other.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      return saved;
    },
  }), [session, items, added, alerts, docs, findings, senders, papers, spent, tx, purchases, dates, appts, contacts, weekend, settings, status, statusErr, loading, reload, reloadStatus]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
