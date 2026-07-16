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
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * FileSaverPlugin — writes files to Downloads (MediaStore) or a user-chosen
 * SAF folder. Large payloads must use beginSave / writeChunk / endSave so
 * each Capacitor bridge call stays under Android's ~1 MiB Binder limit;
 * a single giant base64 string will crash the process.
 */
@CapacitorPlugin(name = "FileSaver")
class FileSaverPlugin : Plugin() {

    private data class OpenWrite(
        val uri: Uri,
        val stream: OutputStream,
        val isMediaStore: Boolean,
    )

    private val openWrites = ConcurrentHashMap<String, OpenWrite>()

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

        try {
            resolver.openOutputStream(uri)?.use { out ->
                out.write(bytes)
            } ?: throw IOException("openOutputStream returned null")

            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }

        return uri.toString()
    }

    /**
     * Open a destination file for chunked writing.
     * Optional folderUri → write into a SAF tree; otherwise MediaStore Downloads.
     */
    @PluginMethod
    fun beginSave(call: PluginCall) {
        val mimeType = call.getString("mimeType") ?: "application/octet-stream"
        val suggestedName = call.getString("suggestedName") ?: "download"
        val folderUriStr = call.getString("folderUri")

        try {
            val open = if (folderUriStr != null) {
                openSafWrite(folderUriStr, mimeType, suggestedName)
            } else {
                openMediaStoreWrite(mimeType, suggestedName)
            }
            val handle = UUID.randomUUID().toString()
            openWrites[handle] = open
            call.resolve(JSObject().apply { put("handle", handle) })
        } catch (e: SecurityException) {
            call.reject("PERMISSION_LOST")
        } catch (e: IllegalStateException) {
            if (e.message == "UNSUPPORTED_API_LEVEL") {
                call.reject("UNSUPPORTED_API_LEVEL")
            } else {
                call.reject("Failed to begin save: ${e.message}")
            }
        } catch (e: IOException) {
            call.reject("Failed to begin save: ${e.message}")
        }
    }

    @PluginMethod
    fun writeChunk(call: PluginCall) {
        val handle = call.getString("handle")
        val data = call.getString("data")
        if (handle == null) {
            call.reject("Missing required parameter: handle")
            return
        }
        if (data == null) {
            call.reject("Missing required parameter: data")
            return
        }
        val open = openWrites[handle]
        if (open == null) {
            call.reject("Invalid or closed write handle")
            return
        }
        try {
            val bytes = Base64.decode(data, Base64.DEFAULT)
            open.stream.write(bytes)
            call.resolve()
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid base64 data: ${e.message}")
        } catch (e: IOException) {
            call.reject("Failed to write chunk: ${e.message}")
        }
    }

    @PluginMethod
    fun endSave(call: PluginCall) {
        val handle = call.getString("handle")
        if (handle == null) {
            call.reject("Missing required parameter: handle")
            return
        }
        val open = openWrites.remove(handle)
        if (open == null) {
            call.reject("Invalid or closed write handle")
            return
        }
        try {
            open.stream.flush()
            open.stream.close()
            if (open.isMediaStore) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.IS_PENDING, 0)
                }
                context.contentResolver.update(open.uri, values, null, null)
            }
            call.resolve(JSObject().apply { put("path", open.uri.toString()) })
        } catch (e: IOException) {
            cleanupFailedWrite(open)
            call.reject("Failed to finish save: ${e.message}")
        }
    }

    @PluginMethod
    fun abortSave(call: PluginCall) {
        val handle = call.getString("handle")
        if (handle == null) {
            call.resolve()
            return
        }
        val open = openWrites.remove(handle) ?: run {
            call.resolve()
            return
        }
        cleanupFailedWrite(open)
        call.resolve()
    }

    private fun openMediaStoreWrite(mimeType: String, name: String): OpenWrite {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            throw IllegalStateException("UNSUPPORTED_API_LEVEL")
        }
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("MediaStore.insert returned null")
        val stream = resolver.openOutputStream(uri)
            ?: run {
                resolver.delete(uri, null, null)
                throw IOException("openOutputStream returned null")
            }
        return OpenWrite(uri, stream, isMediaStore = true)
    }

    private fun openSafWrite(folderUriStr: String, mimeType: String, name: String): OpenWrite {
        val folderUri = Uri.parse(folderUriStr)
        if (!hasPersistedPermission(folderUri)) {
            throw SecurityException("PERMISSION_LOST")
        }
        val tree = DocumentFile.fromTreeUri(context, folderUri)
            ?: throw IOException("无法访问目录")
        if (!tree.canWrite()) {
            throw IOException("无法写入目录")
        }
        tree.findFile(name)?.delete()
        val file = tree.createFile(mimeType, name)
            ?: throw IOException("createFile returned null")
        val stream = context.contentResolver.openOutputStream(file.uri)
            ?: throw IOException("openOutputStream returned null")
        return OpenWrite(file.uri, stream, isMediaStore = false)
    }

    private fun cleanupFailedWrite(open: OpenWrite) {
        try {
            open.stream.close()
        } catch (_: Exception) {
        }
        try {
            if (open.isMediaStore) {
                context.contentResolver.delete(open.uri, null, null)
            } else {
                DocumentFile.fromSingleUri(context, open.uri)?.delete()
            }
        } catch (_: Exception) {
        }
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

    /** Write a base64-encoded file into a SAF tree URI (small files only). */
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
