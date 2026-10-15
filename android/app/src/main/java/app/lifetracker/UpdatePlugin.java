package app.lifetracker;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * ⬆️ "Update" on the update banner: downloads the new LifeTracker.apk with Android's own downloader (a notification
 * shows the progress) and opens the installer when it's done. The first time, Android asks to allow LifeTracker to
 * install updates. If anything fails, the link opens in the phone's browser instead (Chrome downloads it).
 * Opening the .apk link in the in-app browser did nothing on many phones: that's why this exists.
 */
@CapacitorPlugin(name = "Update")
public class UpdatePlugin extends Plugin {
    private static final String APK = "LifeTracker-update.apk";
    private static final String MIME = "application/vnd.android.package-archive";

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://")) { call.reject("No download link."); return; }
        Context c = getContext();
        JSObject r = new JSObject();
        // Android 8+: LifeTracker must be allowed to install apps once (it's a sideloaded app).
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
                r.put("status", "allow");
                call.resolve(r);
                return;
            } catch (Exception e) { openInBrowser(url); r.put("status", "browser"); call.resolve(r); return; }
        }
        try {
            File dir = c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            File file = new File(dir, APK);
            if (file.exists()) file.delete();
            DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                .setTitle("LifeTracker update")
                .setDescription("Downloading the new version")
                .setMimeType(MIME)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(c, Environment.DIRECTORY_DOWNLOADS, APK);
            final long id = dm.enqueue(req);
            BroadcastReceiver done = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                    try { ctx.getApplicationContext().unregisterReceiver(this); } catch (Exception ignored) {}
                    boolean ok = false;
                    try (Cursor q = dm.query(new DownloadManager.Query().setFilterById(id))) {
                        if (q != null && q.moveToFirst()) ok = q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
                    } catch (Exception ignored) {}
                    if (ok && file.exists()) openInstaller(ctx, file);
                    else openInBrowser(url);
                }
            };
            ContextCompat.registerReceiver(c.getApplicationContext(), done, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
            r.put("status", "downloading");
            call.resolve(r);
        } catch (Exception e) {
            openInBrowser(url);
            r.put("status", "browser");
            call.resolve(r);
        }
    }

    private void openInstaller(Context ctx, File file) {
        try {
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file);
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, MIME)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            // Last resort: the downloaded file is in the notification shade; tapping it installs too.
        }
    }

    private void openInBrowser(String url) {
        try {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {}
    }
}
