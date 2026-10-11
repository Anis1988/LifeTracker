/**
 * Plaid's own bank login window (Plaid Link), loaded only when you tap "Connect a bank".
 * Your bank password goes to Plaid, never to LifeTracker.
 */
interface PlaidHandler { open: () => void; destroy: () => void }
interface PlaidMeta { institution?: { name?: string } | null }
declare global {
  interface Window { Plaid?: { create: (o: { token: string; onSuccess: (publicToken: string, meta: PlaidMeta) => void; onExit: (err: { display_message?: string; error_message?: string } | null) => void }) => PlaidHandler } }
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  loading ??= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.onload = () => ok();
    s.onerror = () => { loading = null; fail(new Error('Plaid’s window couldn’t load. Check your connection (or an ad blocker) and try again.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Plaid Link; resolves with the one-time token and the bank's name, or null if you closed it. */
export async function openPlaid(token: string): Promise<{ publicToken: string; institution: string } | null> {
  await load();
  return new Promise((resolve, reject) => {
    const h = window.Plaid!.create({
      token,
      onSuccess: (publicToken, meta) => { h.destroy(); resolve({ publicToken, institution: meta.institution?.name ?? 'Bank' }); },
      onExit: (err) => { h.destroy(); if (err) reject(new Error(err.display_message || err.error_message || 'Plaid stopped.')); else resolve(null); },
    });
    h.open();
  });
}
