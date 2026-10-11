import { admin, allowed, env, json } from '../_shared/server.ts';
import { syncUser } from '../_shared/sync.ts';

/**
 * ⏰ The daily automatic run (pg_cron calls it every morning, see the migration). Protected by CRON_SECRET.
 * Runs everyone who uses the app (or only LT_ALLOWED_EMAILS), one at a time.
 */
Deno.serve(async (req) => {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not allowed.' }, 401);
  const db = admin();
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const users = (data?.users ?? []).filter((u) => allowed(u.email));
  const work = (async () => {
    for (const u of users) {
      const r = await syncUser(db, u.id, u.email).catch((e) => ({ steps: [], errors: [String(e)], newAlerts: 0 }));
      console.log('cron', u.id, JSON.stringify(r));
    }
  })();
  // Answer at once; the run finishes in the background.
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return json({ ok: true, users: users.length });
});
