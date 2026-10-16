import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { CsvImport, DocRow, SuggestionCard, Uploader } from '../components/Inbox';
import { ItemForm } from '../components/Items';
import { Empty, Sheet, errText, toast } from '../components/ui';
import { PAPER_DEFAULTS, type Doc, type Item, type Suggestion } from '../../supabase/functions/_shared/model.ts';
import { supabase } from '../lib/supabase';

// A document that isn't a bill (a contract, a certificate…) can move to the Vault: same file, no copy.
const FOLDER: Record<string, string> = { insurance: 'insurance', car: 'car', health: 'medical', tax: 'taxes', mortgage: 'home', rent: 'home', utility: 'home', loan: 'legal' };

/** What was found automatically (bank, email, documents), waiting for your OK, and your documents. */
export function Inbox() {
  const st = useStore();
  const [adding, setAdding] = useState<Suggestion | null>(null);
  const saved = useRef<{ for: string; item: Item } | null>(null); // a retry after an error doesn't add the bill twice
  const prefill = (s: Suggestion): Partial<Item> => ({
    name: s.name, category: s.category ?? 'other', amount: Number(s.amount ?? 0), currency: s.currency ?? 'USD', cycle: s.cycle ?? 'monthly',
    next_due: s.next_due, ends_on: s.ends_on, trial_ends: s.trial_ends, merchant: s.merchant, details: s.details ?? {}, source: s.source,
    autopay: s.source === 'bank',
  });
  const move = async (d: Doc) => {
    try {
      const x = d.extracted;
      const saved = await st.savePaper({ ...PAPER_DEFAULTS, name: (x?.name || d.file_name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 120), folder: FOLDER[x?.category ?? ''] ?? 'other', files: [d.path], file_hash: d.hash ?? null, summary: x?.summary || null, notes: d.origin ?? `Moved from Inbox documents (${d.file_name})`, source: 'inbox', ai_by: d.ai_by });
      const r = await supabase.from('documents').delete().eq('id', d.id); // the row only: the file now belongs to the Vault document
      if (r.error) throw new Error(r.error.message);
      await st.reload();
      toast('ok', 'Moved to your Vault.');
      location.hash = `#/vault?doc=${saved.id}`;
    } catch (e) { toast('err', errText(e)); }
  };
  const ignore = async (s: Suggestion) => {
    try { await st.setSuggestion(s.id, { status: 'ignored' }); toast('info', `${s.name}: ignored. It won’t be suggested again.`); } catch (e) { toast('err', errText(e)); }
  };
  return (
    <div className="stagger mx-auto max-w-2xl space-y-4">
      <h1 className="text-[28px] font-semibold leading-tight">Inbox</h1>
      <section className="space-y-3">
        <p className="label">Found for you ({st.suggestions.length})</p>
        {st.suggestions.length ? st.suggestions.map((s) => <SuggestionCard key={s.id} s={s} onAdd={() => setAdding(s)} onIgnore={() => void ignore(s)} />)
          : <Empty icon="📬">Nothing waiting. New bills found in your bank, Gmail or documents show up here for your OK; nothing is added without it.</Empty>}
      </section>
      <section className="space-y-3">
        <p className="label">Bills & money documents</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Other papers (pet records, IDs, contracts…) belong in 📁 Vault.</p>
        <Uploader userId={st.session.user.id} onDone={() => void st.reload()} />
        <div className="panel flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <CsvImport onDone={() => void st.reload()} />
          <span className="min-w-0 flex-1 basis-48">No bank link? Download your transactions as CSV and the recurring ones are found.</span>
        </div>
        {st.docs.map((d) => <DocRow key={d.id} d={d} onChange={() => void st.reload()} onMove={() => void move(d)} />)}
      </section>
      {adding && (
        <Sheet title="Add to my bills" onClose={() => setAdding(null)}>
          <ItemForm item={prefill(adding)} onDone={() => setAdding(null)} onSave={async (i) => {
            const item = saved.current?.for === adding.id ? await st.saveItem({ ...i, id: saved.current.item.id }) : await st.saveItem(i);
            saved.current = { for: adding.id, item };
            await st.setSuggestion(adding.id, { status: 'accepted', item_id: item.id });
            toast('ok', `${item.name} added.`);
          }} />
        </Sheet>
      )}
    </div>
  );
}
