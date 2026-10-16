import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';
import type { Moment } from './timeline';

/** 🗓️ The Android "Coming up" home-screen widget (native code in android/…/ComingUpWidget.java): the app sends the next few things. */
interface Row { date: string; time: string; title: string; amount: string }
const Widget = registerPlugin<{ update: (d: { rows: Row[] }) => Promise<void> }>('Widget');

let last = '';
export function pushWidget(moments: Moment[]): void {
  if (!isNative()) return;
  // A few extra rows, so the widget still has 3 after a day passes without the app being opened.
  const rows = moments.slice(0, 8).map((m) => ({ date: m.date, time: m.time ?? '', title: m.title, amount: m.amount != null ? `$${m.amount.toFixed(2)}` : '' }));
  const key = JSON.stringify(rows);
  if (key === last) return;
  last = key;
  void Widget.update({ rows }).catch(() => undefined);
}
