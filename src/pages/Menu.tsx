import { useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { SearchBox } from '../components/Contacts';
import { MenuList } from '../components/Menu';

/** ☰ Menu: every page in one place (Places and Me live here on phones), with a search over the page names. */
export function MenuPage({ onSearch, meCount = 0 }: { onSearch?: () => void; meCount?: number }) {
  const st = useStore();
  const [q, setQ] = useState('');
  const signOut = () => { if (confirm('Sign out of LifeTracker on this device?')) void supabase.auth.signOut(); };
  return (
    <div className="stagger mx-auto max-w-2xl space-y-3">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight">Menu</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Every page in one place. Tap one to open it.</p>
      </div>
      <SearchBox q={q} onChange={setQ} placeholder="Find a page: bills, vault, zip…" label="Find a page" />
      <MenuList q={q} saved={st.settings.reports.saved} meCount={meCount} onSearch={onSearch} onSignOut={signOut} />
    </div>
  );
}
