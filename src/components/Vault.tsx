import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PAPER_DEFAULTS, VAULT_FOLDERS, folderOf, personIcon, type Paper, type Settings, type VaultPerson } from '../../supabase/functions/_shared/model.ts';
import { PAPER_KINDS } from '../../supabase/functions/_shared/people.ts';
import { daysTo, docIcon, holderText, matchDoc, personOf } from '../../supabase/functions/_shared/vaultText.ts';
import { today } from '../../supabase/functions/_shared/money.ts';
import { ListInput, Seg, Toggle, errText, shortDate, toast } from './ui';
import { combine, downloadFile, fileKind, fileName, openFile, sha256, shareFiles, shrink, signedUrls, safeName, type Page } from '../lib/vault';
import { supabase } from '../lib/supabase';

/** 📁 Vault pieces: rows, the document card, the full-screen viewer, the scan / edit form, the PIN pad and lock screen,
 * people & pets. Also drawn in the Guide with made-up data (no working buttons there). */

const SOURCE: Record<Paper['source'], string> = { hand: '✍️ Added by you', scan: '📷 Scanned', email: '✉️ From email', inbox: '📄 Moved from Inbox' };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "in 12 days", "due in 3 days", "expired", with the right colour. */
export function DueText({ p, now = today() }: { p: Paper; now?: string }) {
  const left = daysTo(p, now);
  if (left == null) return null;
  const due = p.due_kind === 'due';
  const cls = left < 0 ? 'text-red-700 dark:text-red-300' : left <= 30 ? 'text-amber-700 dark:text-amber-300' : left <= 90 && !due ? 'text-amber-700/80 dark:text-amber-200/80' : 'text-slate-500 dark:text-slate-400';
  return (
    <span className={`shrink-0 text-right text-xs ${cls}`}>
      {due ? 'Due ' : ''}{shortDate(p.expires)}<br />{left < 0 ? (due ? 'overdue' : 'expired') : left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'}`}
    </span>
  );
}

export function VaultRow({ p, s, onOpen }: { p: Paper; s: Settings; onOpen?: () => void }) {
  const files = p.files?.length ?? 0;
  const pages = files ? (files === 1 && fileKind(p.files[0]) === 'pdf' ? 'PDF' : plural(files, 'page')) : '';
  const sub = [holderText(s, p.holder), p.doc_date && shortDate(p.doc_date), pages, p.source === 'email' && '✉️ email'].filter(Boolean).join(' · ');
  return (
    <li className="border-t border-slate-900/[0.06] first:border-0 dark:border-white/[0.06]">
      <button className="tap -ml-1 flex min-h-[64px] w-[calc(100%+0.25rem)] items-center gap-3 rounded-[20px] px-1 py-2.5 text-left" onClick={onOpen}>
        <span className="tile" aria-hidden="true">{docIcon(p)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub || folderOf(p.folder).label}</span>
          {!!p.tags?.length && <span className="mt-0.5 block truncate text-[11px] text-teal-800/80 dark:text-teal-200/70">{p.tags.slice(0, 4).map((t) => `#${t}`).join(' ')}</span>}
        </span>
        <DueText p={p} />
      </button>
    </li>
  );
}

export function VaultGroup({ title, list, s, onOpen }: { title: string; list: Paper[]; s: Settings; onOpen?: (p: Paper) => void }) {
  return (
    <section className="card !px-3 !py-2">
      <p className="label px-1 pb-0.5 pt-1.5">{title} <span className="num">· {list.length}</span></p>
      <ul>{list.map((p) => <VaultRow key={p.id} p={p} s={s} onOpen={onOpen && (() => onOpen(p))} />)}</ul>
    </section>
  );
}

/** Chips: folders and people / pets that have documents (with counts). */
export function vaultChips(list: Paper[], s: Settings) {
  const folders = [{ id: 'all', label: 'All', n: list.length }, ...VAULT_FOLDERS.map((f) => ({ id: f.id, label: `${f.icon} ${f.label}`, n: list.filter((p) => (VAULT_FOLDERS.some((x) => x.id === p.folder) ? p.folder : 'other') === f.id).length })).filter((o) => o.n)];
  const names = [...new Set(list.map((p) => p.holder?.trim()).filter((x): x is string => !!x))];
  const order = (n: string) => { const i = s.vault.people.findIndex((p) => p.name.toLowerCase() === n.toLowerCase()); return i < 0 ? 99 : i; };
  const people = [{ id: 'all', label: 'Everyone', n: list.length }, ...names.sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((n) => ({ id: n, label: holderText(s, n), n: list.filter((p) => p.holder?.trim() === n).length }))];
  return { folders, people };
}

/** Filter + search, then by folder (in the folders' order); a search is one list. */
export function arrangeVault(list: Paper[], o: { q: string; folder: string; who: string }): { title: string; list: Paper[] }[] {
  const shown = list.filter((p) => (o.folder === 'all' || (VAULT_FOLDERS.some((x) => x.id === p.folder) ? p.folder : 'other') === o.folder) && (o.who === 'all' || p.holder?.trim() === o.who) && matchDoc(p, o.q))
    .sort((a, b) => (a.expires ?? '9999') .localeCompare(b.expires ?? '9999') || a.name.localeCompare(b.name));
  if (o.q.trim()) return shown.length ? [{ title: 'Found', list: shown }] : [];
  return VAULT_FOLDERS.map((f) => ({ title: `${f.icon} ${f.label}`, list: shown.filter((p) => (VAULT_FOLDERS.some((x) => x.id === p.folder) ? p.folder : 'other') === f.id) })).filter((g) => g.list.length);
}

// ---------- one document ----------
const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="field flex min-h-[48px] items-start justify-between gap-3 py-2.5 text-sm">
    <span className="shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
    <span className="min-w-0 text-right font-medium text-slate-800 dark:text-slate-100">{children}</span>
  </div>
);

