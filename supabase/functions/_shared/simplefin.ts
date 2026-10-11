/**
 * 🏦 SimpleFIN Bridge (bridge.simplefin.org, about $15/year): read-only access to your bank and card
 * transactions, made for personal money apps. You connect your banks on their site, get a one-time "setup token",
 * and paste it in Settings. The app swaps it once for a private access link (kept encrypted on the server).
 * It can only READ: no payments, no transfers.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = atob(setupToken.trim());
    new URL(claimUrl);
  } catch {
    throw new Error('That isn’t a SimpleFIN setup token: copy the long token from bridge.simplefin.org → “New connection”.');
  }
  if (!/^https:\/\//.test(claimUrl)) throw new Error('That setup token doesn’t point to a secure address.');
  const res = await fetch(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 403) throw new Error('This setup token was already used or expired: make a new one on bridge.simplefin.org.');
  if (!res.ok) throw new Error(`SimpleFIN didn’t accept the token (HTTP ${res.status}).`);
  const access = (await res.text()).trim();
  if (!/^https:\/\/[^:\s]+:[^@\s]+@/.test(access)) throw new Error('SimpleFIN sent back something unexpected.');
  return access;
}

export interface SfAccount {
  id: string; name: string; currency: string; balance: string; 'balance-date': number;
  org?: { name?: string; domain?: string };
  transactions?: { id: string; posted: number; amount: string; description: string; payee?: string; memo?: string; pending?: boolean }[];
}

/** Accounts and their transactions since `since` (YYYY-MM-DD). SimpleFIN allows about 90 days per request. */
export async function fetchAccounts(accessUrl: string, since: string): Promise<{ accounts: SfAccount[]; errors: string[] }> {
  const u = new URL(accessUrl);
  const auth = `Basic ${btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`)}`;
  u.username = '';
  u.password = '';
  const base = u.toString().replace(/\/$/, '');
  const start = Math.floor(Date.parse(`${since}T00:00:00Z`) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const accounts = new Map<string, SfAccount>();
  const errors: string[] = [];
  // In 90-day windows, oldest first, so a long first look-back works.
  for (let from = start; from < now; from += 90 * 86400) {
    const to = Math.min(now, from + 90 * 86400);
    const res = await fetch(`${base}/accounts?start-date=${from}&end-date=${to}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 403) throw new Error('SimpleFIN refused the access link: connect your bank again in Settings.');
    if (!res.ok) throw new Error(`SimpleFIN: HTTP ${res.status}`);
    const j = (await res.json()) as { errors?: string[]; accounts?: SfAccount[] };
    errors.push(...(j.errors ?? []));
    for (const a of j.accounts ?? []) {
      const cur = accounts.get(a.id);
      accounts.set(a.id, cur ? { ...a, transactions: [...(cur.transactions ?? []), ...(a.transactions ?? [])] } : a);
    }
  }
  return { accounts: [...accounts.values()], errors: [...new Set(errors)] };
}
