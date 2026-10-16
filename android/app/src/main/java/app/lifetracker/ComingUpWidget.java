package app.lifetracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 🗓️ Home-screen widget "Coming up": the next 3 things from the timeline (bills with their amount, appointments,
 * renewals, dates…). The app sends the list (WidgetPlugin) each time it loads; past days drop off by themselves.
 * Tap = open the app.
 */
public class ComingUpWidget extends AppWidgetProvider {
    private static final int[] DAY = { R.id.w_d1, R.id.w_d2, R.id.w_d3 };
    private static final int[] TITLE = { R.id.w_t1, R.id.w_t2, R.id.w_t3 };
    private static final int[] AMOUNT = { R.id.w_a1, R.id.w_a2, R.id.w_a3 };
    private static final int[] ROW = { R.id.w_r1, R.id.w_r2, R.id.w_r3 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ComingUpWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    private static String dayWord(String iso, String today, String tomorrow) {
        if (iso.equals(today)) return "Today";
        if (iso.equals(tomorrow)) return "Tomorrow";
        try {
            Date d = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(iso);
            return new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(d);
        } catch (Exception e) {
            return iso;
        }
    }

    static RemoteViews views(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        Calendar c = Calendar.getInstance();
        String today = f.format(c.getTime());
        c.add(Calendar.DAY_OF_YEAR, 1);
        String tomorrow = f.format(c.getTime());
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_coming_up);
        int shown = 0;
        try {
            JSONArray rows = new JSONArray(p.getString("rows", "[]"));
            for (int i = 0; i < rows.length() && shown < 3; i++) {
                JSONObject r = rows.getJSONObject(i);
                String date = r.optString("date", "");
                if (date.compareTo(today) < 0) continue; // already past
                String time = r.optString("time", "");
                v.setTextViewText(DAY[shown], dayWord(date, today, tomorrow) + (time.isEmpty() ? "" : " · " + time));
                v.setTextViewText(TITLE[shown], r.optString("title", ""));
                v.setTextViewText(AMOUNT[shown], r.optString("amount", ""));
                v.setViewVisibility(ROW[shown], View.VISIBLE);
                shown++;
            }
        } catch (Exception ignored) { }
        for (int i = shown; i < 3; i++) v.setViewVisibility(ROW[i], View.GONE);
        if (shown == 0) {
            v.setViewVisibility(R.id.w_empty, View.VISIBLE);
            v.setTextViewText(R.id.w_empty, p.getBoolean("ready", false) ? "Nothing in the next 30 days" : "Open the app once to show what's coming up");
        } else v.setViewVisibility(R.id.w_empty, View.GONE);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_root, pi);
        return v;
    }
}
