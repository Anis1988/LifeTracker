import { useState } from 'react';
import { useStore } from '../lib/store';
import { ItemForm, Totals, Upcoming } from '../components/Items';
import { AlertList } from '../components/Inbox';
import { WeekCard } from '../components/Me';
import { weekSummary } from '../../supabase/functions/_shared/week.ts';
import { Sheet, errText, toast } from '../components/ui';
import { api } from '../lib/supabase';
import type { Item } from '../../supabase/functions/_shared/model.ts';

const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export function Home({ go }: { go: (tab: string) => void }) {
  const st = useStore();
  const [open, setOpen] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const r = await api<{ log: { steps: string[]; errors: string[]; newAlerts: number } }>('sync');
      toast(r.log.errors.length ? 'err' : 'ok', r.log.errors.length ? r.log.errors[0] : `Up to date. ${r.log.newAlerts ? `${r.log.newAlerts} new heads-up(s).` : ''}`);
      await Promise.all([st.reload(), st.reloadStatus()]);
    } catch (e) {
      toast('err', errText(e));
    }
    setBusy(false);
  };
  if (!st.loading && !st.items.length) {
    return (
      <div className="card space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Let’s find your bills</h1>
        <p className="text-sm text-stone-600 dark:text-slate-300">Link your bank or Gmail and LifeTracker finds your subscriptions, mortgage, insurance and other bills by itself. Or add one by hand.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => go('settings')}>🔗 Connect bank / Google</button>
          <button className="btn" onClick={() => go('inbox')}>📄 Upload a bill</button>
          <button className="btn" onClick={() => go('bills')}>＋ Add by hand</button>
        </div>
        {st.suggestions.length > 0 && <button className="btn-ghost mx-auto" onClick={() => go('inbox')}>🔎 {st.suggestions.length} found, waiting for your OK →</button>}
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Totals items={st.items} />
        {st.suggestions.length > 0 && (
          <button className="card flex w-full items-center gap-3 text-left !border-emerald-300 dark:!border-emerald-800" onClick={() => go('inbox')}>
            <span className="text-2xl">🔎</span>
            <span className="flex-1"><b>{st.suggestions.length} found</b> automatically: add them or ignore them.</span>
            <span aria-hidden="true">→</span>
          </button>
        )}
        <AlertList alerts={st.alerts} onSeen={(id) => void st.seeAlert(id)} />
      </div>
      <div className="space-y-4">
        <WeekCard lines={weekSummary({ items: st.items, findings: st.findings, senders: st.senders, papers: st.settings.papers.on ? st.papers : [], settings: st.settings, spent: st.spent })} onOpen={() => go('me')} />
        <Upcoming items={st.items} onOpen={setOpen} />
        <section className="card flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-stone-600 dark:text-slate-300">🔄 Automatic check: {ago(st.status?.lastRun?.lastRun)}{st.status?.lastRun?.errors?.length ? ` · ⚠ ${st.status.lastRun.errors[0]}` : ''}</span>
          <button className="btn" disabled={busy} onClick={() => void sync()}>{busy ? <><span className="spinner" /> Checking…</> : 'Sync now'}</button>
        </section>
      </div>
      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <ItemForm item={open} onSave={st.saveItem} onDelete={() => st.deleteItem(open.id)} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </div>
  );
}
