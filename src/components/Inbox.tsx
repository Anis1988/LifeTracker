import { useRef, useState } from 'react';
import type { Alert, Doc, Item } from '../../supabase/functions/_shared/model.ts';
import { nameAddresses, personFor } from '../../supabase/functions/_shared/mailPeople.ts';
import { feedGroups, type AddedEntry } from '../lib/added';
import { errText, shortDate, toast } from './ui';
import { api, supabase } from '../lib/supabase';
import { PersonChip, personEdge, usePeople, usePersonFor } from './Person';

/** 🆕 One thing added by itself (the Inbox feed): what, where it went, when, and ↶ Undo. Also in the Guide (no buttons there). */
export function AddedRow({ e, onUndo, onOpen, busy }: { e: AddedEntry; onUndo?: () => void; onOpen?: () => void; busy?: boolean }) {
  const who = usePersonFor(e.src); // 👥 whose mailbox it came from
  const people = usePeople();
  return (
    <li className={`flex items-center gap-2 border-t border-slate-900/[0.06] py-2 first:border-0 dark:border-white/[0.06] ${personEdge(who)}`}>
      <button className="tap -ml-1 flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-[18px] px-1 py-1.5 text-left" onClick={onOpen} aria-label={`${e.title}: open in ${e.where}`}>
        <span className="tile !h-10 !w-10 !text-lg" aria-hidden="true">{e.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5"><span className="break-words text-sm font-semibold leading-snug">{nameAddresses(e.title, people)}</span><PersonChip p={who} /></span>
          <span className="block break-words text-xs text-slate-500 dark:text-slate-400">{nameAddresses(e.sub, people)}</span>
          <span className="block text-[11px] text-teal-800/80 dark:text-teal-200/70">✓ Added to {e.where} · {ago(e.at)}</span>
        </span>
      </button>
      <button className="btn shrink-0 px-3 text-xs" disabled={busy} onClick={onUndo} aria-label={`Undo: remove ${e.title}`}>{busy ? <span className="spinner" /> : '↶ Undo'}</button>
    </li>
  );
}
function ago(at: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 2880 ? 'yesterday' : `${Math.round(m / 1440)} days ago`;
}

/** The feed, grouped (Today, This week, Earlier). */
export function AddedList({ list, onUndo, onOpen, busy }: { list: AddedEntry[]; onUndo?: (e: AddedEntry) => void; onOpen?: (e: AddedEntry) => void; busy?: string }) {
  return (
    <>
      {feedGroups(list).map((g) => (
        <section key={g.title} className="card !px-3 !py-2">
          <p className="label px-1 pb-0.5 pt-1.5">{g.title} <span className="num">· {g.list.length}</span></p>
          <ul>{g.list.map((e) => <AddedRow key={e.key} e={e} busy={busy === e.key} onUndo={onUndo && (() => onUndo(e))} onOpen={onOpen && (() => onOpen(e))} />)}</ul>
        </section>
      ))}
    </>
  );
}

// '' = the title already starts with its own icon (documents, credit, breaches).
const ALERT_ICON: Record<Alert['kind'], string> = { price: '📈', trial: '⏳', renewal: '🔁', due: '💳', found: '🔎', sync: '⚠️', me: '🕵️', breach: '', paper: '', credit: '', unsub: '📭', budget: '', return: '', warranty: '', date: '', appt: '', vault: '', nearby: '' };
export function AlertList({ alerts, onSeen, items = [] }: { alerts: Alert[]; onSeen?: (id: string) => void; items?: Item[] }) {
  const people = usePeople();
  if (!alerts.length) return null;
  // 👥 Whose mailbox a heads-up is about: saved on it (newer ones), else the bill it's about.
  const whoOf = (a: Alert) => {
    if (a.mailbox) return personFor({ mailbox: a.mailbox }, people);
    const i = a.item_id ? items.find((x) => x.id === a.item_id) : undefined;
    return i && i.source === 'email' ? personFor(i, people) : null;
  };
  return (
    <section className="card space-y-1">
      <p className="label">Heads-ups</p>
      <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.06]">
        {alerts.slice(0, 12).map((a) => { const who = whoOf(a); return (
          <li key={a.id} className={`flex items-start gap-3 py-2.5 ${personEdge(who)}`}>
            {ALERT_ICON[a.kind] && <span aria-hidden="true" className="tile !h-9 !w-9 !rounded-xl !text-base">{ALERT_ICON[a.kind]}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{nameAddresses(a.title, people)}{who && <> <PersonChip p={who} className="align-[1px]" /></>}</p>
              {a.body && <p className="mt-0.5 whitespace-pre-line text-xs leading-snug text-slate-500 dark:text-slate-400">{nameAddresses(a.body, people)}</p>}
            </div>
            {onSeen && <button className="btn-ghost -my-1 -mr-1 shrink-0 rounded-full text-base text-teal-700 dark:text-teal-300" onClick={() => onSeen(a.id)} aria-label="Got it">✓</button>}
          </li>
        ); })}
      </ul>
    </section>
  );
}

// ---------- 📄 documents ----------
const ACCEPT = 'application/pdf,image/*,.txt,.eml';
const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);

