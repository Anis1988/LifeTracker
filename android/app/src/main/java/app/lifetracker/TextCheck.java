package app.lifetracker;

import java.util.regex.Pattern;

/**
 * 📅 The free first look at a text, on the phone (no AI, nothing sent): an appointment word and a day or time, and
 * not a code, a delivery or an ad. The same rule as looksLikeAppointment in supabase/functions/_shared/apptText.ts:
 * keep both in step. Texts that fail it never leave the phone.
 */
final class TextCheck {
    private static final Pattern WORD = Pattern.compile("\\b(appointment|appt|booked|booking|reservation|reserved|scheduled|rescheduled|reschedule|confirm(ed|ation)?|cancel(l)?ed|cancellation|reminder|check-?up|consultation|see you (on|at|tomorrow)|your visit|visit on|arrive|exam|cleaning|session|meeting)\\b");
    private static final Pattern WHEN = Pattern.compile("\\b(\\d{1,2}(:\\d{2})?\\s?(am|pm|a\\.m\\.|p\\.m\\.)|\\d{1,2}:\\d{2}|\\d{1,2}[/.-]\\d{1,2}([/.-]\\d{2,4})?|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.? \\d{1,2}|\\d{1,2}(st|nd|rd|th)?( of)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?|tomorrow|today|tonight)\\b");
    private static final Pattern NOISE = Pattern.compile("\\b(verification code|security code|one[- ]time (pass)?code|passcode|\\botp\\b|has shipped|out for delivery|was delivered|tracking number|unsubscribe from this|% off|sale ends|limited time|webinar)\\b");

    private TextCheck() {}

    static boolean looksLikeAppointment(String text) {
        if (text == null) return false;
        String t = text.toLowerCase(java.util.Locale.ROOT);
        return WORD.matcher(t).find() && WHEN.matcher(t).find() && !NOISE.matcher(t).find();
    }
}
