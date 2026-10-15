package app.lifetracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TextsPlugin.class);
        registerPlugin(UpdatePlugin.class); // ⬆️ the update banner's Update button // 💬 appointment texts (Settings → Appointments)
        super.onCreate(savedInstanceState);
    }
}
