import { Empty } from './ui';
import { SearchBox } from './Contacts';

/** One Settings section as a tile: its icon, its name and one short live line ("On · 45245", "Off"…). */
export type SettingsTile = { id: string; icon: string; title: string; status: string; off?: boolean; words?: string; href?: string };

/** Search over the tile's name, its line and the words of the settings inside it (every word typed must be there). */
export function matchTile(t: SettingsTile, q: string): boolean {
  const hay = `${t.title} ${t.status} ${t.words ?? ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** Deep link to one section: "#/settings/nearby" opens Settings with Nearby open. */
export const settingsHref = (id: string) => `#/settings/${id}`;

export function SettingsSearch({ q, onChange }: { q: string; onChange: (q: string) => void }) {
  return <SearchBox q={q} onChange={onChange} placeholder="Search settings: zip, PIN, Gmail, budget…" label="Search settings" />;
}

/** The grid: 2 tiles across on phones, 3 on tablets, 4 on big screens. */
export function SettingsTiles({ tiles, q = '', onOpen }: { tiles: SettingsTile[]; q?: string; onOpen?: (id: string) => void }) {
  const shown = tiles.filter((t) => matchTile(t, q));
  if (!shown.length) return <Empty icon="🔍">No setting matches “{q}”.</Empty>;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {shown.map((t) => {
        const inner = (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="tile" aria-hidden="true">{t.icon}</span>
              {t.href && <span aria-hidden="true" className="text-slate-400">↗</span>}
            </span>
            <span className="mt-auto block pt-3 font-display text-[15.5px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{t.title}</span>
            <span className={`mt-0.5 line-clamp-2 block text-xs leading-snug ${t.off ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
              {!t.href && <span aria-hidden="true" className={`mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full ${t.off ? 'bg-slate-300 dark:bg-slate-600' : 'bg-teal-500 shadow-[0_0_8px_rgba(45,212,191,0.8)] dark:bg-teal-300'}`} />}
              {t.status}
            </span>
          </>
        );
        const cls = 'card tap flex min-h-[132px] flex-col !p-3.5 text-left';
        return t.href
          ? <a key={t.id} href={t.href} className={cls}>{inner}</a>
          : <button key={t.id} type="button" className={cls} aria-haspopup="dialog" onClick={() => onOpen?.(t.id)}>{inner}</button>;
      })}
    </div>
  );
}
