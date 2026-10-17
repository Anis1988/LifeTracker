import { useEffect, useMemo, useRef, useState } from 'react';
import { goTo, takeParam } from '../lib/nav';
import { useStore } from '../lib/store';
import { AddedList, CsvImport, DocRow, Uploader } from '../components/Inbox';
import { Empty, errText, toast } from '../components/ui';
import { PAPER_DEFAULTS, type Doc } from '../../supabase/functions/_shared/model.ts';
import { api, supabase } from '../lib/supabase';
import { addedFeed, markSeen, type AddedEntry } from '../lib/added';

// A document that isn't a bill (a contract, a certificate…) can move to the Vault: same file, no copy.
const FOLDER: Record<string, string> = { insurance: 'insurance', car: 'car', health: 'medical', tax: 'taxes', mortgage: 'home', rent: 'home', utility: 'home', loan: 'legal' };

/**
 * 🔔 Inbox = what was added by itself lately (owner's choice: fully automatic, nothing waits for an OK), each with
 * ↶ Undo (remembered: it won't come back), plus your bill documents and the bank CSV import.
 */
/** ↶ Undo and "open where it went" for the What-was-added feed (the Inbox page and Home's card). */
export function useAddedActions() {
  const st = useStore();
  const [busy, setBusy] = useState('');
  // ↶ Undo: takes it away and remembers it, so the same find never comes back.
  const undo = async (e: AddedEntry) => {
    setBusy(e.key);
    try {
      if (e.kind === 'bill') { const s = st.added.find((x) => x.id === e.id); if (s) await st.undoBill(s); }
      else if (e.kind === 'receipt') { const t = st.tx.find((x) => x.id === e.id); await api('receipt', { op: 'delete', id: e.id, entry: t?.source === 'receipt' }); await st.reload(); }
      else if (e.kind === 'doc') { const p = st.papers.find((x) => x.id === e.id); if (p) await st.deletePaper(p); }
      else if (e.kind === 'contact') await st.setContact(e.id, { status: 'hidden' });
      else if (e.kind === 'appt') await st.removeAppt(e.id);
      toast('ok', `${e.title}: removed. It won’t be added again.`);
    } catch (err) { toast('err', errText(err)); }
    setBusy('');
  };
  const open = (e: AddedEntry) => {
    if (e.kind === 'bill') { const item = st.added.find((x) => x.id === e.id)?.item_id; goTo('money', 'bills', item ? `?item=${item}` : ''); }
    else if (e.kind === 'receipt') goTo('money', 'spending', `?tx=${e.id}`);
    else if (e.kind === 'doc') goTo('me', 'vault', `?doc=${e.id}`);
    else if (e.kind === 'contact') goTo('places', 'contacts', `?c=${e.id}`);
    else goTo('home', undefined, e.kind === 'appt' ? `?appt=${e.id}` : '');
  };
  return { busy, undo, open };
}

export function Inbox() {
  const st = useStore();
  const { busy, undo, open } = useAddedActions();
  const feed = useMemo(() => addedFeed(st), [st]);
  useEffect(() => { markSeen(); }, [feed.length]);
  // ＋ → "A bill as a photo or PDF" lands here with "?add": straight to the upload box.
  const upload = useRef<HTMLElement>(null);
  useEffect(() => { if (takeParam('add', '#/inbox') !== null) setTimeout(() => upload.current?.scrollIntoView({ block: 'start' }), 80); }, []);
  const move = async (d: Doc) => {
    try {
      const x = d.extracted;
      const saved = await st.savePaper({ ...PAPER_DEFAULTS, name: (x?.name || d.file_name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 120), folder: FOLDER[x?.category ?? ''] ?? 'other', files: [d.path], file_hash: d.hash ?? null, summary: x?.summary || null, notes: d.origin ?? `Moved from Inbox documents (${d.file_name})`, source: 'inbox', ai_by: d.ai_by });
      const r = await supabase.from('documents').delete().eq('id', d.id); // the row only: the file now belongs to the Vault document
      if (r.error) throw new Error(r.error.message);
      await st.reload();
      toast('ok', 'Moved to your Vault.');
      goTo('me', 'vault', `?doc=${saved.id}`);
    } catch (e) { toast('err', errText(e)); }
  };
  return (
    <div className="stagger mx-auto max-w-2xl space-y-4">
      <div>
        <p className="label">Added by itself · last 30 days</p>
        <h1 className="text-[28px] font-semibold leading-tight">Inbox</h1>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">LifeTracker adds what it finds by itself: bills, receipts, documents, contacts and appointments. Something wrong? Tap <b>↶ Undo</b>: it’s taken away and won’t come back. It never pays, cancels or moves money.</p>
      {feed.length ? <AddedList list={feed} busy={busy} onUndo={(e) => void undo(e)} onOpen={open} />
        : <Empty icon="📬">Nothing new lately. Bills found in your bank, Gmail or documents, receipts, documents, contacts and appointments show up here once they’re added.</Empty>}
      <section ref={upload} className="scroll-mt-24 space-y-3">
        <p className="label">Bills & money documents</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">A bill you add here is read at once and goes straight into your bills. Other papers (pet records, IDs, contracts…) belong in 📁 Vault.</p>
        <Uploader userId={st.session.user.id} onDone={() => void st.reload()} />
        <div className="panel flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <CsvImport onDone={() => void st.reload()} />
          <span className="min-w-0 flex-1 basis-48">No bank link? Download your transactions as CSV and the recurring ones are added to your bills.</span>
        </div>
        {st.docs.map((d) => <DocRow key={d.id} d={d} onChange={() => void st.reload()} onMove={() => void move(d)} />)}
      </section>
    </div>
  );
}
