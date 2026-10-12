import { useRef, useState } from 'react';
import { CYCLES, catOf, type Alert, type Doc, type Suggestion } from '../../supabase/functions/_shared/model.ts';
import { Money, errText, shortDate, toast } from './ui';
import { api, supabase } from '../lib/supabase';

const SOURCE: Record<Suggestion['source'], string> = { bank: '🏦 Found in your bank', email: '✉️ Found in your email', document: '📄 Found in a document' };

/** "Is this a bill?" Also drawn in the Guide with made-up data (no buttons there). */
export function SuggestionCard({ s, onAdd, onIgnore }: { s: Suggestion; onAdd?: () => void; onIgnore?: () => void }) {
  const cyc = CYCLES.find((c) => c.id === s.cycle)?.label.toLowerCase();
  return (
    <article className="card space-y-2">
      <p className="label">{SOURCE[s.source]}</p>
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden="true">{catOf(s.category ?? 'other').icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{s.name}</p>
          <p className="text-sm text-stone-600 dark:text-slate-300">
            {s.amount != null ? <Money n={Number(s.amount)} /> : 'Amount unknown'}{cyc ? ` ${cyc}` : ''}{s.next_due ? ` · next ${shortDate(s.next_due)}` : ''}{s.trial_ends ? ` · trial ends ${shortDate(s.trial_ends)}` : ''}{s.ends_on ? ` · renews ${shortDate(s.ends_on)}` : ''}
          </p>
          {s.evidence?.charges?.length ? <p className="mt-1 text-xs text-stone-500">Charges: {s.evidence.charges.map((c) => `${shortDate(c.date)} $${c.amount.toFixed(2)}`).join(' · ')}</p> : null}
          {s.evidence?.subject && <p className="mt-1 truncate text-xs text-stone-500">“{s.evidence.subject}”</p>}
          {s.evidence?.note && <p className="mt-1 text-xs text-stone-600 dark:text-slate-300">{s.evidence.note}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={onAdd}>＋ Add to my bills</button>
        <button className="btn" onClick={onIgnore}>Not a bill</button>
      </div>
    </article>
  );
}

// '' = the title already starts with its own icon (documents, credit, breaches).
const ALERT_ICON: Record<Alert['kind'], string> = { price: '📈', trial: '⏳', renewal: '🔁', due: '💳', found: '🔎', sync: '⚠️', me: '🕵️', breach: '', paper: '', credit: '', unsub: '📭', budget: '', return: '', warranty: '', date: '' };
export function AlertList({ alerts, onSeen }: { alerts: Alert[]; onSeen?: (id: string) => void }) {
  if (!alerts.length) return null;
  return (
    <section className="card space-y-1">
      <p className="label">Heads-ups</p>
      <ul className="divide-y divide-stone-200 dark:divide-slate-800">
        {alerts.slice(0, 12).map((a) => (
          <li key={a.id} className="flex items-start gap-2 py-2">
            {ALERT_ICON[a.kind] && <span aria-hidden="true">{ALERT_ICON[a.kind]}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.title}</p>
              {a.body && <p className="text-xs text-stone-500 dark:text-slate-400">{a.body}</p>}
            </div>
            {onSeen && <button className="btn-ghost text-xs" onClick={() => onSeen(a.id)} aria-label="Got it">✓</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- 📄 documents ----------
const ACCEPT = 'application/pdf,image/*,.txt,.eml';
const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);

/** Upload bills, statements and policies: kept privately, then the AI reads them (free AIs first). */
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
        await api('read-doc', { id: ins.data.id }).catch((e) => toast('err', `${f.name}: ${errText(e)}`));
      } catch (e) {
        toast('err', `${f.name}: ${errText(e)}`);
      }
    }
    setBusy('');
    onDone();
  };
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-300 p-4 text-center dark:border-slate-700"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void send(e.dataTransfer.files); }}>
      <p className="text-sm text-stone-600 dark:text-slate-300">A bill, statement, insurance policy or renewal letter: photo or PDF.</p>
      <button className="btn-primary mt-2" disabled={!!busy} onClick={() => ref.current?.click()}>{busy ? <><span className="spinner" /> Reading {busy.slice(0, 24)}…</> : '📄 Add a bill or document'}</button>
      <input ref={ref} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { void send(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

export function DocRow({ d, onChange }: { d: Doc; onChange?: () => void }) {
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
        <span className="text-2xl" aria-hidden="true">{d.mime === 'application/pdf' ? '📄' : d.mime.startsWith('image/') ? '🖼️' : '📝'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{x?.name || d.file_name}</p>
          <p className="text-xs text-stone-500">{d.file_name} · {shortDate(d.created_at.slice(0, 10))}{d.ai_by ? ` · read by ${d.ai_by}` : ''}</p>
        </div>
        <span className={`chip ${d.status === 'done' ? 'border-emerald-300 text-emerald-800 dark:text-emerald-200' : d.status === 'failed' ? 'border-red-300 text-red-700 dark:text-red-300' : 'border-stone-300 text-stone-600'}`}>
          {d.status === 'done' ? (x?.isBill ? (d.item_id ? 'linked' : 'in Inbox') : 'not a bill') : d.status === 'failed' ? 'failed' : 'reading…'}
        </span>
      </div>
      {x?.summary && <p className="text-sm text-stone-700 dark:text-slate-300">{x.summary}</p>}
      {x && (x.amount != null || x.nextDue || x.endsOn) && (
        <p className="text-xs text-stone-600 dark:text-slate-400">{x.amount != null ? `$${x.amount}` : ''}{x.cycle ? ` ${x.cycle}` : ''}{x.nextDue ? ` · due ${shortDate(x.nextDue)}` : ''}{x.endsOn ? ` · renews ${shortDate(x.endsOn)}` : ''}{x.policyNumber ? ` · policy ${x.policyNumber}` : ''}</p>
      )}
      {x?.coverage && <p className="text-xs text-stone-600 dark:text-slate-400">🛡️ {x.coverage}</p>}
      {!!x?.warnings?.length && <p className="text-xs text-amber-800 dark:text-amber-200">⚠ {x.warnings.join(' · ')}</p>}
      {d.error && <p className="text-xs text-stone-500">{d.error}</p>}
      {onChange && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn !min-h-9 text-xs" onClick={() => void view()}>Open</button>
          <button className="btn !min-h-9 text-xs" disabled={busy} onClick={() => void reread()}>{busy ? <span className="spinner" /> : '↻ Read again'}</button>
          <button className="btn !min-h-9 text-xs text-red-700 dark:text-red-300" onClick={() => void remove()}>🗑</button>
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