/** Upload bills, statements and policies: kept privately, then read at once by the AI (free AIs first); a bill goes straight into Bills. */
export function Uploader({ userId, onDone }: { userId: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const send = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      if (f.size > 15 * 1024 * 1024) { toast('err', `${f.name}: 15 MB at most.`); continue; }
      setBusy(f.name);
      try {
        const path = `${userId}/${crypto.randomUUID()}-${safeName(f.name)}`;
        const mime = f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
        const up = await supabase.storage.from('docs').upload(path, f, { contentType: mime });
        if (up.error) throw new Error(up.error.message);
        const ins = await supabase.from('documents').insert({ path, file_name: f.name, mime, size: f.size }).select().single();
        if (ins.error) throw new Error(ins.error.message);
        // Read at once; a bill goes straight into Bills (or updates the one you have), with an Undo in this Inbox.
        await api<{ doc?: Doc; itemId?: string }>('read-doc', { id: ins.data.id })
          .then((r) => toast('ok', r.itemId ? `${r.doc?.extracted?.name || f.name}: in your bills now (Undo is in this Inbox).` : `${f.name}: read${r.doc?.extracted?.isBill === false ? ', not a bill' : ''}.`))
          .catch((e) => toast('err', `${f.name}: ${errText(e)}`));
      } catch (e) {
        toast('err', `${f.name}: ${errText(e)}`);
      }
    }
    setBusy('');
    onDone();
  };
  return (
    <div className="glass rounded-[26px] border-2 !border-dashed !border-teal-500/30 px-4 py-6 text-center dark:!border-teal-300/25"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void send(e.dataTransfer.files); }}>
      <span className="orb mx-auto mb-3" aria-hidden="true">📄</span>
      <p className="text-sm text-slate-600 dark:text-slate-300">A bill, statement, insurance policy or renewal letter: photo or PDF.</p>
      <button className="btn-primary mt-3" disabled={!!busy} onClick={() => ref.current?.click()}>{busy ? <><span className="spinner" /> Reading {busy.slice(0, 24)}…</> : '📄 Add a bill or document'}</button>
      <input ref={ref} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { void send(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

export function DocRow({ d, onChange, onMove }: { d: Doc; onChange?: () => void; onMove?: () => void }) {
  const [busy, setBusy] = useState(false);
  const x = d.extracted;
  const view = async () => {
    const r = await supabase.storage.from('docs').createSignedUrl(d.path, 300);
    if (r.data?.signedUrl) window.open(r.data.signedUrl, '_blank', 'noopener');
  };
  const reread = async () => {
    setBusy(true);
    try { await api('read-doc', { id: d.id }); toast('ok', 'Read again.'); } catch (e) { toast('err', errText(e)); }
    setBusy(false);
    onChange?.();
  };
  const remove = async () => {
    if (!confirm(`Delete ${d.file_name}?`)) return;
    await supabase.storage.from('docs').remove([d.path]);
    await supabase.from('documents').delete().eq('id', d.id);
    onChange?.();
  };
  return (
    <article className="card space-y-1.5">
      <div className="flex items-start gap-3">
        <span className="tile" aria-hidden="true">{d.mime === 'application/pdf' ? '📄' : d.mime.startsWith('image/') ? '🖼️' : '📝'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{x?.name || d.file_name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{d.file_name} · {shortDate(d.created_at.slice(0, 10))}{d.ai_by ? ` · read by ${d.ai_by}` : ''}</p>
          {d.origin && <p className="truncate text-xs text-slate-500 dark:text-slate-400">✉️ {d.origin}</p>}
        </div>
        <span className={`chip ${d.status === 'done' ? 'border-emerald-300 text-emerald-800 dark:text-emerald-200' : d.status === 'failed' ? 'border-red-300 text-red-700 dark:text-red-300' : 'border-slate-900/10 dark:border-white/10 text-slate-600 dark:text-slate-300'}`}>
          {d.status === 'done' ? (x?.isBill ? (d.item_id ? '✓ in Bills' : 'not added') : 'not a bill') : d.status === 'failed' ? 'failed' : 'reading…'}
        </span>
      </div>
      {x?.summary && <p className="text-sm text-slate-700 dark:text-slate-300">{x.summary}</p>}
      {x && (x.amount != null || x.nextDue || x.endsOn) && (
        <p className="text-xs text-slate-600 dark:text-slate-400">{x.amount != null ? `$${x.amount}` : ''}{x.cycle ? ` ${x.cycle}` : ''}{x.nextDue ? ` · due ${shortDate(x.nextDue)}` : ''}{x.endsOn ? ` · renews ${shortDate(x.endsOn)}` : ''}{x.policyNumber ? ` · policy ${x.policyNumber}` : ''}</p>
      )}
      {x?.coverage && <p className="text-xs text-slate-600 dark:text-slate-400">🛡️ {x.coverage}</p>}
      {!!x?.warnings?.length && <p className="text-xs text-amber-800 dark:text-amber-200">⚠ {x.warnings.join(' · ')}</p>}
      {d.error && <p className="text-xs text-slate-500 dark:text-slate-400">{d.error}</p>}
      {onChange && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn text-xs" onClick={() => void view()}>Open</button>
          {onMove && d.status === 'done' && !x?.isBill && <button className="btn text-xs" onClick={onMove}>📁 Move to Vault</button>}
          <button className="btn text-xs" disabled={busy} onClick={() => void reread()}>{busy ? <span className="spinner" /> : '↻ Read again'}</button>
          <button className="btn text-xs text-red-700 dark:text-red-300" onClick={() => void remove()}>🗑</button>
        </div>
      )}
    </article>
  );
}

// ---------- bank CSV (read on the device) ----------
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim());
  return out;
}
const toDay = (s: string): string | null => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  if (s.includes('-')) return `${m[1]}-${m[2]}-${m[3]}`;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
};
const num = (s: string) => { const n = Number(s.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return Number.isFinite(n) ? n : null; };

/** Most banks' "Download transactions (CSV)": Date, Description, Amount (or Debit / Credit columns). */
export function parseBankCsv(text: string): { date: string; amount: number; description: string }[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const h = lines.findIndex((l) => /date/i.test(l) && /(amount|debit|withdrawal)/i.test(l));
  if (h < 0) throw new Error('No “Date” and “Amount” columns found. Download the transactions as CSV from your bank.');
  const head = cells(lines[h]).map((x) => x.toLowerCase());
  const col = (...n: string[]) => head.findIndex((x) => n.some((k) => x.includes(k)));
  const iDate = col('posted', 'date'), iDesc = col('description', 'payee', 'name', 'merchant', 'memo'), iAmt = col('amount'), iDebit = col('debit', 'withdrawal'), iCredit = col('credit', 'deposit');
  const out: { date: string; amount: number; description: string }[] = [];
  for (const l of lines.slice(h + 1)) {
    const c = cells(l);
    const date = toDay(c[iDate] ?? '');
    if (!date) continue;
    let amount = iAmt >= 0 ? num(c[iAmt] ?? '') : null;
    if (amount === null && iDebit >= 0) { const d = num(c[iDebit] ?? ''); const cr = iCredit >= 0 ? num(c[iCredit] ?? '') : null; amount = d ? -Math.abs(d) : cr ? Math.abs(cr) : null; }
    if (amount === null) continue;
    out.push({ date, amount, description: (c[iDesc] ?? '').slice(0, 200) });
  }
  // Some banks show money out as positive: if almost everything is positive, flip.
  const pos = out.filter((r) => r.amount > 0).length;
  return pos > out.length * 0.8 ? out.map((r) => ({ ...r, amount: -r.amount })) : out;
}

export function CsvImport({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const go = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const rows = parseBankCsv(await f.text());
      if (!rows.length) throw new Error('No transactions found in this file.');
      const r = await api<{ imported: number; log: { steps: string[] } }>('import-csv', { rows: rows.slice(0, 5000) });
      toast('ok', `${r.imported} transactions read. ${r.log.steps.find((s) => s.startsWith('Recurring')) ?? ''}`);
      onDone();
    } catch (e) {
      toast('err', errText(e));
    }
    setBusy(false);
  };
  return (
    <>
      <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <><span className="spinner" /> Reading…</> : '🧾 Import a bank CSV'}</button>
      <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void go(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}