/** The pages as small pictures (2-minute links); a PDF as a tile. `example` = made-up pictures for the Guide. */
function Thumbs({ files, onView, example }: { files: string[]; onView: (i: number) => void; example?: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (example) return;
    const imgs = files.filter((f) => fileKind(f) === 'image');
    void signedUrls(imgs).then(setUrls).catch(() => undefined);
  }, [files.join('|'), example]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!files.length) return <p className="panel text-sm text-slate-500 dark:text-slate-400">No file kept: only the details.</p>;
  return (
    <div className="no-bar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {files.map((f, i) => (
        <button key={f} className="tap relative h-28 w-[88px] shrink-0 overflow-hidden rounded-2xl border border-slate-900/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.05]" onClick={() => onView(i)} aria-label={`Open page ${i + 1}`}>
          {fileKind(f) === 'pdf' ? <span className="flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><span className="text-3xl" aria-hidden="true">📄</span>PDF</span>
            : example ? <span className="flex h-full flex-col gap-1.5 bg-white p-2.5 dark:bg-slate-200" aria-hidden="true">{[90, 70, 80, 55, 75, 40].map((w, k) => <span key={k} className="h-1.5 rounded-full bg-slate-300" style={{ width: `${w}%` }} />)}<span className="mt-auto h-5 w-9 rounded bg-teal-200" /></span>
            : urls[f] ? <img src={urls[f]} alt="" className="h-full w-full object-cover" /> : <span className="skel block h-full w-full !rounded-none" />}
          <span className="absolute bottom-1 right-1 rounded-full bg-slate-900/70 px-1.5 text-[10px] font-bold text-white">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}

