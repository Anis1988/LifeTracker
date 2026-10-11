import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { ItemForm, ItemRow } from '../components/Items';
import { Money, Sheet } from '../components/ui';
import { CATEGORIES, type Item } from '../../supabase/functions/_shared/model.ts';
import { monthly } from '../../supabase/functions/_shared/money.ts';

export function Bills() {
  const st = useStore();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'all' | 'cancelled'>('active');
  const [open, setOpen] = useState<Partial<Item> | null>(null);
  const list = useMemo(() => st.items.filter((i) => (show === 'all' ? true : show === 'active' ? i.status !== 'cancelled' : i.status === 'cancelled'))
    .filter((i) => !q || `${i.name} ${i.merchant ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(q.toLowerCase())), [st.items, q, show]);
  const groups = CATEGORIES.map((c) => ({ c, items: list.filter((i) => i.category === c.id) })).filter((g) => g.items.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">My bills</h1>
        <button className="btn-primary" onClick={() => setOpen({})}>＋ Add</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="input" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
          <option value="active">Active</option><option value="cancelled">Cancelled</option><option value="all">All</option>
        </select>
      </div>
      {groups.length ? groups.map(({ c, items }) => (
        <section key={c.id} className="card !px-2 !py-2">
          <div className="flex items-baseline justify-between px-2 pt-1">
            <p className="label">{c.icon} {c.label}</p>
            <span className="text-xs text-stone-500"><Money n={items.filter((i) => i.status === 'active').reduce((t, i) => t + monthly(i), 0)} />/mo</span>
          </div>
          {items.map((i) => <ItemRow key={i.id} i={i} onOpen={() => setOpen(i)} />)}
        </section>
      )) : <p className="card text-sm text-stone-500">{st.items.length ? 'Nothing matches.' : 'No bills yet. Tap ＋ Add, or let them be found: Settings → link your bank or Gmail.'}</p>}
      {open && (
        <Sheet title={open.id ? open.name ?? 'Bill' : 'New bill'} onClose={() => setOpen(null)}>
          <ItemForm item={open} onSave={st.saveItem} onDelete={open.id ? () => st.deleteItem(open.id!) : undefined} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </div>
  );
}
