import { useState } from 'react';
import { api } from '../lib/supabase';
import type { Item, Negotiation, NegotiateScript } from '../../supabase/functions/_shared/model.ts';
import { today } from '../../supabase/functions/_shared/money.ts';
import { Field, Money, Sheet, Toggle, errText, toast } from './ui';

const Step = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <div className="panel space-y-1">
    <p className="label">{n} · {title}</p>
    <div className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{children}</div>
  </div>
);

/** The script itself: what to say first, the ask, if they say no, (switching), tips. Also drawn in the Guide. */
export function ScriptView({ s, by }: { s: NegotiateScript; by?: string }) {
  return (
    <div className="space-y-2">
      <Step n="1" title="Say first">“{s.opener}”</Step>
      <Step n="2" title="The ask">“{s.ask}”</Step>
      <Step n="3" title="If they say no">
        <ul className="list-disc space-y-1 pl-5">{s.ifNo.map((x, k) => <li key={k}>“{x}”</li>)}</ul>
      </Step>
      {s.switchLine && <Step n="4" title="Only if you’re OK to switch">“{s.switchLine}”</Step>}
      <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-sm text-teal-900 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-teal-100">🎯 <b>Aim for:</b> {s.target}</div>
      {s.tips.length > 0 && <ul className="space-y-1 px-1 text-sm text-slate-600 dark:text-slate-300">{s.tips.map((x, k) => <li key={k}>💡 {x}</li>)}</ul>}
      {by && <p className="px-1 text-[11px] text-slate-400 dark:text-slate-500">Written by {by}. Check it sounds like you before you call.</p>}
    </div>
  );
}

const asText = (i: Pick<Item, 'name'>, s: NegotiateScript) => [
  `Calling ${i.name}`, `1. Say first: ${s.opener}`, `2. The ask: ${s.ask}`, `3. If they say no:\n${s.ifNo.map((x) => `- ${x}`).join('\n')}`,
  s.switchLine ? `4. If OK to switch: ${s.switchLine}` : '', `Aim for: ${s.target}`, ...s.tips.map((x) => `Tip: ${x}`),
].filter(Boolean).join('\n\n');

/**
 * 💬 "Get a lower price" panel on a bill. The script costs 1 AI read the first time (free AIs first, Claude last);
 * it is kept on the bill for this price, so opening it again is free. The bill only changes when you tap Save.
 */
export function NegotiateSheet({ item, onClose, onSave, onScript }: {
  item: Item; onClose: () => void;
  /** The server already kept the script on the bill: keep it on the open form too. */
  onScript: (n: Negotiation) => void;
  /** Saves these fields on the bill (and on the open form). */
  onSave: (patch: Pick<Item, 'amount' | 'price_history' | 'details'>) => Promise<void>;
}) {
  const [n, setN] = useState<Negotiation | undefined>(item.details?.negotiate);
  const [okSwitch, setOkSwitch] = useState(n?.okSwitch ?? false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(n?.result?.note ?? '');
  const [price, setPrice] = useState('');
  const write = async (fresh = false) => {
    setBusy('write');
    try {
      const r = await api<Negotiation & { cached: boolean }>('negotiate', { id: item.id, okSwitch, fresh });
      const { cached, ...keep } = r;
      setN(keep);
      onScript(keep);
      if (cached) toast('info', 'Your saved script (no new AI read).');
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const save = async () => {
    const p = price.trim() === '' ? null : Number(price);
    if (p !== null && !(p >= 0)) return toast('err', 'Type the new price as a number.');
    if (!note.trim() && p === null) return toast('err', 'Write how it went, or the new price.');
    setBusy('save');
    try {
      const changed = p !== null && p !== Number(item.amount);
      const result = { note: note.trim(), newPrice: p, at: new Date().toISOString() };
      await onSave({
        amount: changed ? p : item.amount,
        price_history: changed ? [...(item.price_history ?? []), { date: today(), amount: p }].slice(-24) : item.price_history,
        details: { ...item.details, ...(n ? { negotiate: { ...n, result } } : {}) },
      });
      toast('ok', changed ? `Saved: ${item.name} is now $${p.toFixed(2)}.` : 'Saved.');
      onClose();
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const sameKey = n && n.key === `${Number(item.amount).toFixed(2)}|${item.cycle}|${okSwitch ? 1 : 0}`;
  return (
    <Sheet title="💬 Get a lower price" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">A short script to call or chat with <b>{item.name}</b> and ask for a better price than <Money n={Number(item.amount)} />. Companies often have loyalty discounts they only give when you ask.</p>
        <div className="card !py-1">
          <Field label="I’m OK to switch company" hint="Only then does the script mention cancelling. Off = just ask nicely.">
            <Toggle on={okSwitch} onChange={setOkSwitch} label="I’m OK to switch company" />
          </Field>
        </div>
        {n && sameKey ? (
          <>
            <ScriptView s={n.script} by={n.by} />
            <div className="flex flex-wrap gap-2">
              <button className="btn flex-1" onClick={() => void navigator.clipboard?.writeText(asText(item, n.script)).then(() => toast('ok', 'Copied.'), () => toast('err', 'Couldn’t copy.'))}>📋 Copy</button>
              <button className="btn flex-1" disabled={!!busy} onClick={() => { if (confirm('Write a new script? It uses 1 AI read.')) void write(true); }}>{busy === 'write' ? <span className="spinner" /> : '↻ New script'}</button>
            </div>
          </>
        ) : (
          <button className="btn-primary w-full" disabled={!!busy} onClick={() => void write()}>{busy === 'write' ? <><span className="spinner" /> Writing…</> : n ? '💬 Write the script for this price' : '💬 Write my script'}</button>
        )}
        {busy === 'write' && !sameKey && <div className="space-y-2" role="status" aria-label="Writing">{[0, 1, 2].map((k) => <div key={k} className="skel h-16 w-full !rounded-[20px]" />)}</div>}
        {!n && <p className="text-xs text-slate-500 dark:text-slate-400">1 AI read (free AIs first, Claude only if they can’t). Kept for this price, so opening it again is free.</p>}

        <div className="card space-y-2">
          <p className="label">How did it go?</p>
          <textarea className="input w-full py-2" rows={2} placeholder="e.g. Spoke to Sam, $15 off for 12 months" value={note} onChange={(e) => setNote(e.target.value)} aria-label="How it went" />
          <Field label="New price" hint={`Now $${Number(item.amount).toFixed(2)}. Leave empty if it stayed the same.`}>
            <input className="input w-28" type="number" inputMode="decimal" step="0.01" min={0} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="New price" />
          </Field>
          <button className="btn-primary w-full" disabled={!!busy} onClick={() => void save()}>{busy === 'save' ? <span className="spinner" /> : 'Save'}</button>
          {n?.result && <p className="text-xs text-slate-500 dark:text-slate-400">Last time ({new Date(n.result.at).toLocaleDateString()}): {n.result.note || '—'}{n.result.newPrice !== null ? ` · new price $${n.result.newPrice.toFixed(2)}` : ''}</p>}
        </div>
      </div>
    </Sheet>
  );
}
