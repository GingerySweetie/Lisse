package com.gingery.wisteria.plugins;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * ShareIntentPlugin — receive a SEND / SEND_MULTIPLE intent from the
 * Android share sheet and surface the payload to the web layer.
 *
 * Two surfaces:
 *   - getInitialShare()  : returns the share that launched the app (cold)
 *   - 'shareReceived' event: fires when a share arrives while the app
 *                            is running (warm start via onNewIntent)
 *
 * The web layer reads files by URI when MainActivity hands it the intent.
 * For now we focus on file shares — text-only sharing is rare in our flow.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    private JSObject pendingShare = null;

    @Override
    public void load() {
        Intent launchIntent = getActivity().getIntent();
        JSObject payload = intentToShare(launchIntent);
        if (payload != null) {
            pendingShare = payload;
        }
    }

    @PluginMethod
    public void getInitialShare(PluginCall call) {
        JSObject ret = new JSObject();
        if (pendingShare != null) {
            ret.put("share", pendingShare);
            pendingShare = null;
        } else {
            ret.put("share", JSObject.NULL);
        }
        call.resolve(ret);
    }

    /** Called from MainActivity.onNewIntent — fires the event if it carries
     *  a share payload. Keeps the public surface event-driven. */
    public void handleNewIntent(Intent intent) {
        JSObject payload = intentToShare(intent);
        if (payload != null) {
            notifyListeners("shareReceived", payload);
        }
    }

    private JSObject intentToShare(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        if (action == null) return null;
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return null;
        }

        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                JSObject file = readUri(uri, intent.getType());
                if (file != null) {
                    JSObject out = new JSObject();
                    out.put("files", new com.getcapacitor.JSArray().put(file));
                    return out;
                }
            }
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null) {
                JSObject out = new JSObject();
                out.put("text", text);
                return out;
            }
        } else {
            ClipData clip = intent.getClipData();
            if (clip != null) {
                com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri uri = clip.getItemAt(i).getUri();
                    if (uri == null) continue;
                    JSObject f = readUri(uri, intent.getType());
                    if (f != null) arr.put(f);
                }
                if (arr.length() > 0) {
                    JSObject out = new JSObject();
                    out.put("files", arr);
                    return out;
                }
            }
        }
        return null;
    }

    private JSObject readUri(Uri uri, String fallbackMime) {
        try {
            String mime = fallbackMime;
            if (mime == null) {
                mime = getContext().getContentResolver().getType(uri);
            }
            String name = queryDisplayName(uri);

            InputStream is = getContext().getContentResolver().openInputStream(uri);
            if (is == null) return null;
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) baos.write(buf, 0, n);
            is.close();
            byte[] data = baos.toByteArray();
            String b64 = Base64.encodeToString(data, Base64.NO_WRAP);

            JSObject f = new JSObject();
            f.put("name", name != null ? name : "shared");
            f.put("mimeType", mime != null ? mime : "application/octet-stream");
            f.put("size", data.length);
            f.put("data", b64);
            return f;
        } catch (Exception e) {
            return null;
        }
    }

    private String queryDisplayName(Uri uri) {
        try (android.database.Cursor c =
                     getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c == null) return null;
            int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
            if (idx < 0) return null;
            if (!c.moveToFirst()) return null;
            return c.getString(idx);
        } catch (Exception e) {
            return null;
        }
    }
}