export function VaultDetails({ p, s, onEdit, onDelete, example }: { p: Paper; s: Settings; onEdit?: () => void; onDelete?: () => void; example?: boolean }) {
  const [view, setView] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const left = daysTo(p, today());
  const who = personOf(s, p.holder);
  const act = async (name: string, f: () => Promise<unknown>) => { setBusy(name); try { await f(); } catch (e) { if ((e as Error)?.name !== 'AbortError') toast('err', errText(e)); } setBusy(''); };
  const open = (i: number) => (fileKind(p.files[i]) === 'pdf' ? void act('open', () => openFile(p.files[i])) : setView(i));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="orb !h-14 !w-14 !text-2xl" aria-hidden="true">{docIcon(p)}</span>
        <div className="min-w-0">
          <p className="label">{folderOf(p.folder).label}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{[p.holder ? `For ${who ? `${who.name} ${personIcon(who)}` : p.holder}` : '', SOURCE[p.source ?? 'hand']].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <Thumbs files={p.files ?? []} onView={open} example={example} />
      <div className="flex flex-wrap gap-2">
        {!!p.files?.length && <button className="btn-primary flex-1" disabled={!!busy} onClick={() => open(0)}>{busy === 'open' ? <span className="spinner" /> : '👁 Open'}</button>}
        {!!p.files?.length && <button className="btn" disabled={!!busy} onClick={() => void act('dl', async () => { for (const f of p.files) await downloadFile(f, `${safeName(p.name)}${p.files.length > 1 ? `-${p.files.indexOf(f) + 1}` : ''}.${fileKind(f) === 'pdf' ? 'pdf' : 'jpg'}`); })}>{busy === 'dl' ? <span className="spinner" /> : '⬇ Save'}</button>}
        {!!p.files?.length && <button className="btn" disabled={!!busy} onClick={() => void act('share', () => shareFiles(p.files, p.name))}>{busy === 'share' ? <span className="spinner" /> : '↗ Share'}</button>}
      </div>
      <div>
        {p.doc_date && <Fact label="Date">{shortDate(p.doc_date)}</Fact>}
        {p.expires && <Fact label={p.due_kind === 'due' ? 'Next due' : 'Expires'}><span className={left != null && left <= 30 ? 'text-amber-700 dark:text-amber-300' : ''}>{shortDate(p.expires)} · {left! < 0 ? (p.due_kind === 'due' ? 'overdue' : 'expired') : left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}</span>{p.remind === false ? <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">no heads-up</span> : <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">heads-up before{p.calendar !== false ? ' · in your calendar' : ''}</span>}</Fact>}
        {p.kind && p.kind !== 'other' && <Fact label="Kind">{PAPER_KINDS.find((k) => k.id === p.kind)?.label}</Fact>}
        {p.number_end && <Fact label="Number"><span className="num">…{p.number_end}</span></Fact>}
        {!!p.tags?.length && <Fact label="Tags"><span className="flex flex-wrap justify-end gap-1">{p.tags.map((t) => <span key={t} className="chip border-teal-500/25 bg-teal-500/10 text-teal-900 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-teal-100">#{t}</span>)}</span></Fact>}
      </div>
      {p.summary && <div className="panel text-sm text-slate-700 dark:text-slate-300"><p className="label mb-1">✨ What it says</p>{p.summary}{p.ai_by && <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">Read by {p.ai_by}</span>}</div>}
      {p.notes && <div className="panel whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300"><p className="label mb-1">Note</p>{p.notes}</div>}
      {(onEdit || onDelete) && (
        <div className="flex gap-2">
          {onEdit && <button className="btn flex-1" onClick={onEdit}>✎ Edit</button>}
          {onDelete && <button className="btn text-red-700 dark:text-red-300" onClick={onDelete}>🗑 Delete</button>}
        </div>
      )}
      {view != null && <Viewer files={p.files} start={view} title={p.name} onClose={() => setView(null)} />}
    </div>
  );
}

/** Full screen: every page, tap a page to zoom in (then scroll around), tap again to zoom out. PDFs open in the phone's viewer. */
export function Viewer({ files, start = 0, title, onClose }: { files: string[]; start?: number; title: string; onClose: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void signedUrls(files.filter((f) => fileKind(f) === 'image')).then(setUrls).catch((e) => toast('err', errText(e)));
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.querySelector(`[data-page="${start}"]`)?.scrollIntoView({ block: 'start' }); }, [urls, start]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title}: pages`} className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 animate-[fade_.25s_ease-out]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 text-white">
        <p className="min-w-0 flex-1 truncate font-semibold">{title}</p>
        <span className="text-xs text-white/60">{zoom != null ? 'Tap to zoom out' : 'Tap a page to zoom'}</span>
        <button className="btn h-11 w-11 shrink-0 !rounded-full !border-white/20 !bg-white/10 !p-0 !text-white" aria-label="Close" onClick={onClose}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>
      <div ref={box} className="flex-1 space-y-3 overflow-auto overscroll-contain px-3 pb-6">
        {files.map((f, i) => (
          <div key={f} data-page={i}>
            {fileKind(f) === 'pdf' ? (
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-white/15 bg-white/5 p-6 text-center text-white">
                <span className="text-5xl" aria-hidden="true">📄</span>
                <p className="text-sm">{fileName(f)}</p>
                <button className="btn-primary" onClick={() => void openFile(f).catch((e) => toast('err', errText(e)))}>Open the PDF</button>
              </div>
            ) : urls[f] ? (
              <img src={urls[f]} alt={`Page ${i + 1}`} onClick={() => setZoom(zoom === i ? null : i)} className={`mx-auto block rounded-xl bg-white ${zoom === i ? 'w-[220%] max-w-none cursor-zoom-out' : 'w-full max-w-3xl cursor-zoom-in'}`} />
            ) : <div className="skel mx-auto aspect-[3/4] w-full max-w-3xl" />}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ---------- 📷 scan / add / edit ----------
export interface VaultReadResult { route: string; title: string; folder: string; idKind: string; forWhom: string; docDate: string; dueDate: string; dueKind: 'expires' | 'due'; numberEnd: string; summary: string; text: string; tags: string[]; by: string; cached: boolean; hash: string }

const SUG = 'ml-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-300/15 dark:text-violet-200';
const Sug = ({ on }: { on: boolean }) => (on ? <span className={SUG}>✨ suggested</span> : null);

/** What the AI read, put into the form (only where you haven't typed anything). */
export function applyRead(d: Partial<Paper>, r: VaultReadResult, typed: Set<string>): { next: Partial<Paper>; filled: string[] } {
  const next = { ...d };
  const filled: string[] = [];
  const put = <K extends keyof Paper>(k: K, v: Paper[K] | undefined | '') => { if (v === undefined || v === '' || (Array.isArray(v) && !v.length) || typed.has(k)) return; next[k] = v as Paper[K]; filled.push(k); };
  put('name', r.title);
  put('folder', r.folder);
  if (r.idKind && r.idKind !== 'other') put('kind', r.idKind);
  put('holder', r.forWhom);
  put('doc_date', r.docDate);
  if (r.dueDate) { put('expires', r.dueDate); put('due_kind', r.dueKind); }
  put('number_end', r.numberEnd);
  put('tags', [...new Set([...(d.tags ?? []), ...r.tags])].slice(0, 8));
  next.summary = r.summary || d.summary || null;
  next.body = r.text || d.body || null;
  next.ai_by = r.by;
  return { next, filled };
}

export function VaultForm({ doc, s, userId, existing = [], onSave, onDelete, onDone, read, onReceipt, example }: {
  doc: Partial<Paper>; s: Settings; userId: string; existing?: Paper[];
  onSave?: (p: Partial<Paper> & { name: string }) => Promise<unknown>; onDelete?: () => Promise<void>; onDone?: () => void;
  read?: (path: string) => Promise<VaultReadResult>; onReceipt?: (path: string) => Promise<void>; example?: { filled: string[]; pages: number };
}) {
  const [receipt, setReceipt] = useState<string | null>(null); // 🧾 the AI says it's a receipt: offer Money → Spending
  const [d, setD] = useState<Partial<Paper>>({ ...PAPER_DEFAULTS, ...doc, tags: doc.tags ?? [], files: doc.files ?? [] });
  const [pages, setPages] = useState<Page[]>([]);
  const [one, setOne] = useState(true); // combine the pages into one PDF
  const [busy, setBusy] = useState('');
  const [filled, setFilled] = useState<string[]>(example?.filled ?? []);
  const [other, setOther] = useState(!!doc.holder && !personOf(s, doc.holder));
  const typed = useRef(new Set<string>());
  const set = (patch: Partial<Paper>, byHand = true) => { if (byHand) Object.keys(patch).forEach((k) => typed.current.add(k)); setD((c) => ({ ...c, ...patch })); setFilled((f) => f.filter((k) => !(k in patch))); };
  // Files uploaded here but never saved (panel closed) are deleted, so nothing private piles up in storage.
  const fresh = useRef<string[]>([]);
  const saved = useRef(false);
  useEffect(() => () => {
    if (!saved.current && fresh.current.length) void supabase.storage.from('docs').remove(fresh.current);
    pagesRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;
  const folderId = useRef(doc.id ?? crypto.randomUUID());

  const add = async (list: FileList | null) => {
    const fs = Array.from(list ?? []);
    if (!fs.length) return;
    setBusy('pages');
    try {
      const big = fs.find((f) => f.size > 40 * 1024 * 1024);
      if (big) throw new Error(`${big.name}: too big (40 MB at most).`);
      const next = await Promise.all(fs.map(shrink));
      setPages((c) => [...c, ...next].slice(0, 30));
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const willCombine = one && pages.length > 1;

  /** Pages → (one PDF) → the private bucket. Returns the new paths and the file's hash. */
  const upload = async (): Promise<{ paths: string[]; hash: string | null }> => {
    if (!pages.length) return { paths: [], hash: null };
    const final = willCombine ? [await combine(pages, d.name || 'Document')] : pages;
    for (const f of final) if (f.file.size > 15 * 1024 * 1024) throw new Error('A file is bigger than 15 MB: take the photos again a bit further away, or untick “one PDF”.');
    const hash = final.length === 1 ? await sha256(final[0].file) : await sha256(new Blob([(await Promise.all(final.map((f) => sha256(f.file)))).join('')]));
    const dup = existing.find((x) => x.file_hash === hash && x.id !== d.id);
    if (dup && !confirm(`You already have this file in your Vault: “${dup.name}”. Save it again?`)) throw new Error('Not saved twice.');
    const paths: string[] = [];
    for (const [i, f] of final.entries()) {
      const path = `${userId}/vault/${folderId.current}/${Date.now().toString(36)}-${i + 1}-${safeName(f.name)}`;
      const up = await supabase.storage.from('docs').upload(path, f.file, { contentType: f.mime });
      if (up.error) throw new Error(up.error.message);
      paths.push(path);
      fresh.current.push(path);
    }
    setPages([]);
    pages.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    // The file's fingerprint is kept for the first file only (the same file is then never saved or read twice).
    setD((c) => ({ ...c, files: [...(c.files ?? []), ...paths], file_hash: c.files?.length ? c.file_hash ?? null : hash }));
    return { paths, hash: d.files?.length ? null : hash };
  };

  const scanAndRead = async () => {
    setBusy('read');
    try {
      const { paths } = await upload();
      const path = paths[0] ?? d.files?.[0];
      if (!path || !read) return;
      const r = await read(path);
      const { next, filled: f } = applyRead(d, r, typed.current);
      setD((c) => ({ ...c, ...next, files: c.files, file_hash: c.file_hash }));
      setFilled(f);
      if (r.route === 'receipt' && onReceipt) setReceipt(path);
      toast('ok', r.cached ? 'Filled in from the last time this file was read (free).' : `Read by ${r.by}. Check it, then Save.`);
    } catch (e) { if (errText(e) !== 'Not saved twice.') toast('err', errText(e)); }
    setBusy('');
  };

  const save = async () => {
    if (!onSave) return;
    setBusy('save');
    try {
      const up = await upload();
      const files = [...(d.files ?? []), ...up.paths];
      const removed = (doc.files ?? []).filter((f) => !files.includes(f));
      await onSave({
        ...d, files, name: (d.name || folderOf(d.folder).label).trim().slice(0, 120), holder: d.holder?.trim() || null, notes: d.notes?.trim() || null,
        number_end: d.number_end?.replace(/\s/g, '').slice(-4) || null, file_hash: files.length ? d.file_hash ?? up.hash : null,
        source: d.id ? d.source : files.length ? 'scan' : 'hand',
      });
      saved.current = true;
      if (removed.length) await supabase.storage.from('docs').remove(removed).catch(() => undefined); // pages you took out
      onDone?.();
    } catch (e) { if (errText(e) !== 'Not saved twice.') toast('err', errText(e)); }
    setBusy('');
  };

  const people = s.vault.people;
  const isId = ['ids', 'car', 'insurance'].includes(d.folder ?? '');
  const total = (d.files?.length ?? 0) + pages.length + (example?.pages ?? 0);
  return (
    <div className="space-y-3">
      {receipt && onReceipt && (
        <div className="panel space-y-2 !border-teal-400/50">
          <p className="text-sm font-semibold">🧾 This looks like a receipt</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">Receipts belong in Money → Spending (with the picture, the total and what you bought), not in the Vault.</p>
          <button className="btn-primary w-full" disabled={!!busy} onClick={() => { setBusy('receipt'); saved.current = true; void onReceipt(receipt).then(() => onDone?.(), (e) => { saved.current = false; toast('err', errText(e)); }).finally(() => setBusy('')); }}>{busy === 'receipt' ? <span className="spinner" /> : 'Put it in Spending instead'}</button>
        </div>
      )}
      <div className="glass space-y-2.5 rounded-[26px] border-2 !border-dashed !border-teal-500/30 p-3 dark:!border-teal-300/25">
        <div className="grid grid-cols-2 gap-2">
          <label className="btn-primary cursor-pointer focus-within:shadow-[0_0_0_4px_rgba(94,234,212,0.25)]">📷 Scan
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={!!busy || !!example} onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="btn cursor-pointer focus-within:shadow-[0_0_0_4px_rgba(94,234,212,0.25)]">🖼️ Photos / PDF
            <input type="file" accept="image/*,application/pdf" multiple className="sr-only" disabled={!!busy || !!example} onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {(pages.length > 0 || (example?.pages ?? 0) > 0) && (
          <div className="no-bar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            {(example ? Array.from({ length: example.pages }, (_, i) => ({ name: `page ${i + 1}`, mime: 'image/jpeg', url: '' }) as unknown as Page) : pages).map((p, i) => (
              <div key={i} className="relative h-24 w-[72px] shrink-0 overflow-hidden rounded-2xl border border-slate-900/10 bg-white dark:border-white/10 dark:bg-slate-200">
                {p.url ? <img src={p.url} alt={`Page ${i + 1}`} className="h-full w-full object-cover" /> : p.mime === 'application/pdf' ? <span className="flex h-full items-center justify-center text-2xl" aria-hidden="true">📄</span>
                  : <span className="flex h-full flex-col gap-1 p-2" aria-hidden="true">{[90, 60, 80, 50, 70].map((w, k) => <span key={k} className="h-1 rounded-full bg-slate-300" style={{ width: `${w}%` }} />)}</span>}
                <button className="absolute right-0.5 top-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-sm text-white" aria-label={`Remove page ${i + 1}`} onClick={() => setPages((c) => c.filter((_, k) => k !== i))}>×</button>
                <span className="absolute bottom-1 left-1 rounded-full bg-slate-900/70 px-1.5 text-[10px] font-bold text-white">{i + 1}</span>
              </div>
            ))}
          </div>
        )}
        {(pages.length > 1 || (example?.pages ?? 0) > 1) && (
          <label className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
            <span><b>Make one PDF</b><span className="block text-xs text-slate-500 dark:text-slate-400">All pages in one file, made on this phone.</span></span>
            <Toggle on={one} onChange={setOne} label="Make one PDF" />
          </label>
        )}
        {(pages.length > 0 || example) && read && (
          <button className="btn w-full !border-violet-400/40" disabled={!!busy} onClick={() => void scanAndRead()}>{busy === 'read' ? <><span className="spinner" /> Reading it…</> : '✨ Read it and fill in for me'}</button>
        )}
        {!pages.length && !example && <p className="text-center text-xs text-slate-500 dark:text-slate-400">{total ? plural(total, 'file') + ' kept · add more pages above' : 'Take photos of each page (or pick photos / a PDF). They are made smaller on this phone, then kept privately.'}</p>}
        {busy === 'pages' && <p className="text-center text-xs text-slate-500 dark:text-slate-400"><span className="spinner" /> Getting the pages ready…</p>}
      </div>

      {busy === 'read' ? (
        <div className="card space-y-3" role="status" aria-label="Reading">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-1.5"><div className="skel h-3 w-24" /><div className="skel h-10 w-full !rounded-2xl" /></div>)}</div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-semibold">Title<Sug on={filled.includes('name')} />
            <input className="input mt-1 w-full" value={d.name ?? ''} placeholder="e.g. Rabies vaccine certificate" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-semibold">Folder<Sug on={filled.includes('folder')} />
              <select className="input mt-1 w-full" value={d.folder ?? 'other'} onChange={(e) => set({ folder: e.target.value })}>{VAULT_FOLDERS.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.label}</option>)}</select>
            </label>
            <label className="block text-sm font-semibold">For<Sug on={filled.includes('holder')} />
              <select className="input mt-1 w-full" value={other ? '__other' : d.holder ?? ''} onChange={(e) => { const v = e.target.value; setOther(v === '__other'); set({ holder: v === '__other' ? '' : v || null }); }}>
                <option value="">Nobody in particular</option>
                {people.map((p) => <option key={p.name} value={p.name}>{personIcon(p)} {p.name}</option>)}
                <option value="__other">Someone else…</option>
              </select>
            </label>
          </div>
          {other && <input className="input w-full" value={d.holder ?? ''} placeholder="Name (add people & pets in Settings → Vault)" onChange={(e) => set({ holder: e.target.value })} aria-label="For whom" />}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-semibold">Date on it<Sug on={filled.includes('doc_date')} />
              <input className="input mt-1 w-full" type="date" value={d.doc_date ?? ''} onChange={(e) => set({ doc_date: e.target.value || null })} />
            </label>
            <label className="block text-sm font-semibold">{d.due_kind === 'due' ? 'Next due' : 'Expires'}<Sug on={filled.includes('expires')} />
              <input className="input mt-1 w-full" type="date" value={d.expires ?? ''} onChange={(e) => set({ expires: e.target.value || null })} />
            </label>
          </div>
          <Seg label="Kind of date" options={[['expires', 'It expires'], ['due', 'Due again']]} value={d.due_kind ?? 'expires'} onChange={(v) => set({ due_kind: v })} />
          {d.expires && (
            <div className="panel !py-1">
              <label className="flex min-h-[48px] items-center justify-between gap-3 text-sm"><span>🔔 Heads-up before it</span><Toggle on={d.remind !== false} onChange={(v) => set({ remind: v })} label="Heads-up" /></label>
              <label className="field flex min-h-[48px] items-center justify-between gap-3 text-sm"><span>📅 In my LifeTracker calendar</span><Toggle on={d.calendar !== false} onChange={(v) => set({ calendar: v })} label="Calendar" /></label>
            </div>
          )}
          {isId && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-semibold">Kind<Sug on={filled.includes('kind')} />
                <select className="input mt-1 w-full" value={d.kind ?? 'other'} onChange={(e) => set({ kind: e.target.value })}>{PAPER_KINDS.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}</select>
              </label>
              <label className="block text-sm font-semibold">Number (last 4)<Sug on={filled.includes('number_end')} />
                <input className="input num mt-1 w-full" maxLength={4} value={d.number_end ?? ''} onChange={(e) => set({ number_end: e.target.value.slice(-4) || null })} />
              </label>
            </div>
          )}
          <div className="text-sm font-semibold">Tags<Sug on={filled.includes('tags')} />
            <div className="mt-1"><ListInput values={d.tags ?? []} onChange={(tags) => set({ tags: tags.map((t) => t.replace(/^#/, '').toLowerCase()) })} placeholder="e.g. vet, rabies" max={8} label="tag" /></div>
          </div>
          <label className="block text-sm font-semibold">Note
            <textarea className="input mt-1 w-full py-2.5" rows={2} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything to remember" />
          </label>
          {d.summary && <p className="panel text-sm text-slate-700 dark:text-slate-300"><span className="label mb-1 block">✨ What it says</span>{d.summary}</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400">Kept privately in your own storage; only you can open it, with links that last 2 minutes. Only the last 4 characters of any number are kept.</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!!busy || (!d.name?.trim() && !total)} onClick={() => void save()}>{busy === 'save' ? <span className="spinner" /> : 'Save'}</button>
            {onDelete && <button className="btn text-red-700 dark:text-red-300" disabled={!!busy} onClick={() => void (confirm('Delete this document and its files?') && onDelete().then(() => onDone?.()).catch((e) => toast('err', errText(e))))}>🗑 Delete</button>}
          </div>
          {!!d.files?.length && d.id && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600 dark:text-slate-300">Files kept ({d.files.length})</summary>
              <ul className="mt-1">{d.files.map((f) => <li key={f} className="field flex min-h-[48px] items-center gap-2"><span className="min-w-0 flex-1 truncate">{fileKind(f) === 'pdf' ? '📄' : '🖼️'} {fileName(f)}</span><button className="btn text-xs text-red-700 dark:text-red-300" onClick={() => set({ files: d.files!.filter((x) => x !== f) })}>Remove</button></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- 🔒 PIN ----------
/** A number pad. `fixed` = the PIN's length (it checks by itself once typed); otherwise 4–6 digits and ✓. */
export function PinPad({ fixed, onPin, busy, shake }: { fixed?: number; onPin: (pin: string) => void; busy?: boolean; shake?: number }) {
  const [v, setV] = useState('');
  const n = fixed ?? 6;
  useEffect(() => { setV(''); }, [shake]);
  const press = (k: string) => {
    if (busy) return;
    if (k === '⌫') return setV((x) => x.slice(0, -1));
    if (k === '✓') { if (v.length >= 4) onPin(v); return; }
    const next = (v + k).slice(0, n);
    setV(next);
    if (fixed && next.length === fixed) onPin(next);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter') press('✓'); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <div className="space-y-5">
      <div className={`flex justify-center gap-3 ${shake ? 'animate-[shake_.4s_ease-in-out]' : ''}`} key={shake} aria-label={`${v.length} digits typed`} role="status">
        {Array.from({ length: fixed ?? Math.max(4, v.length) }, (_, i) => <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 transition-transform ${i < v.length ? 'scale-110 border-transparent bg-gradient-to-br from-teal-300 to-violet-400 shadow-[0_0_12px_-2px_#5eead4]' : 'border-slate-400/60 dark:border-slate-500'}`} />)}
      </div>
      <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', fixed ? '' : '✓', '0', '⌫'].map((k, i) => k ? (
          <button key={i} className={`btn h-[64px] !rounded-full text-[22px] font-semibold ${k === '✓' ? (v.length >= 4 ? 'btn-primary' : 'opacity-50') : ''}`} aria-label={k === '⌫' ? 'Delete' : k === '✓' ? 'OK' : k} onClick={() => press(k)} disabled={busy}>{k}</button>
        ) : <span key={i} />)}
      </div>
    </div>
  );
}

