import { useEffect, useState } from 'react';
import { apptKind, contactKind, type Appointment, type Contact } from '../../supabase/functions/_shared/model.ts';
import { contactForAppt, fmtPhone } from '../../supabase/functions/_shared/contacts.ts';
import { whenText } from '../../supabase/functions/_shared/apptText.ts';
import { daysBetween, today } from '../../supabase/functions/_shared/money.ts';
import { Sheet, Toggle, errText, toast } from './ui';
import { settingsHref } from './SettingsGrid';
import { recentTexts, textsOff, textsOn, textsState, type TextsState } from '../lib/texts';

const FROM: Record<Appointment['source'], string> = { email: '✉️ Email', text: '💬 Text', hand: '✍️ Added' };

/** 📅 Appointments found in emails and texts: already in your calendar. Also drawn in the Guide (made-up, no buttons). */
export function ApptCard({ appts, onRemove, max = 5, emailOn = true, contacts = [] }: { appts: Appointment[]; onRemove?: (a: Appointment) => Promise<void>; max?: number; emailOn?: boolean; contacts?: Contact[] }) {
  const [open, setOpen] = useState<Appointment | null>(null);
  const [all, setAll] = useState(false);
  const t = today();
  const list = appts.filter((a) => a.status === 'booked' && a.day >= t);
  return (
    <section className="card rise space-y-1">
      <div className="flex items-center justify-between">
        <p className="label">📅 Appointments</p>
        {list.length > max && <button className="chip -my-2 border-teal-500/30 px-2.5 py-1 text-teal-800 dark:border-teal-300/30 dark:text-teal-200" onClick={() => setAll(true)}>See all {list.length}</button>}
      </div>
      {list.length ? <ApptList list={list.slice(0, max)} onOpen={setOpen} /> : (
        <p className="py-2 text-sm text-slate-500 dark:text-slate-400">{emailOn ? 'Appointments in your emails (and texts, in the Android app) show up here and go straight into your calendar.' : <>Off: turn it on in <a className="tap underline decoration-teal-500/50 underline-offset-2" href={settingsHref('appts')}>Settings → Appointments</a>.</>}</p>
      )}
      {all && <Sheet title="Appointments" onClose={() => setAll(false)}><ApptList list={list} onOpen={(a) => { setAll(false); setOpen(a); }} /></Sheet>}
      {open && <Sheet title={open.title} onClose={() => setOpen(null)}><ApptDetails a={open} contact={contactForAppt(contacts, open)} onRemove={onRemove && (async () => { await onRemove(open); setOpen(null); })} /></Sheet>}
    </section>
  );
}

