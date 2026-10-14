package app.lifetracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 💬 Runs when a text (SMS) arrives, even if LifeTracker is closed. Only when "Read appointment texts" is on: the
 * free check runs here; texts that look like appointments are sent (with anything waiting in the queue).
 */
public class TextWatch extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction()) || !TextSender.isOn(c)) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null) return;
        // A long text arrives in pieces: join them by sender.
        Map<String, StringBuilder> bySender = new LinkedHashMap<>();
        long at = System.currentTimeMillis();
        for (SmsMessage m : parts) {
            if (m == null) continue;
            String from = m.getDisplayOriginatingAddress() == null ? "" : m.getDisplayOriginatingAddress();
            bySender.computeIfAbsent(from, k -> new StringBuilder()).append(m.getDisplayMessageBody());
            at = m.getTimestampMillis();
        }
        JSONArray texts = new JSONArray();
        for (Map.Entry<String, StringBuilder> e : bySender.entrySet()) {
            String body = e.getValue().toString();
            if (!TextCheck.looksLikeAppointment(body)) continue;
            try { texts.put(new JSONObject().put("from", e.getKey()).put("body", body.length() > 2000 ? body.substring(0, 2000) : body).put("at", at)); } catch (Exception ignored) {}
        }
        if (texts.length() == 0) return;
        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                TextSender.queue(c, texts); // saved first, so nothing is lost if Android stops this half-way
                TextSender.sendQueued(c);
            } finally { done.finish(); }
        }).start();
    }
}