/** Choose a new PIN: type it twice. */
export function NewPin({ onDone }: { onDone: (pin: string) => void | Promise<void> }) {
  const [first, setFirst] = useState('');
  const [shake, setShake] = useState(0);
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-slate-600 dark:text-slate-300">{first ? 'Type it again.' : 'Choose 4 to 6 digits, then ✓.'}{shake && !first ? <b className="block text-red-700 dark:text-red-300">They didn’t match: start again.</b> : null}</p>
      <PinPad key={first ? 'b' : 'a'} fixed={first ? first.length : undefined} shake={shake} onPin={(pin) => {
        if (!first) return setFirst(pin);
        if (pin !== first) { setFirst(''); setShake((x) => x + 1); return; }
        void onDone(pin);
      }} />
    </div>
  );
}

/** The Vault's lock screen (a privacy screen for this phone). */
export function LockScreen({ len, onPin, bio, onBio, onForgot, error, busy, shake }: { len: number; onPin: (pin: string) => void; bio?: boolean; onBio?: () => void; onForgot?: () => void; error?: string; busy?: boolean; shake?: number }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 pt-4 text-center">
      <span className="orb" aria-hidden="true">🔒</span>
      <div>
        <h1 className="text-[28px] font-semibold leading-tight">Vault locked</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Type your PIN to see your documents.</p>
      </div>
      <p className={`min-h-[20px] text-sm font-semibold ${error ? 'text-red-700 dark:text-red-300' : 'text-transparent'}`} role="alert">{error || '·'}</p>
      <PinPad fixed={len} onPin={onPin} busy={busy} shake={shake} />
      {bio && <button className="btn w-full max-w-[280px]" onClick={onBio}>👆 Use fingerprint or face</button>}
      {onForgot && <button className="btn-ghost text-sm text-slate-600 dark:text-slate-300" onClick={onForgot}>Forgot your PIN?</button>}
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">The lock is a privacy screen on this phone. Your documents are always protected by your sign-in: nobody else can open them.</p>
    </div>
  );
}

