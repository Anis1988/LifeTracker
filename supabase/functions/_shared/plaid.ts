import { env } from './server.ts';

/**
 * 🏦 Plaid (plaid.com): read-only bank and card transactions. Free "Trial" plan: up to 10 bank logins.
 * You connect each bank in Plaid's own window (Plaid Link) inside the app; the server swaps the one-time
 * "public token" for an access token (kept encrypted) and reads new transactions every morning.
 * Secrets: PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV (production by default; "sandbox" for test banks).
 */
export const plaidReady = () => !!(env('PLAID_CLIENT_ID') && env('PLAID_SECRET'));
const base = () => `https://${env('PLAID_ENV') === 'sandbox' ? 'sandbox' : 'production'}.plaid.com`;

export class PlaidError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env('PLAID_CLIENT_ID'), secret: env('PLAID_SECRET'), ...body }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = j as { error_code?: string; error_message?: string; display_message?: string | null };
    throw new PlaidError(`Plaid: ${e.display_message || e.error_message || `HTTP ${res.status}`}`, e.error_code ?? 'UNKNOWN');
  }
  return j as T;
}

/** A one-time token that opens Plaid's bank login window (Plaid Link) in the app. */
/** With `accessToken`: "update mode", to log in to a bank again when it asks (ITEM_LOGIN_REQUIRED). */
export async function linkToken(userId: string, redirectUri?: string, accessToken?: string): Promise<string> {
  const r = await call<{ link_token: string }>('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'LifeTracker',
    ...(accessToken ? { access_token: accessToken } : { products: ['transactions'], transactions: { days_requested: 730 } }),
    country_codes: ['US', 'CA'],
    language: 'en',
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  });
  return r.link_token;
}

export async function exchange(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const r = await call<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken });
  return { accessToken: r.access_token, itemId: r.item_id };
}

export const removeItem = (accessToken: string) => call('/item/remove', { access_token: accessToken }).catch(() => undefined);

export interface PlaidAccount { account_id: string; name: string; mask?: string | null; type: string; subtype?: string | null; balances: { current: number | null; iso_currency_code: string | null } }
export interface PlaidTx { transaction_id: string; account_id: string; amount: number; date: string; name: string; merchant_name?: string | null; pending: boolean; iso_currency_code?: string | null }

export const accounts = async (accessToken: string) => (await call<{ accounts: PlaidAccount[] }>('/accounts/get', { access_token: accessToken })).accounts;

/**
 * New, changed and removed transactions since the saved cursor (all history the first time).
 * Plaid's amounts are positive for money going OUT; the app uses negative for money out.
 */
export async function syncTransactions(accessToken: string, cursor?: string): Promise<{ added: PlaidTx[]; modified: PlaidTx[]; removed: string[]; cursor: string }> {
  const added: PlaidTx[] = [], modified: PlaidTx[] = [], removed: string[] = [];
  let next = cursor ?? '';
  for (let page = 0; page < 50; page++) {
    const r = await call<{ added: PlaidTx[]; modified: PlaidTx[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }>(
      '/transactions/sync', { access_token: accessToken, count: 500, ...(next ? { cursor: next } : {}) });
    added.push(...r.added);
    modified.push(...r.modified);
    removed.push(...r.removed.map((x) => x.transaction_id));
    next = r.next_cursor;
    if (!r.has_more) break;
  }
  return { added, modified, removed, cursor: next };
}
