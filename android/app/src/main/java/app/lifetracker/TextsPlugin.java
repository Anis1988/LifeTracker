package app.lifetracker;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 💬 "Read appointment texts" (Settings → Appointments): asks for the SMS permission (and notifications), keeps this
 * phone's key for TextWatch, reads recent texts on the phone (only the ones that pass the free check are returned),
 * and sends texts that were waiting for internet. Used from src/lib/texts.ts.
 */
@CapacitorPlugin(
    name = "Texts",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS }),
        @Permission(alias = "notify", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class TextsPlugin extends Plugin {
    private boolean allowed() { return getPermissionState("sms") == PermissionState.GRANTED; }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("on", TextSender.isOn(getContext()) && allowed());
        r.put("allowed", allowed());
        r.put("queued", TextSender.queued(getContext()));
        return r;
    }

    @PluginMethod
    public void state(PluginCall call) { call.resolve(state()); }

    @PluginMethod
    public void enable(PluginCall call) {
        String key = call.getString("key", ""), url = call.getString("url", "");
        if (key.isEmpty() || !url.startsWith("https://")) { call.reject("Missing key."); return; }
        TextSender.prefs(getContext()).edit().putString("key", key).putString("url", url).apply();
        if (allowed()) { afterSms(call); return; }
        requestPermissionForAlias("sms", call, "smsDone");
    }

    @PermissionCallback
    private void smsDone(PluginCall call) {
        if (!allowed()) { TextSender.prefs(getContext()).edit().putBoolean("on", false).apply(); call.resolve(state()); return; }
        afterSms(call);
    }

    private void afterSms(PluginCall call) {
        TextSender.prefs(getContext()).edit().putBoolean("on", true).apply();
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") != PermissionState.GRANTED) { requestPermissionForAlias("notify", call, "notifyDone"); return; }
        call.resolve(state());
    }

    @PermissionCallback
    private void notifyDone(PluginCall call) { call.resolve(state()); } // works without notifications too

    @PluginMethod
    public void disable(PluginCall call) {
        TextSender.prefs(getContext()).edit().putBoolean("on", false).remove("key").putString("queue", "[]").apply();
        call.resolve();
    }

    /** Texts received in the last `days` days that look like appointments (newest 100), read on the phone. */
    @PluginMethod
    public void recent(PluginCall call) {
        if (!allowed()) { call.reject("No SMS permission."); return; }
        int days = Math.max(1, Math.min(60, call.getInt("days", 30)));
        long since = System.currentTimeMillis() - days * 86400000L;
        JSArray out = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(Uri.parse("content://sms/inbox"), new String[] { "address", "body", "date" }, "date > ?", new String[] { String.valueOf(since) }, "date DESC")) {
            while (c != null && c.moveToNext() && out.length() < 100) {
                String body = c.getString(1);
                if (!TextCheck.looksLikeAppointment(body)) continue;
                JSObject t = new JSObject();
                t.put("from", c.getString(0) == null ? "" : c.getString(0));
                t.put("body", body.length() > 2000 ? body.substring(0, 2000) : body);
                t.put("at", c.getLong(2));
                out.put(t);
            }
        } catch (Exception e) { call.reject("Couldn't read texts: " + e.getMessage()); return; }
        JSObject r = new JSObject();
        r.put("texts", out);
        call.resolve(r);
    }

    @PluginMethod
    public void flush(PluginCall call) {
        new Thread(() -> {
            int sent = TextSender.isOn(getContext()) ? TextSender.send(getContext(), TextSender.takeQueue(getContext())) : 0;
            JSObject r = new JSObject();
            r.put("sent", sent);
            call.resolve(r);
        }).start();
    }
}
