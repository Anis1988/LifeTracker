package app.lifetracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TextsPlugin.class); // 💬 appointment texts (Settings → Appointments)
        registerPlugin(UpdatePlugin.class); // ⬆️ the update banner's Update button
        registerPlugin(WidgetPlugin.class); // 🗓️ the "Coming up" home-screen widget
        registerPlugin(BiometricPlugin.class); // 🔒 fingerprint / face unlock for the Vault
        super.onCreate(savedInstanceState);
    }
}
