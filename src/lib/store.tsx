import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, supabase } from './supabase';
import { withDefaults, type Alert, type Doc, type Item, type Settings, type Suggestion } from '../../supabase/functions/_shared/model.ts';

/** What the server reports (bank, Google, AI use today, last automatic run, which keys are set). */
export interface Status {
  plaid?: { kind: string; institution: string; lastSync: string | null; accounts: { name: string; balance: number; currency: string }[]; error: string | null; needsLogin: boolean }[];
  bank: { connected: boolean; lastSync?: string | null; accounts?: { name: string; balance: number; currency: string }[]; errors?: string[] };
  google: { connected: boolean; email?: string | null; calendar?: boolean; gmail?: boolean; lastGmail?: string | null };
  lastRun: { lastRun?: string; steps?: string[]; errors?: string[] } | null;
  aiUsed: Record<string, number>;
  keys: Record<'plaid' | 'gemini' | 'groq' | 'openrouter' | 'claude' | 'google' | 'email' | 'secret', boolean>;
  email?: string;
}

interface Store {
  session: Session;
  items: Item[];
  suggestions: Suggestion[];
  alerts: Alert[];
  docs: Doc[];
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
  const [settings, setSettings] = useState<Settings>(withDefaults(null));
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [i, s, a, d, st] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('suggestions').select('*').eq('status', 'new').order('created_at', { ascending: false }),
      supabase.from('alerts').select('*').eq('seen', false).order('created_at', { ascending: false }).limit(50),
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('settings').select('data').maybeSingle(),
    ]);
    setItems(check(i) ?? []);
    setSuggestions(check(s) ?? []);
    setAlerts(check(a) ?? []);
    setDocs(check(d) ?? []);
    setSettings(withDefaults((st.data?.data ?? null) as Partial<Settings> | null));
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
    // Back to the app (another device or the morning run may have changed things): fresh data.
    const back = () => document.visibilityState === 'visible' && void reload().catch(() => undefined);
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [reload, reloadStatus]);

  const store = useMemo<Store>(() => ({
    session, items, suggestions, alerts, docs, settings, status, statusErr, loading, reload, reloadStatus,
    saveSettings: async (s) => {
      setSettings(s);
      check(await supabase.from('settings').upsert({ user_id: session.user.id, data: s }));
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
  }), [session, items, suggestions, alerts, docs, settings, status, statusErr, loading, reload, reloadStatus]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
