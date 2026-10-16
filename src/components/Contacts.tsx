import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CONTACT_KINDS, contactKind, type Contact, type ContactSource } from '../../supabase/functions/_shared/model.ts';
import { fmtPhone, matchContact, nameTokens } from '../../supabase/functions/_shared/contacts.ts';
import { Toggle, errText, shortDate, toast } from './ui';

/** 📇 Contacts: rows, the card, the add/edit form, the kind chips and the merge picker. Also drawn in the Guide (made-up, no buttons). */

export const SOURCES: Record<ContactSource, { icon: string; label: string }> = {
  email: { icon: '✉️', label: 'Gmail' }, hand: { icon: '✍️', label: 'Added by you' }, appt: { icon: '📅', label: 'Appointment' }, bill: { icon: '🧾', label: 'Bill' }, purchase: { icon: '🛍️', label: 'Purchase' },
};
export const siteText = (w: string) => w.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
export const mapUrl = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
const seen = (d: string | null) => (d ? `seen ${shortDate(d)}` : '');

const PhoneIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
);

/** One row: icon, name (★), who / kind, description; a call button on the right. */
export function ContactRow({ c, onOpen }: { c: Contact; onOpen?: () => void }) {
  const k = contactKind(c.kind);
  const sub = [c.person, k.label].filter(Boolean).join(' · ');
  return (
    <li className="flex items-center gap-1 border-t border-slate-900/[0.06] first:border-0 dark:border-white/[0.06]">
      <button className="tap -ml-1 flex min-h-[64px] min-w-0 flex-1 items-center gap-3 rounded-[20px] px-1 py-2.5 text-left" onClick={onOpen} aria-label={`${c.name}, ${k.label}`}>
        <span className="tile" aria-hidden="true">{k.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5"><span className="truncate font-semibold">{c.name}</span>{c.favorite && <span className="shrink-0 text-amber-500 dark:text-amber-300" aria-label="favourite">★</span>}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub}{c.phones[0] ? ` · ${fmtPhone(c.phones[0])}` : c.website ? ` · ${siteText(c.website)}` : ''}</span>
          {c.description && <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{c.description}</span>}
        </span>
      </button>
      {c.phones[0] ? (
        <a href={tel(c.phones[0])} className="btn h-11 w-11 shrink-0 !rounded-full !p-0 text-teal-700 dark:text-teal-200" aria-label={`Call ${c.name}`}><PhoneIcon /></a>
      ) : <span className="w-1" aria-hidden="true" />}
    </li>
  );
}

/** A titled group of rows (★ Favourites, 🦷 Dentist…). */
export function ContactGroup({ title, list, onOpen }: { title: string; list: Contact[]; onOpen?: (c: Contact) => void }) {
  return (
    <section className="card !px-3 !py-2">
      <p className="label px-1 pb-0.5 pt-1.5">{title} <span className="num">· {list.length}</span></p>
      <ul>{list.map((c) => <ContactRow key={c.id} c={c} onOpen={onOpen && (() => onOpen(c))} />)}</ul>
    </section>
  );
}

/** The kind chips: scroll sideways; a glass pill slides to the chosen one. */
export function KindChips({ options, value, onChange }: { options: { id: string; label: string; n: number }[]; value: string; onChange: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el) return setPill(null);
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
    const box = ref.current!;
    if (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = el.offsetLeft - 16;
  }, [value, options.map((o) => o.id + o.n).join()]);
  return (
    <div ref={ref} role="tablist" aria-label="Kind" className="no-bar relative -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1">
      {pill && <span aria-hidden="true" className="chippill" style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} />}
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} onClick={() => onChange(o.id)}
          className={`chip relative z-[1] border-slate-900/10 bg-transparent dark:border-white/10 ${o.id === value ? '!border-transparent text-[#04121a]' : 'text-slate-600 dark:text-slate-300'}`}>
          {o.label}<span className={`num text-[11px] ${o.id === value ? 'opacity-70' : 'text-slate-400 dark:text-slate-500'}`}>{o.n}</span>
        </button>
      ))}
    </div>
  );
}