// ---------- 👤 people & 🐾 pets ----------
const PET_EMOJI = ['🐶', '🐱', '🐰', '🐹', '🐦', '🐠', '🐴', '🦎', '🐾'];
const PEOPLE_EMOJI = ['👤', '👩', '👨', '👧', '👦', '👵', '👴', '👶'];
export function PeopleEditor({ people, onChange }: { people: VaultPerson[]; onChange: (p: VaultPerson[]) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'family' | 'pet'>('pet');
  const [emoji, setEmoji] = useState('🐶');
  const add = () => {
    const n = name.trim().slice(0, 40);
    if (!n || people.some((p) => p.name.toLowerCase() === n.toLowerCase())) return toast('info', n ? `${n} is already in the list.` : 'Type a name first.');
    onChange([...people, { name: n, kind, emoji }]);
    setName('');
  };
  return (
    <div className="space-y-2">
      <ul>
        {people.map((p) => (
          <li key={p.name} className="field flex min-h-[52px] items-center gap-3">
            <span className="tile !h-10 !w-10 !text-lg" aria-hidden="true">{personIcon(p)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.name}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{p.kind === 'pet' ? 'Pet' : p.kind === 'me' ? 'You' : 'Family'}</span></span>
            {p.kind !== 'me' && <button className="btn h-11 w-11 !rounded-full !p-0 text-slate-500" aria-label={`Remove ${p.name}`} onClick={() => onChange(people.filter((x) => x !== p))}>×</button>}
          </li>
        ))}
      </ul>
      <div className="panel space-y-2">
        <Seg label="Person or pet" options={[['pet', '🐾 A pet'], ['family', '👤 A person']]} value={kind} onChange={(v) => { setKind(v); setEmoji(v === 'pet' ? '🐶' : '👤'); }} />
        <div className="flex gap-2">
          <select className="input w-[76px] shrink-0 text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Icon">{(kind === 'pet' ? PET_EMOJI : PEOPLE_EMOJI).map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <input className="input min-w-0 flex-1" value={name} placeholder={kind === 'pet' ? 'e.g. Daizy' : 'e.g. Sam'} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Name" />
          <button className="btn shrink-0" onClick={add} aria-label="Add">＋</button>
        </div>
      </div>
    </div>
  );
}
