import { createClient } from '@supabase/supabase-js';

/** The two public values from Supabase → Project Settings → API (safe in the browser: Row Level Security protects the data). */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = !!(url && key);
export const supabase = createClient(url || 'https://example.supabase.co', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

/** The app's server (supabase/functions/api): bank, Google, AI and "Sync now". */
export async function api<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('api', { body: { action, ...body } });
  if (error) {
    // The function's own message ("Please sign in.", "No AI could read it…") is in the response body.
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => undefined) : undefined;
    throw new Error(msg || error.message);
  }
  return data as T;
}

/** The address the app is open at (for sign-in links and coming back from Google). */
export const siteUrl = () => `${location.origin}${location.pathname}`;
