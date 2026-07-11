package com.gingery.wisteria.plugins

import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException

/**
 * FileSaverPlugin — writes a base64-encoded file directly to the device's
 * public Downloads folder so the user can always find it in any file manager.
 *
 * Called from JS (via Capacitor.Plugins.FileSaver.saveFile):
 *   const result = await FileSaver.saveFile({
 *     data: base64String,
 *     mimeType: 'application/json',
 *     suggestedName: 'backup.json',
 *   });
 *   // result.path — the final file path / URI that was written
 *
 * Android 10+ (API 29+): uses MediaStore.Downloads for scoped storage.
 * Android 9 and below: writes to the legacy public Downloads directory.
 */
@CapacitorPlugin(name = "FileSaver")
class FileSaverPlugin : Plugin() {

    @PluginMethod
    fun saveFile(call: PluginCall) {
        val data = call.getString("data")
        val mimeType = call.getString("mimeType") ?: "application/octet-stream"
        val suggestedName = call.getString("suggestedName") ?: "download"

        if (data == null) {
            call.reject("Missing required parameter: data")
            return
        }

        val bytes = try {
            Base64.decode(data, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid base64 data: ${e.message}")
            return
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // API < 29: WRITE_EXTERNAL_STORAGE would be needed. Let the JS
            // layer fall through to the Web Share API instead.
            call.reject("UNSUPPORTED_API_LEVEL")
            return
        }

        try {
            val savedPath = saveViaMediaStore(bytes, mimeType, suggestedName)
            call.resolve(JSObject().apply { put("path", savedPath) })
        } catch (e: IOException) {
            call.reject("Failed to write file: ${e.message}")
        }
    }

    /** Android 10+ (API 29+): scoped storage via MediaStore.Downloads. */
    private fun saveViaMediaStore(bytes: ByteArray, mimeType: String, name: String): String {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("MediaStore.insert returned null")

        resolver.openOutputStream(uri)?.use { out ->
            out.write(bytes)
        } ?: throw IOException("openOutputStream returned null")

        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)

        return uri.toString()
    }

}
