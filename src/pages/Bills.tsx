import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { ItemForm, ItemRow, Totals } from '../components/Items';
import { Empty, Money, Sheet, errText, toast } from '../components/ui';
import { AddedRow } from '../components/Inbox';
import { addedFeed } from '../lib/added';
import { CATEGORIES, type Item } from '../../supabase/functions/_shared/model.ts';
import { monthly } from '../../supabase/functions/_shared/money.ts';

export function Bills() {
  const st = useStore();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'all' | 'cancelled'>('active');
  const [open, setOpen] = useState<Partial<Item> | null>(null);
  const list = useMemo(() => st.items.filter((i) => (show === 'all' ? true : show === 'active' ? i.status !== 'cancelled' : i.status === 'cancelled'))
    .filter((i) => !q || `${i.name} ${i.merchant ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(q.toLowerCase())), [st.items, q, show]);
  // 🆕 Bills added by themselves in the last 14 days (bank, bill emails, documents), each with ↶ Undo (remembered).
  const fresh = useMemo(() => addedFeed({ ...st, tx: [], papers: [], contacts: [], appts: [] }, 14), [st]);
  const freshIds = new Set(fresh.map((e) => st.added.find((x) => x.id === e.id)?.item_id));
  const [busy, setBusy] = useState('');
  const undo = async (id: string, name: string) => {
    const sg = st.added.find((x) => x.id === id);
    if (!sg) return;
    setBusy(id);
    try { await st.undoBill(sg); toast('ok', `${name}: removed. It won’t be added again.`); } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const groups = CATEGORIES.map((c) => ({ c, items: list.filter((i) => i.category === c.id) })).filter((g) => g.items.length);
  return (
    <div className="stagger space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[28px] font-semibold leading-tight">My bills</h1>
        <button className="btn-primary" onClick={() => setOpen({})}>＋ Add</button>
      </div>
      {fresh.length > 0 && (
        <section className="card !px-3 !py-2 !border-teal-400/40">
          <p className="label px-1 pb-0.5 pt-1.5">🆕 Added by itself <span className="num">· {fresh.length}</span></p>
          <ul>{fresh.map((e) => <AddedRow key={e.key} e={e} busy={busy === e.id} onUndo={() => void undo(e.id, e.title)} onOpen={() => { const it = st.items.find((x) => x.id === st.added.find((s) => s.id === e.id)?.item_id); if (it) setOpen(it); }} />)}</ul>
          <p className="px-1 pb-1.5 text-[11px] text-slate-500 dark:text-slate-400">Found in your bank, emails or documents and added for you. Tap one to change it; ↶ Undo takes it away for good.</p>
        </section>
      )}
      {st.items.length > 0 && <Totals items={st.items} />}
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="input w-[128px] shrink-0" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
          <option value="active">Active</option><option value="cancelled">Cancelled</option><option value="all">All</option>
        </select>
      </div>
      {groups.length ? groups.map(({ c, items }) => (
        <section key={c.id} className="card !px-2 !py-2">
          <div className="flex items-baseline justify-between px-2 pb-1 pt-1.5">
            <p className="label">{c.icon} {c.label}</p>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400"><Money n={items.filter((i) => i.status === 'active').reduce((t, i) => t + monthly(i), 0)} />/mo</span>
          </div>
          {items.map((i) => <ItemRow key={i.id} i={i} fresh={freshIds.has(i.id)} onOpen={() => setOpen(i)} />)}
        </section>
      )) : <Empty icon={st.items.length ? '🔍' : '📋'}>{st.items.length ? 'Nothing matches.' : 'No bills yet. Tap ＋ Add, or let them be found and added by themselves: Settings → connect Gmail (bank alert emails, bill emails).'}</Empty>}
      {open && (
        <Sheet title={open.id ? open.name ?? 'Bill' : 'New bill'} onClose={() => setOpen(null)}>
          <ItemForm item={open} onSave={st.saveItem} onDelete={open.id ? () => st.deleteItem(open.id!) : undefined} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </div>
  );
}
