package com.gingery.wisteria.plugins

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
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

    /** Open the system folder picker (SAF) so the user can choose a backup directory. */
    @PluginMethod
    fun pickBackupFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
            )
        }
        startActivityForResult(call, intent, "pickBackupFolderCallback")
    }

    @ActivityCallback
    private fun pickBackupFolderCallback(call: PluginCall, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            call.reject("用户取消了选择")
            return
        }
        val uri = result.data?.data
        if (uri == null) {
            call.reject("未获取到目录")
            return
        }
        try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(uri, flags)
            val label = folderLabel(uri)
            call.resolve(
                JSObject().apply {
                    put("uri", uri.toString())
                    put("label", label)
                },
            )
        } catch (e: Exception) {
            call.reject("无法获取目录权限: ${e.message}")
        }
    }

    /** Check whether a previously granted tree URI still has read+write permission. */
    @PluginMethod
    fun checkBackupFolderPermission(call: PluginCall) {
        val uriStr = call.getString("uri")
        if (uriStr == null) {
            call.reject("Missing required parameter: uri")
            return
        }
        val uri = Uri.parse(uriStr)
        val valid = hasPersistedPermission(uri)
        val ret = JSObject().apply { put("valid", valid) }
        if (valid) {
            ret.put("label", folderLabel(uri))
        }
        call.resolve(ret)
    }

    /** Write a base64-encoded file into a SAF tree URI chosen by the user. */
    @PluginMethod
    fun saveFileToFolder(call: PluginCall) {
        val data = call.getString("data")
        val mimeType = call.getString("mimeType") ?: "application/octet-stream"
        val suggestedName = call.getString("suggestedName") ?: "download"
        val folderUriStr = call.getString("folderUri")

        if (data == null) {
            call.reject("Missing required parameter: data")
            return
        }
        if (folderUriStr == null) {
            call.reject("Missing required parameter: folderUri")
            return
        }

        val folderUri = Uri.parse(folderUriStr)
        if (!hasPersistedPermission(folderUri)) {
            call.reject("PERMISSION_LOST")
            return
        }

        val bytes = try {
            Base64.decode(data, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid base64 data: ${e.message}")
            return
        }

        val tree = DocumentFile.fromTreeUri(context, folderUri)
        if (tree == null || !tree.canWrite()) {
            call.reject("无法访问目录")
            return
        }

        try {
            tree.findFile(suggestedName)?.delete()
            val file = tree.createFile(mimeType, suggestedName)
                ?: throw IOException("createFile returned null")
            context.contentResolver.openOutputStream(file.uri)?.use { out ->
                out.write(bytes)
            } ?: throw IOException("openOutputStream returned null")
            call.resolve(JSObject().apply { put("path", file.uri.toString()) })
        } catch (e: IOException) {
            call.reject("Failed to write file: ${e.message}")
        }
    }

    private fun hasPersistedPermission(uri: Uri): Boolean {
        return context.contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isReadPermission && it.isWritePermission
        }
    }

    private fun folderLabel(uri: Uri): String {
        val doc = DocumentFile.fromTreeUri(context, uri)
        return doc?.name?.takeIf { it.isNotBlank() }
            ?: uri.lastPathSegment?.substringAfterLast(':')
            ?: "已选目录"
    }

}
