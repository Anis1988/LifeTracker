/**
 * Supabase answers at most 1,000 rows per request (whatever .limit() says): this reads page after page, up to `max`.
 * `page(from, to)` builds the same ordered query with `.range(from, to)`. Plain TS: used by the app and the server.
 */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, Math.min(from + 999, max - 1));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