function ApptList({ list, onOpen }: { list: Appointment[]; onOpen: (a: Appointment) => void }) {
  const t = today();
  return (
    <ul>
      {list.map((a) => {
        const left = daysBetween(t, a.day);
        return (
          <li key={a.id} className="border-t border-slate-900/[0.06] first:border-0 dark:border-white/[0.06]">
            <button className="tap -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left" onClick={() => onOpen(a)}>
              <span className="w-11 shrink-0 text-center">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{left === 0 ? 'Today' : left === 1 ? 'Tmrw' : new Date(`${a.day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
                <span className="num block text-lg font-semibold">{a.day.slice(8, 10)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold"><span aria-hidden="true">{apptKind(a.kind).icon} </span>{a.title}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{whenText(a).split(' · ')[1]}{a.place ? ` · ${a.place}` : a.with_who ? ` · ${a.with_who}` : ''}</span>
              </span>
              <span className="chip shrink-0 border-slate-900/10 px-2 py-0.5 text-[11px] text-slate-600 dark:border-white/10 dark:text-slate-300">{FROM[a.source]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ApptDetails({ a, onRemove, contact }: { a: Appointment; onRemove?: () => Promise<void>; contact?: Contact }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    // Found by itself: removed at once (it's the Undo). One you added yourself: asked first.
    if (!onRemove || (a.source === 'hand' && !confirm(`Remove “${a.title}” from your calendar?`))) return;
    setBusy(true);
    try { await onRemove(); toast('ok', 'Removed from your calendar.'); } catch (e) { toast('err', errText(e)); setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="panel space-y-1 text-sm">
        <p className="text-base font-semibold"><span aria-hidden="true">{apptKind(a.kind).icon} </span>{whenText(a)}{a.minutes ? ` (${a.minutes} min)` : ''}</p>
        {a.with_who && <p>With <b>{a.with_who}</b></p>}
        {a.place && <p>📍 <a className="underline decoration-dotted underline-offset-2" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.place)}`} target="_blank" rel="noopener noreferrer">{a.place}</a></p>}
        {a.notes && <p className="text-slate-600 dark:text-slate-300">📝 {a.notes}</p>}
      </div>
      {contact && (
        <div className="panel flex items-center gap-2 !py-2">
          <a href={`#/contacts?c=${contact.id}`} className="tap flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-2xl text-sm">
            <span aria-hidden="true">{contactKind(contact.kind).icon}</span>
            <span className="min-w-0"><span className="block truncate font-semibold">{contact.name}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{contact.phones[0] ? fmtPhone(contact.phones[0]) : 'Open in Contacts'}</span></span>
          </a>
          {contact.phones[0] && <a className="btn shrink-0 text-xs" href={`tel:${contact.phones[0].replace(/[^\d+]/g, '')}`}>📞 Call</a>}
        </div>
      )}
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        {a.history.map((h, i) => <p key={i}>{new Date(h.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {h.what}</p>)}
        <p>✓ In your LifeTracker calendar in Google, with reminders.</p>
      </div>
      {onRemove && <button className="btn w-full text-red-700 dark:text-red-300" disabled={busy} onClick={() => void remove()}>{busy ? <span className="spinner" /> : '🗑 Wrong? Remove it'}</button>}
    </div>
  );
}

/** 💬 Texts (Android app only): turning it on links this phone, then reads the last 30 days of texts on the phone. */
export function TextsSetup({ getKey, phone }: { getKey: () => Promise<{ key: string; url: string }>; phone?: { since: string | null; lastText: string | null } }) {
  const [st, setSt] = useState<TextsState | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { void textsState().then(setSt); }, []);
  if (!st) return null;
  if (!st.supported) return (
    <div className="panel text-sm">
      <p className="font-medium">💬 Text messages</p>
      <p className="text-slate-600 dark:text-slate-300">Only in the LifeTracker <b>Android app</b>: a website can’t read Google Messages. In the app, turn this on here and allow “SMS”. Texts are checked on the phone first; only ones that look like appointments are sent.</p>
    </div>
  );
  const turnOn = async () => {
    setBusy('on');
    try {
      const { key, url } = await getKey();
      const next = await textsOn(key, url);
      setSt(next);
      if (!next.on) { toast('err', 'LifeTracker needs the SMS permission to read appointment texts.'); return; }
      setBusy('recent');
      const recent = await recentTexts(30);
      let added = 0;
      for (let i = 0; i < recent.length; i += 20) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, texts: recent.slice(i, i + 20) }) });
        const j = (await r.json().catch(() => ({}))) as { results?: { result: string }[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        added += (j.results ?? []).filter((x) => x.result === 'added').length;
      }
      toast('ok', `Texts on. ${recent.length ? `${recent.length} recent text(s) looked like appointments: ${added} added to your calendar.` : 'New appointment texts will go to your calendar.'}`);
    } catch (e) { toast('err', errText(e)); }
    setBusy('');
  };
  const turnOff = async () => { await textsOff(); setSt(await textsState()); };
  return (
    <div className="panel space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <p className="flex-1 font-medium">💬 Read appointment texts</p>
        {busy ? <span className="spinner" /> : <Toggle on={st.on} onChange={(v) => void (v ? turnOn() : turnOff())} label="Texts" />}
      </div>
      <p className="text-slate-600 dark:text-slate-300">Normal texts (SMS) from your doctor, dentist, garage… Checked on the phone first: other texts never leave it, and texts aren’t kept. Chat messages between Google Messages users (RCS) can’t be read.</p>
      {busy === 'recent' && <p className="text-xs text-slate-500">Looking at the last 30 days of texts…</p>}
      {st.on && <p className="text-xs text-slate-500">{phone?.lastText ? `Last appointment text: ${new Date(phone.lastText).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No appointment text yet.'}{st.queued ? ` · ${st.queued} waiting for internet` : ''}</p>}
    </div>
  );
}
