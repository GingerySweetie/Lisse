package com.gingery.wisteria.plugins

import android.app.Activity
import android.content.Intent
import android.util.Base64
import com.getcapacitor.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException

/**
 * FileSaverPlugin — saves a base64-encoded file to a user-chosen location
 * via Android's Storage Access Framework (ACTION_CREATE_DOCUMENT).
 *
 * Called from JS (via Capacitor.Plugins.FileSaver.saveFile):
 *   const result = await FileSaver.saveFile({
 *     data: base64String,
 *     mimeType: 'application/json',
 *     suggestedName: 'backup.json',
 *   });
 *   // result.cancelled === true if the user dismissed the picker
 *
 * Opens the system file picker so the user chooses the exact save location
 * (Downloads, Documents, Drive, etc.), then writes the data there.
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

        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimeType
            putExtra(Intent.EXTRA_TITLE, suggestedName)
        }

        startActivityForResult(call, intent, "onCreateDocumentResult")
    }

    @ActivityCallback
    private fun onCreateDocumentResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return

        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
            // User cancelled the picker — not an error.
            call.resolve(JSObject().apply { put("cancelled", true) })
            return
        }

        val uri = result.data!!.data!!
        val rawData = call.getString("data") ?: run {
            call.reject("Data missing after activity result")
            return
        }

        try {
            val bytes = Base64.decode(rawData, Base64.DEFAULT)
            context.contentResolver.openOutputStream(uri)?.use { out ->
                out.write(bytes)
            } ?: run {
                call.reject("Could not open output stream for the selected URI")
                return
            }
            call.resolve(JSObject().apply { put("cancelled", false) })
        } catch (e: IOException) {
            call.reject("Failed to write file: ${e.message}")
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid base64 data: ${e.message}")
        }
    }
}
