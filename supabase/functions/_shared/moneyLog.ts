import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { money } from './money.ts';
import { settingsOf } from './server.ts';
import { categorize, spendCat } from './spend.ts';

/**
 * 📜 Money → Log: short time-stamped lines on what happened (owner's request, like the Trading app's log).
 * Server writes only (table `money_log`, RLS: the owner reads and deletes). A failed log line never stops the real work.
 */
export type LogKind = 'purchase' | 'receipt' | 'bill' | 'change';
export interface LogLine { kind: LogKind; text: string; ref?: string | null; key?: string | null; data?: Record<string, unknown>; at?: string }

export async function logMoney(db: SupabaseClient, userId: string, lines: LogLine[]): Promise<void> {
  if (!lines.length) return;
  const rows = lines.map((l) => ({ user_id: userId, kind: l.kind, text: l.text.slice(0, 300), ref: l.ref ?? null, key: l.key ?? null, data: l.data ?? {}, ...(l.at ? { at: l.at } : {}) }));
  try {
    for (let i = 0; i < rows.length; i += 500) await db.from('money_log').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,key', ignoreDuplicates: true });
  } catch { /* the log is a nice-to-have */ }
}

type TxLike = { id?: string; posted?: string; amount: number; description: string | null; merchant: string | null; item_id?: string | null; source?: string | null; account?: string | null; details?: { store?: string; items?: unknown[] } | null };
export const shopOf = (t: TxLike) => (t.source === 'receipt' ? t.details?.store || t.description : t.description || t.details?.store) || 'Purchase';
export const catText = (t: TxLike, rules: Record<string, string>) => { const c = spendCat(categorize(t, rules)); return `${c.icon} ${c.label}`; };
const FROM: Record<string, string> = { alert: 'bank alert email', csv: 'bank CSV', bank: 'bank link', receipt: 'receipt' };
export const fromText = (t: TxLike, via?: string) => `from ${via ?? (t.source === 'alert' && t.account ? `${t.account} alert` : FROM[t.source ?? 'bank'] ?? 'bank')}`;

/** "Best Buy $25.00 · from BofA alert → 🛍️ Shopping" for each new spending line (money in is left out). */
export function addedLines(rows: TxLike[], rules: Record<string, string>, via?: string): LogLine[] {
  return rows.filter((t) => t.id && Number(t.amount) < 0).map((t) => ({
    kind: 'purchase' as const, ref: t.id!, key: `add:${t.id}`, data: { tx: t.id, source: t.source ?? 'bank', cat: categorize(t, rules) },
    text: `${shopOf(t)} ${money(-Number(t.amount))} · ${fromText(t, via)} → ${catText(t, rules)}`,
  }));
}

/** Rules for the category in a line (one read, only when the caller doesn't have them). */
export const rulesOf = async (db: SupabaseClient, userId: string, rules?: Record<string, string>) => rules ?? (await settingsOf(db, userId).catch(() => null))?.spend.rules ?? {};

/** First open of the Log: "added" lines for this month's purchases already there (from when they were stored). No AI. */
export async function backfillLog(db: SupabaseClient, userId: string, month: string): Promise<number> {
  const { data } = await db.from('transactions').select('id, posted, amount, description, merchant, item_id, source, account, details, created_at')
    .eq('user_id', userId).gte('posted', `${month}-01`).lt('amount', 0).order('posted').limit(2000);
  if (!data?.length) return 0;
  const rules = await rulesOf(db, userId);
  const lines = addedLines(data as TxLike[], rules);
  const at = new Map((data as { id: string; created_at?: string; posted: string }[]).map((r) => [r.id, r.created_at ?? `${r.posted}T12:00:00Z`]));
  await logMoney(db, userId, lines.map((l) => ({ ...l, at: at.get(l.ref as string) })));
  return lines.length;
}

/** Older than 180 days goes (daily run). */
export async function pruneLog(db: SupabaseClient, userId: string): Promise<string | void> {
  const cut = new Date(Date.now() - 180 * 86400_000).toISOString();
  const { count } = await db.from('money_log').delete({ count: 'exact' }).eq('user_id', userId).lt('at', cut);
  if (count) return `${count} old log line(s) removed`;
}
