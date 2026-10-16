package app.lifetracker;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives what's coming up from the app (date, title, amount) and refreshes the home-screen widget. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    static final String PREFS = "lt_widget";

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        JSArray rows = call.getArray("rows", new JSArray());
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("rows", rows.toString()).putBoolean("ready", true).apply();
        ComingUpWidget.updateAll(ctx);
        call.resolve();
    }
}
