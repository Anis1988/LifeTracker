import { admin, allowed, env, json } from '../_shared/server.ts';
import { syncUser } from '../_shared/sync.ts';
import { slotOf } from '../_shared/model.ts';

/**
 * ⏰ The daily automatic run (pg_cron calls it every morning, see the migration), and the quarter-hour email look.
 * Protected by CRON_SECRET.
 * Runs everyone who uses the app (or only LT_ALLOWED_EMAILS), one at a time.
 */
Deno.serve(async (req) => {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not allowed.' }, 401);
  // {"only":"appts","at":…} = the email look (pg_cron "lifetracker-appointments", every quarter hour): new appointments,
  // and also bank alert emails, bills, orders, receipts (→ Spending) and document attachments (part "mail"), for each
  // person whose 📬 Email checks setting is due in this slot (`at` rounded to the quarter hour); nothing = the whole morning run.
  const body = await req.json().catch(() => ({})) as { only?: string; at?: string };
  const slot = slotOf(Date.parse(body.at ?? '') || Date.now());
  const only = body.only === 'appts' ? { only: ['appts' as const, 'mail' as const], slot } : {};
  const db = admin();
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const users = (data?.users ?? []).filter((u) => allowed(u.email));
  const work = (async () => {
    for (const u of users) {
      const r = await syncUser(db, u.id, u.email, only).catch((e) => ({ steps: [], errors: [String(e)], newAlerts: 0 }));
      console.log('cron', u.id, JSON.stringify(r));
    }
  })();
  // Answer at once; the run finishes in the background.
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return json({ ok: true, users: users.length });
});
