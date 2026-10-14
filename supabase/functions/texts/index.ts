import { z } from 'npm:zod@4.1.12';
import { admin, allowed, connection, cors, json, saveConnection, settingsOf, sign, withCors } from '../_shared/server.ts';
import { applyAppt, dayIn, readAppt, tzOf } from '../_shared/appointments.ts';
import { calendarStep } from '../_shared/sync.ts';
import { looksLikeAppointment, whenText } from '../_shared/apptText.ts';

/**
 * 💬 Appointment texts from the Android app (Google Messages can't be read from outside the phone). The phone only
 * sends texts that passed the free check; they are checked again here, read by the AI (free first, daily limits),
 * put straight in the calendar, and not kept (only the appointment and the sender). No sign-in header: the app
 * sends its own key ("phone-key" in the api function: user id + a number + a signature; a new key replaces the old).
 */
const Body = z.object({
  key: z.string().min(40).max(300),
  texts: z.array(z.object({ from: z.string().max(80), body: z.string().min(4).max(2000), at: z.number() })).min(1).max(20),
});

// The app's screens run from https://localhost: withCors lets them call this too.
Deno.serve(async (req) => withCors(await handle(req), req));

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  try {
    const body = Body.parse(await req.json());
    const [userId, nonce, sig] = body.key.split('.');
    const db = admin();
    const phone = userId && nonce ? await connection(db, userId, 'phone') : null;
    if (!phone || phone.meta.nonce !== nonce || sig !== (await sign(`phone:${userId}:${nonce}`))) return json({ error: 'This phone isn’t linked any more: open LifeTracker → Settings → Appointments and turn texts on again.' }, 401);
    const { data: u } = await db.auth.admin.getUserById(userId);
    if (!u.user || !allowed(u.user.email)) return json({ error: 'Not allowed.' }, 403);
    const s = await settingsOf(db, userId);
    if (!s.appts.on) return json({ results: [], off: true });

    const seen = new Set((phone.meta.seenTexts as string[] | undefined) ?? []);
    const tz = tzOf(s);
    const alerts: Parameters<typeof applyAppt>[7] = [];
    const results: { result: string; title?: string; when?: string }[] = [];
    let changed = 0;
    for (const t of body.texts) {
      const h = await hash(`${t.from}\n${t.body}`);
      if (seen.has(h) || !looksLikeAppointment(t.body)) { results.push({ result: 'skipped' }); continue; }
      const received = dayIn(t.at > 0 ? t.at : Date.now(), tz);
      try {
        const x = await readAppt(db, userId, s, `Text message from: ${t.from}\nReceived: ${received}\n\n${t.body}`, received);
        const r = await applyAppt(db, userId, s, x, 'text', `text:${h.slice(0, 32)}`, t.from, alerts);
        seen.add(h); // only once it is saved: a failed save is tried again
        if (r.result !== 'same' && r.result !== 'skipped') changed++;
        results.push({ result: r.result, title: r.appt?.title, when: r.appt ? whenText(r.appt) : undefined });
      } catch (e) {
        results.push({ result: 'error', title: (e instanceof Error ? e.message : String(e)).slice(0, 160) }); // AI limits: the phone tries again later
      }
    }
    if (alerts.length) await db.from('alerts').upsert(alerts, { onConflict: 'user_id,kind,key', ignoreDuplicates: true });
    if (changed) await calendarStep(db, userId, s).catch((e) => console.log('calendar', String(e)));
    await saveConnection(db, userId, 'phone', null, { seenTexts: [...seen].slice(-500), lastText: new Date().toISOString() });
    return json({ results });
  } catch (e) {
    if (e instanceof z.ZodError) return json({ error: 'Invalid request.' }, 400);
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 500);
  }
}

async function hash(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
