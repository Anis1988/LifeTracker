import { admin, connection, env, open, saveConnection, sign } from '../_shared/server.ts';
import { exchange } from '../_shared/google.ts';
import { syncUser } from '../_shared/sync.ts';

/**
 * Google sends you back here after you allow Calendar / Gmail. Public (no sign-in header), so the "state" is signed
 * by the server and only accepted for 15 minutes. Then back to the app.
 */
Deno.serve(async (req) => {
  const u = new URL(req.url);
  const site = env('SITE_URL') || '/';
  const back = (msg: string, to = site) => Response.redirect(`${to}${to.includes('#') ? '' : '#/settings'}?google=${encodeURIComponent(msg)}`, 302);
  try {
    const [payload, sig] = (u.searchParams.get('state') ?? '').split('.');
    if (!payload || sig !== (await sign(payload))) return back('The Google sign-in link was not valid. Try again from Settings.');
    const st = JSON.parse(atob(payload)) as { u: string; b: string; t: number };
    if (Date.now() - st.t > 15 * 60_000) return back('The Google sign-in took too long. Try again from Settings.');
    const to = site && st.b.startsWith(new URL(site).origin) ? st.b.split('#')[0] : site;
    if (u.searchParams.get('error')) return back('Google sign-in was cancelled.', to);
    const t = await exchange(u.searchParams.get('code') ?? '');
    const db = admin();
    const cur = await connection(db, st.u, 'google');
    // Google gives a refresh token only the first time: keep the old one when none comes back.
    const refreshToken = t.refresh_token ?? (cur ? await open(cur.secret) : '');
    if (!refreshToken) return back('Google didn’t give a lasting sign-in. Remove LifeTracker at myaccount.google.com → Security → Third-party access, then try again.', to);
    const email = t.id_token ? (JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string }).email : undefined;
    await saveConnection(db, st.u, 'google', refreshToken, { scope: t.scope ?? '', email: email ?? cur?.meta.email ?? null, connectedAt: new Date().toISOString() });
    // Fill the calendar / read recent emails now, in the background.
    const { data: user } = await db.auth.admin.getUserById(st.u);
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(syncUser(db, st.u, user.user?.email).catch(() => undefined));
    return back('connected', to);
  } catch (e) {
    return back(`Google: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
  }
});