/** The search box: everything, on the device, as you type. */
export function SearchBox({ q, onChange }: { q: string; onChange: (q: string) => void }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input className="input w-full !rounded-[20px] pl-10 pr-12" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" placeholder="Name, phone, street, kind…" value={q} onChange={(e) => onChange(e.target.value)} aria-label="Search contacts" />
      {q && <button className="btn-ghost absolute right-0.5 top-1/2 -translate-y-1/2 !rounded-full text-slate-400" aria-label="Clear the search" onClick={() => onChange('')}>✕</button>}
    </div>
  );
}

/** Filter + search + sort + groups: favourites first, then by kind (A–Z), or one list newest first (Recent) or for a search. */
export function arrange(list: Contact[], o: { q: string; kind: string; sort: 'name' | 'recent' }): { title: string; list: Contact[] }[] {
  const shown = list.filter((c) => c.status === 'active' && (o.kind === 'all' || (o.kind === 'fav' ? c.favorite : c.kind === o.kind)) && matchContact(c, o.q));
  const by = o.sort === 'recent' ? (a: Contact, b: Contact) => (b.last_seen ?? '').localeCompare(a.last_seen ?? '') || a.name.localeCompare(b.name) : (a: Contact, b: Contact) => a.name.localeCompare(b.name);
  shown.sort(by);
  if (o.q.trim()) return shown.length ? [{ title: `Found`, list: shown }] : [];
  const fav = o.kind === 'fav' ? [] : shown.filter((c) => c.favorite);
  const rest = o.kind === 'fav' ? shown : shown.filter((c) => !c.favorite);
  const groups: { title: string; list: Contact[] }[] = [];
  if (fav.length) groups.push({ title: '★ Favourites', list: fav });
  if (o.sort === 'recent' || o.kind !== 'all') { if (rest.length) groups.push({ title: o.sort === 'recent' ? 'Most recent first' : o.kind === 'fav' ? '★ Favourites' : `${contactKind(o.kind).icon} ${contactKind(o.kind).label}`, list: rest }); }
  else for (const k of CONTACT_KINDS) { const l = rest.filter((c) => (CONTACT_KINDS.some((x) => x.id === c.kind) ? c.kind : 'other') === k.id); if (l.length) groups.push({ title: `${k.icon} ${k.label}`, list: l }); }
  return groups;
}

/** The kind chips' choices: All, ★, then the kinds you have (with counts). */
export function kindOptions(list: Contact[]) {
  const act = list.filter((c) => c.status === 'active');
  return [
    { id: 'all', label: 'All', n: act.length },
    ...(act.some((c) => c.favorite) ? [{ id: 'fav', label: '★', n: act.filter((c) => c.favorite).length }] : []),
    ...CONTACT_KINDS.map((k) => ({ id: k.id, label: `${k.icon} ${k.label}`, n: act.filter((c) => c.kind === k.id).length })).filter((o) => o.n > 0),
  ];
}

