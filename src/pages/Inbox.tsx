import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { CsvImport, DocRow, SuggestionCard, Uploader } from '../components/Inbox';
import { ItemForm } from '../components/Items';
import { Sheet, errText, toast } from '../components/ui';
import type { Item, Suggestion } from '../../supabase/functions/_shared/model.ts';

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
  const ignore = async (s: Suggestion) => {
    try { await st.setSuggestion(s.id, { status: 'ignored' }); toast('info', `${s.name}: ignored. It won’t be suggested again.`); } catch (e) { toast('err', errText(e)); }
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <section className="space-y-3">
        <p className="label">Found for you ({st.suggestions.length})</p>
        {st.suggestions.length ? st.suggestions.map((s) => <SuggestionCard key={s.id} s={s} onAdd={() => setAdding(s)} onIgnore={() => void ignore(s)} />)
          : <p className="card text-sm text-stone-500">Nothing waiting. New bills found in your bank, Gmail or documents show up here for your OK; nothing is added without it.</p>}
      </section>
      <section className="space-y-3">
        <p className="label">Documents</p>
        <Uploader userId={st.session.user.id} onDone={() => void st.reload()} />
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-slate-300">
          <CsvImport onDone={() => void st.reload()} />
          <span>No bank link? Download your transactions as CSV and the recurring ones are found.</span>
        </div>
        {st.docs.map((d) => <DocRow key={d.id} d={d} onChange={() => void st.reload()} />)}
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
