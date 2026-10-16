package app.lifetracker;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 🔒 Opens the Vault with the phone's fingerprint or face (the PIN always works too). Nothing is stored here. */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {
    private static final int KINDS = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", BiometricManager.from(getContext()).canAuthenticate(KINDS) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(r);
    }

    @PluginMethod
    public void verify(PluginCall call) {
        String reason = call.getString("reason", "Open your Vault");
        FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject r = new JSObject();
                        r.put("ok", true);
                        call.resolve(r);
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                        JSObject r = new JSObject();
                        r.put("ok", false);
                        r.put("why", msg.toString());
                        call.resolve(r);
                    }
                });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("LifeTracker Vault")
                    .setSubtitle(reason)
                    .setNegativeButtonText("Use my PIN")
                    .setAllowedAuthenticators(KINDS)
                    .build();
                prompt.authenticate(info);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}
