package app.lifetracker;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 💬 Sends appointment texts (already past the free check) to the "texts" server function with this phone's key,
 * and shows "📅 Added to your calendar…" for each one added, moved or cancelled. No internet? They wait in a small
 * queue (at most 50) and go with the next text or when the app opens. The key and the queue stay in the app's own
 * private storage.
 */
final class TextSender {
    static final String PREFS = "lt_texts";
    private static final String CHANNEL = "appointments";

    private TextSender() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static boolean isOn(Context c) {
        SharedPreferences p = prefs(c);
        return p.getBoolean("on", false) && !p.getString("key", "").isEmpty();
    }

    static synchronized void queue(Context c, JSONArray texts) {
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
            java.util.Set<String> have = new java.util.HashSet<>();
            for (int i = 0; i < q.length(); i++) have.add(q.get(i).toString());
            for (int i = 0; i < texts.length(); i++) if (have.add(texts.get(i).toString())) q.put(texts.get(i));
            while (q.length() > 50) q.remove(0);
            prefs(c).edit().putString("queue", q.toString()).commit(); // written now, before anything is sent
        } catch (Exception ignored) {}
    }

    /** A copy of what is waiting (nothing is removed until it has really been sent: see sendQueued). */
    static synchronized JSONArray peekQueue(Context c) {
        try { return new JSONArray(prefs(c).getString("queue", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    /** Takes these (sent or given up) out of the queue; anything added meanwhile stays. */
    static synchronized void dropFromQueue(Context c, java.util.Set<String> done) {
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]")), keep = new JSONArray();
            for (int i = 0; i < q.length(); i++) if (!done.contains(q.get(i).toString())) keep.put(q.get(i));
            prefs(c).edit().putString("queue", keep.toString()).commit();
        } catch (Exception ignored) {}
    }

    /**
     * Sends everything waiting. The texts stay saved on the phone until the server has them, so if Android stops the
     * app half-way they are sent next time instead of being lost.
     */
    static synchronized int sendQueued(Context c) {
        JSONArray q = peekQueue(c);
        if (q.length() == 0 || !isOn(c)) return 0;
        java.util.Set<String> done = new java.util.HashSet<>();
        int sent = send(c, q, done);
        dropFromQueue(c, done);
        return sent;
    }

    static int queued(Context c) {
        try { return new JSONArray(prefs(c).getString("queue", "[]")).length(); } catch (Exception e) { return 0; }
    }

    /** Sends (off the main thread). `done` gets every text the server answered for; the rest stays queued. */
    private static int send(Context c, JSONArray texts, java.util.Set<String> done) {
        if (texts.length() == 0 || !isOn(c)) return 0;
        SharedPreferences p = prefs(c);
        int sent = 0;
        for (int start = 0; start < texts.length(); start += 20) {
            JSONArray part = new JSONArray();
            for (int i = start; i < Math.min(texts.length(), start + 20); i++) part.put(texts.opt(i));
            try {
                JSONObject body = new JSONObject().put("key", p.getString("key", "")).put("texts", part);
                HttpURLConnection h = (HttpURLConnection) new URL(p.getString("url", "")).openConnection();
                h.setRequestMethod("POST");
                h.setConnectTimeout(15000);
                h.setReadTimeout(60000);
                h.setDoOutput(true);
                h.setRequestProperty("Content-Type", "application/json");
                try (OutputStream o = h.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
                int code = h.getResponseCode();
                if (code == 401) { p.edit().putBoolean("on", false).apply(); return sent; } // key replaced: turn it on again in Settings
                if (code == 400) { for (int i = 0; i < part.length(); i++) done.add(part.get(i).toString()); continue; } // never accepted: don't retry forever
                if (code < 200 || code >= 300) continue; // stays queued
                JSONObject res = new JSONObject(read(h.getInputStream()));
                JSONArray results = res.optJSONArray("results");
                JSONArray retry = new JSONArray();
                for (int i = 0; results != null && i < results.length(); i++) {
                    JSONObject r = results.getJSONObject(i);
                    String what = r.optString("result");
                    if ("error".equals(what)) { retry.put(part.opt(i)); continue; } // AI limits: try again later
                    done.add(part.get(i).toString());
                    if ("added".equals(what) || "moved".equals(what) || "cancelled".equals(what)) notify(c, what, r.optString("title"), r.optString("when"));
                }
                sent += part.length() - retry.length();
            } catch (Exception e) {
                // no internet: stays queued
            }
        }
        return sent;
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
        return b.toString("UTF-8");
    }

    private static void notify(Context c, String what, String title, String when) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Appointments", NotificationManager.IMPORTANCE_DEFAULT));
        String head = "added".equals(what) ? "📅 Added to your calendar" : "moved".equals(what) ? "📅 Appointment moved" : "📅 Appointment cancelled";
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder n = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(head)
            .setContentText(title + (when.isEmpty() ? "" : " · " + when))
            .setAutoCancel(true)
            .setContentIntent(pi);
        nm.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), n.build());
    }
}
