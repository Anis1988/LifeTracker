import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.58.0';
import { withDefaults, type Settings } from './model.ts';

/** Server-side helpers for the Supabase Edge Functions (Deno). */
export const env = (k: string) => Deno.env.get(k)?.trim() ?? '';

/** The service client: full access, server only (never sent to the app). */
export const admin = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const ORIGIN = () => env('SITE_URL') || '*';
export const cors = () => ({
  'Access-Control-Allow-Origin': ORIGIN() === '*' ? '*' : new URL(ORIGIN()).origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  Vary: 'Origin',
});
/** The Android app (branch "android") runs the same screens from https://localhost: allow it as well as the website. */
const APP_ORIGINS = ['https://localhost', 'capacitor://localhost'];
export function withCors(res: Response, req: Request): Response {
  const o = req.headers.get('origin');
  if (o && APP_ORIGINS.includes(o)) res.headers.set('Access-Control-Allow-Origin', o);
  return res;
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors() } });
export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/**
 * "Just for me" for now: LT_ALLOWED_EMAILS (comma list) limits who may use the automatic parts (bank, Google, AI).
 * Empty = anyone with an account (for when the app opens to others).
 */
export function allowed(email: string | undefined): boolean {
  const list = env('LT_ALLOWED_EMAILS').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  return !list.length || (!!email && list.includes(email.toLowerCase()));
}

/** The signed-in user calling this function (from the Authorization header). */
export async function userOf(req: Request): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) throw new HttpError('Please sign in.', 401);
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError('Your sign-in expired: sign in again.', 401);
  if (!allowed(data.user.email)) throw new HttpError('This account isn’t allowed to use the automatic features yet.', 403);
  return data.user;
}

export async function settingsOf(db: SupabaseClient, userId: string): Promise<Settings> {
  const { data } = await db.from('settings').select('data').eq('user_id', userId).maybeSingle();
  return withDefaults((data?.data ?? {}) as Partial<Settings>);
}

// ---------- secrets at rest (bank access link, Google login): AES-GCM with LT_SECRET_KEY ----------
async function key(): Promise<CryptoKey> {
  const raw = env('LT_SECRET_KEY');
  if (raw.length < 16) throw new HttpError('The server is missing LT_SECRET_KEY (a long random text): add it in Supabase → Edge Functions → Secrets.', 500);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function seal(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(text)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function open(sealed: string): Promise<string> {
  const [iv, ct] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(ct)));
}

export interface Connection { user_id: string; kind: string; secret: string; meta: Record<string, unknown>; updated_at: string }
/** kind: simplefin | google | status. */
export async function connection(db: SupabaseClient, userId: string, kind: string): Promise<Connection | null> {
  const { data } = await db.from('connections').select('*').eq('user_id', userId).eq('kind', kind).maybeSingle();
  return (data as Connection | null) ?? null;
}
export async function saveConnection(db: SupabaseClient, userId: string, kind: string, secret: string | null, meta: Record<string, unknown>) {
  const cur = await connection(db, userId, kind);
  const row = { user_id: userId, kind, secret: secret === null ? cur?.secret ?? '' : await seal(secret), meta: { ...(cur?.meta ?? {}), ...meta }, updated_at: new Date().toISOString() };
  const { error } = await db.from('connections').upsert(row);
  if (error) throw new Error(error.message);
}

/** Signed short-lived values (the Google login "state"), so nobody can attach their Google account to yours. */
export async function sign(value: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('LT_SECRET_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(value)));
  return b64(sig).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]!));
}

