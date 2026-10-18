import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { connection, open, saveConnection, type Connection } from './server.ts';
import { has, refresh } from './google.ts';

/**
 * ✉️ The Gmail mailboxes LifeTracker watches. The main Google account is the `connections` row "google" (it also holds
 * the Calendar); each extra Google account is its own row "google:<n>" (n = 2, 3, …) with its own encrypted login and
 * its own `meta` (email, scope, on/off, and every step's seen lists / done flags), so nothing is read twice and two
 * mailboxes never clash. Extra accounts are Gmail only (read-only, + gmail.modify only if allowed for that account).
 */
export const EXTRA = 'google:';
export const isGoogleKind = (k: string) => k === 'google' || /^google:\d{1,3}$/.test(k);

export interface Box {
  kind: string; // 'google' or 'google:<n>'
  main: boolean;
  email: string | null;
  scope: string;
  on: boolean; // extras can be switched off (the main one follows its own settings)
  meta: Record<string, unknown>;
  secret: string;
  at?: Promise<string>; // one Google access token per run (they last an hour)
}

const toBox = (c: Connection): Box => ({
  kind: c.kind, main: c.kind === 'google', email: (c.meta.email as string | null) ?? null, scope: (c.meta.scope as string) ?? '',
  on: c.kind === 'google' || c.meta.on !== false, meta: c.meta, secret: c.secret,
});

/** Every Google row of this person: main first, then the extras by number. */
export async function allBoxes(db: SupabaseClient, userId: string): Promise<Box[]> {
  const { data } = await db.from('connections').select('*').eq('user_id', userId).like('kind', 'google%');
  const n = (k: string) => (k === 'google' ? 0 : Number(k.slice(EXTRA.length)) || 999);
  return ((data as Connection[] | null) ?? []).filter((c) => isGoogleKind(c.kind)).map(toBox).sort((a, b) => n(a.kind) - n(b.kind));
}

/** The mailboxes to read now: Gmail allowed and (extras) switched on. */
export async function mailBoxes(db: SupabaseClient, userId: string): Promise<Box[]> {
  return (await allBoxes(db, userId)).filter((b) => b.on && has(b.scope, 'gmail'));
}

/** A Google access token for this mailbox (asked once per run). */
export function tokenOf(b: Box): Promise<string> {
  b.at ??= open(b.secret).then(refresh);
  return b.at;
}

/** "From email (work@…)" for an extra mailbox; nothing for the main one (as before). */
export const boxTag = (b: Box): string | undefined => (b.main ? undefined : b.email ?? b.kind);
/** The step name with the mailbox, for the run log ("Receipts (work@…)"). */
export const boxName = (name: string, b: Box) => (b.main ? name : `${name} (${b.email ?? b.kind})`);

/**
 * A step's own memory for one mailbox. The main mailbox keeps it where it always was (the row `kind`: google, mail,
 * me, vault, receipts, contacts); an extra mailbox keeps it inside its own row (`meta["s:<kind>"]`, or its top level
 * for "google"), so the two never mix.
 */
export async function stateOf(db: SupabaseClient, userId: string, b: Box, kind: string): Promise<Record<string, unknown>> {
  if (b.main) return (await connection(db, userId, kind))?.meta ?? {};
  const c = await connection(db, userId, b.kind);
  if (!c) return {};
  return kind === 'google' ? c.meta : ((c.meta[`s:${kind}`] as Record<string, unknown> | undefined) ?? {});
}
export async function saveState(db: SupabaseClient, userId: string, b: Box, kind: string, patch: Record<string, unknown>): Promise<void> {
  if (b.main) return saveConnection(db, userId, kind, null, patch);
  const c = await connection(db, userId, b.kind);
  if (!c) return; // disconnected during the run: don't bring the row back
  if (kind === 'google') return saveConnection(db, userId, b.kind, null, patch);
  await saveConnection(db, userId, b.kind, null, { [`s:${kind}`]: { ...((c.meta[`s:${kind}`] as Record<string, unknown> | undefined) ?? {}), ...patch } });
}

/** Lets Google forget LifeTracker's access for a disconnected account (best effort). */
export async function revoke(secret: string): Promise<void> {
  const t = await open(secret).catch(() => '');
  if (!t) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
