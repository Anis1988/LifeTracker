import { useEffect, useState } from 'react';
import type { Settings } from '../../supabase/functions/_shared/model.ts';
import { errText, toast } from './ui';

type Me = Settings['me'];
const FIELDS: { key: keyof Me; label: string; placeholder: string; type: string; max: number; icon: string }[] = [
  { key: 'names', label: 'Your name (and other spellings)', placeholder: 'First Last', type: 'text', max: 4, icon: '🙂' },
  { key: 'places', label: 'City or town', placeholder: 'e.g. Orlando FL', type: 'text', max: 3, icon: '📍' },
  { key: 'emails', label: 'Emails', placeholder: 'you@example.com', type: 'email', max: 5, icon: '✉️' },
  { key: 'phones', label: 'Phone numbers', placeholder: '(555) 123-4567', type: 'tel', max: 3, icon: '📞' },
  { key: 'usernames', label: 'Usernames (social media, games…)', placeholder: 'username', type: 'text', max: 5, icon: '@' },
];
const EMPTY_TEXT: Record<keyof Me, string> = { names: '', places: '', emails: '', phones: '', usernames: '' };

/** What you typed but didn't add yet counts too: it is added when you tap Save. */
function merged(draft: Me, text: Record<keyof Me, string>): Me {
  const out = { ...draft };
  for (const f of FIELDS) {
    const v = text[f.key].trim();
    if (v && !out[f.key].some((x) => x.toLowerCase() === v.toLowerCase())) out[f.key] = [...out[f.key], v].slice(0, f.max);
  }
  return out;
}

/**
 * 👤 About me: a small form (Settings and Me). Changes are kept as you type and saved together with the Save
 * button; a pop-up confirms what was saved. Also drawn in the Guide with made-up data (`example`).
 */
export function AboutMe({ me, onSave, onCheck, example }: { me: Me; onSave?: (me: Me) => Promise<void>; onCheck?: () => void; example?: boolean }) {
  const [draft, setDraft] = useState<Me>(me);
  const [text, setText] = useState(EMPTY_TEXT);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Me | null>(null);
  // Saved elsewhere (another device, the other copy of this form): show it.
  const key = JSON.stringify(me);
  useEffect(() => { setDraft(JSON.parse(key) as Me); }, [key]);

  const next = merged(draft, text);
  const dirty = JSON.stringify(next) !== JSON.stringify(me);
  const add = (k: keyof Me) => { setDraft(merged(draft, { ...EMPTY_TEXT, [k]: text[k] })); setText((t) => ({ ...t, [k]: '' })); };
  const remove = (k: keyof Me, v: string) => setDraft((d) => ({ ...d, [k]: d[k].filter((x) => x !== v) }));
  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    try {
      await onSave(next);
      setDraft(next);
      setText(EMPTY_TEXT);
      setSaved(next);
    } catch (e) { toast('err', `Not saved: ${errText(e)}`); }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label htmlFor={`me-${f.key}`} className="text-sm font-medium">{f.label}</label>
          <div className="flex gap-2">
            <input id={`me-${f.key}`} className="input min-w-0 flex-1" type={f.type} placeholder={f.placeholder} value={text[f.key]} disabled={draft[f.key].length >= f.max}
              onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && add(f.key)} />
            <button className="btn" onClick={() => add(f.key)} disabled={!text[f.key].trim()} aria-label={`Add another ${f.label.toLowerCase()}`}>＋</button>
          </div>
          {draft[f.key].length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {draft[f.key].map((v) => (
                <span key={v} className="chip border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                  {v}<button className="ml-0.5 text-emerald-700/60 hover:text-red-600 dark:text-emerald-300/60" aria-label={`Remove ${v}`} onClick={() => remove(f.key, v)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button className="btn-primary" disabled={busy || !dirty || example} onClick={() => void save()}>{busy ? <><span className="spinner" /> Saving…</> : '💾 Save'}</button>
        <span className={`text-xs ${dirty ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-slate-400'}`}>{dirty ? 'Not saved yet' : '✓ Saved'}</span>
      </div>
      {saved && <SavedPopup me={saved} onClose={() => setSaved(null)} onCheck={onCheck ? () => { setSaved(null); onCheck(); } : undefined} />}
    </div>
  );
}

/** The "Saved" pop-up: what LifeTracker will look for, and a shortcut to the first search. */
export function SavedPopup({ me, onClose, onCheck }: { me: Me; onClose: () => void; onCheck?: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const n = FIELDS.reduce((a, f) => a + me[f.key].length, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-[fade_.2s_ease-out]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="saved-title" className="w-full max-w-sm space-y-4 rounded-3xl bg-[#fbf9f4] p-6 text-center shadow-2xl animate-[pop_.25s_ease-out] dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300" aria-hidden="true">✓</div>
        <div className="space-y-1">
          <h2 id="saved-title" className="text-xl font-semibold">About me saved</h2>
          <p className="text-sm text-stone-600 dark:text-slate-300">{n} detail{n === 1 ? '' : 's'} kept privately. LifeTracker will look for these online:</p>
        </div>
        <ul className="space-y-1 text-left text-sm">
          {FIELDS.filter((f) => me[f.key].length).map((f) => (
            <li key={f.key} className="flex gap-2 rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-800/70">
              <span aria-hidden="true" className="w-5 text-center">{f.icon}</span>
              <span className="min-w-0 flex-1 break-words">{me[f.key].join(', ')}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          {onCheck && me.names.length + me.emails.length > 0 && <button className="btn-primary w-full" onClick={onCheck}>🔎 Look for me now</button>}
          <button className="btn w-full" onClick={onClose} autoFocus>Done</button>
        </div>
      </div>
    </div>
  );
}