/** The card: tap to call, open the website, the map, write an email; where it came from; your actions. */
export function ContactDetails({ c, onEdit, onFavorite, onHide, onDelete, onMerge }: { c: Contact; onEdit?: () => void; onFavorite?: () => void; onHide?: () => void; onDelete?: () => void; onMerge?: () => void }) {
  const k = contactKind(c.kind);
  const auto = c.sources.some((s) => s !== 'hand');
  const actions = [
    c.phones[0] && { href: tel(c.phones[0]), label: 'Call', icon: '📞' },
    c.website && { href: c.website, label: 'Website', icon: '🌐', out: true },
    c.address && { href: mapUrl(c.address), label: 'Map', icon: '📍', out: true },
    c.emails[0] && { href: `mailto:${c.emails[0]}`, label: 'Email', icon: '✉️' },
  ].filter(Boolean) as { href: string; label: string; icon: string; out?: boolean }[];
  const mineLabels: Record<string, string> = { name: 'name', kind: 'kind', person: 'person', phones: 'phone', emails: 'email', website: 'website', address: 'address', description: 'description' };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="tile !h-14 !w-14 !text-2xl" aria-hidden="true">{k.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="label">{k.label}{c.favorite ? ' · ★ favourite' : ''}</p>
          {c.person && <p className="truncate text-[15px] font-semibold">{c.person}</p>}
          {c.description && <p className="text-sm text-slate-600 dark:text-slate-300">{c.description}</p>}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
          {actions.map((a) => (
            <a key={a.label} href={a.href} {...(a.out ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="btn !min-h-[60px] flex-col !gap-0.5 !px-1 text-xs">
              <span className="text-lg leading-none" aria-hidden="true">{a.icon}</span>{a.label}
            </a>
          ))}
        </div>
      )}
      <div className="panel space-y-0 !py-1 text-sm">
        {c.phones.map((p) => <Line key={p} icon="📞" label="Phone"><a className="num font-semibold text-teal-800 underline decoration-dotted underline-offset-2 dark:text-teal-200" href={tel(p)}>{fmtPhone(p)}</a></Line>)}
        {c.website && <Line icon="🌐" label="Website"><a className="break-all font-semibold text-teal-800 underline decoration-dotted underline-offset-2 dark:text-teal-200" href={c.website} target="_blank" rel="noopener noreferrer">{siteText(c.website)}</a></Line>}
        {c.address && <Line icon="📍" label="Address"><a className="font-semibold text-teal-800 underline decoration-dotted underline-offset-2 dark:text-teal-200" href={mapUrl(c.address)} target="_blank" rel="noopener noreferrer">{c.address}</a></Line>}
        {c.emails.map((e) => <Line key={e} icon="✉️" label="Email"><a className="break-all font-semibold text-teal-800 underline decoration-dotted underline-offset-2 dark:text-teal-200" href={`mailto:${e}`}>{e}</a></Line>)}
        {c.notes && <Line icon="📝" label="Notes"><span className="whitespace-pre-line">{c.notes}</span></Line>}
        {!c.phones.length && !c.website && !c.address && !c.emails.length && !c.notes && <p className="py-2 text-slate-500 dark:text-slate-400">No phone, website or address yet. They’re added when an email has them, or tap Edit.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {c.sources.map((s) => <span key={s} className="chip border-slate-900/10 px-2 py-0.5 text-slate-600 dark:border-white/10 dark:text-slate-300">{SOURCES[s].icon} {SOURCES[s].label}</span>)}
        {c.last_seen && <span>· last {seen(c.last_seen)}</span>}
      </div>
      {c.mine.length > 0 && auto && <p className="text-xs text-slate-500 dark:text-slate-400">✍️ Set by you: {c.mine.map((m) => mineLabels[m] ?? m).join(', ')}. Automatic finds never change these.</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={onFavorite}>{c.favorite ? '★ Favourite' : '☆ Favourite'}</button>
        <button className="btn" onClick={onEdit}>✎ Edit</button>
        <button className="btn" onClick={onMerge}>⇄ Same as…</button>
        {auto
          ? <button className="btn text-red-700 dark:text-red-300" onClick={onHide}>✕ Not a contact</button>
          : <button className="btn text-red-700 dark:text-red-300" onClick={onDelete}>🗑 Delete</button>}
      </div>
      {auto && <p className="text-xs text-slate-500 dark:text-slate-400">“Not a contact” takes it off for good: it won’t come back from your emails.</p>}
    </div>
  );
}

function Line({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="field flex min-h-[48px] items-center gap-3 py-2">
      <span className="w-6 shrink-0 text-center" aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

const split = (s: string) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

/** Add or edit by hand. What you type is yours: automatic finds never overwrite it. */
export function ContactForm({ c, onSave, onDone }: { c: Partial<Contact>; onSave: (c: Partial<Contact> & { name: string }) => Promise<{ contact: Contact; merged: boolean }>; onDone: (saved?: Contact) => void }) {
  const [x, setX] = useState({
    name: c.name ?? '', kind: c.kind ?? 'other', person: c.person ?? '', phones: (c.phones ?? []).map(fmtPhone).join(', '), website: c.website ? siteText(c.website) : '',
    address: c.address ?? '', emails: (c.emails ?? []).join(', '), description: c.description ?? '', notes: c.notes ?? '', favorite: !!c.favorite,
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof x>) => setX((cur) => ({ ...cur, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await onSave({ ...c, ...x, name: x.name.trim(), phones: split(x.phones), emails: split(x.emails), website: x.website.trim() || null, person: x.person || null, address: x.address || null, description: x.description || null, notes: x.notes || null });
      toast('ok', r.merged ? `You already had ${r.contact.name}: added to that card.` : 'Saved.');
      onDone(r.contact);
    } catch (e) { toast('err', errText(e)); }
    setBusy(false);
  };
  const L = 'block text-sm font-semibold';
  return (
    <div className="space-y-3">
      <label className={L}>Name<input className="input mt-1 w-full" value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Smile Dental" autoComplete="off" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={L}>Kind<select className="input mt-1 w-full" value={x.kind} onChange={(e) => set({ kind: e.target.value })}>{CONTACT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}</select></label>
        <label className={L}>Person<input className="input mt-1 w-full" value={x.person} onChange={(e) => set({ person: e.target.value })} placeholder="e.g. Dr. Patel" autoComplete="off" /></label>
      </div>
      <label className={L}>Phone<input className="input mt-1 w-full" type="tel" inputMode="tel" value={x.phones} onChange={(e) => set({ phones: e.target.value })} placeholder="(555) 010-0100, …" /></label>
      <label className={L}>Website<input className="input mt-1 w-full" type="url" inputMode="url" value={x.website} onChange={(e) => set({ website: e.target.value })} placeholder="smiledental.example" autoCapitalize="off" /></label>
      <label className={L}>Address<input className="input mt-1 w-full" value={x.address} onChange={(e) => set({ address: e.target.value })} placeholder="12 Main St, Springfield" /></label>
      <label className={L}>Email<input className="input mt-1 w-full" type="email" inputMode="email" value={x.emails} onChange={(e) => set({ emails: e.target.value })} placeholder="office@smiledental.example" autoCapitalize="off" /></label>
      <label className={L}>Short description<input className="input mt-1 w-full" value={x.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Our family dentist" /></label>
      <label className={L}>Notes<textarea className="input mt-1 min-h-[88px] w-full py-2" value={x.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Opening hours, parking, what to bring…" /></label>
      <div className="flex min-h-[48px] items-center justify-between gap-3"><span className="text-sm font-semibold">★ Favourite (always at the top)</span><Toggle on={x.favorite} onChange={(v) => set({ favorite: v })} label="Favourite" /></div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy || !x.name.trim()} onClick={() => void save()}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn" onClick={() => onDone()}>Cancel</button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">What you type here is yours: finds from your emails can add a missing phone or address, but never change it.</p>
    </div>
  );
}

/** "Same as…": pick the card that is the same place (closest names first); both become one. */
export function MergePicker({ c, list, onPick }: { c: Contact; list: Contact[]; onPick: (other: Contact) => void }) {
  const [q, setQ] = useState('');
  const mine = new Set(nameTokens(c.name));
  const others = useMemo(() => list.filter((x) => x.id !== c.id && x.status === 'active' && x.kind !== undefined && matchContact(x, q))
    .map((x) => ({ x, score: nameTokens(x.name).filter((w) => mine.has(w)).length + (x.kind === c.kind ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score || a.x.name.localeCompare(b.x.name)).map((o) => o.x), [list, c, q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">Which card is the same place as <b>{c.name}</b>? They become one card with the phones, emails and details of both.</p>
      <SearchBox q={q} onChange={setQ} />
      <ul>{others.slice(0, 60).map((x) => <ContactRow key={x.id} c={x} onOpen={() => onPick(x)} />)}</ul>
      {!others.length && <p className="text-sm text-slate-500 dark:text-slate-400">No other card{q ? ' matches' : ''}.</p>}
    </div>
  );
}
