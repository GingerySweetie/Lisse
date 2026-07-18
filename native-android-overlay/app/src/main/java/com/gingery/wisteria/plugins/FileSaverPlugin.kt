package com.gingery.wisteria.plugins

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * FileSaverPlugin — writes files to Downloads (MediaStore) or a user-chosen
 * SAF folder. Large payloads must use beginSave / writeChunk / endSave so
 * each Capacitor bridge call stays under Android's ~1 MiB Binder limit;
 * a single giant base64 string will crash the process.
 *
 * Also powers manual recovery: scan app-private ("hidden") dirs, Downloads,
 * and the remembered SAF backup tree for lisse/wisteria JSON exports, then
 * read them back in chunks.
 */
@CapacitorPlugin(name = "FileSaver")
class FileSaverPlugin : Plugin() {

    private data class OpenWrite(
        val uri: Uri,
        val stream: OutputStream,
        val isMediaStore: Boolean,
    )

    private data class OpenRead(
        val stream: InputStream,
        val size: Long,
    )

    private val openWrites = ConcurrentHashMap<String, OpenWrite>()
    private val openReads = ConcurrentHashMap<String, OpenRead>()

    companion object {
        /** Keep each bridge payload comfortably under the ~1 MiB Binder limit. */
        private const val READ_CHUNK_BYTES = 48 * 1024
        private const val PEEK_BYTES = 4096
        private const val MAX_SCAN_DEPTH = 4
        private const val MAX_SCAN_FILES = 400
    }

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

    /**
     * Scan app-private dirs (old WebView "hidden" downloads), MediaStore
     * Downloads, and an optional SAF tree for recoverable Lisse JSON files.
     */
    @PluginMethod
    fun findRecoverableFiles(call: PluginCall) {
        val folderUriStr = call.getString("folderUri")
        val found = LinkedHashMap<String, JSObject>()

        try {
            scanPrivateDirs(found)
            scanMediaStoreDownloads(found)
            if (folderUriStr != null) {
                scanSafTree(folderUriStr, found)
            }
            val arr = JSArray()
            found.values
                .sortedByDescending { it.getLong("modifiedAt") }
                .forEach { arr.put(it) }
            call.resolve(JSObject().apply {
                put("files", arr)
                put("scannedPrivate", true)
                put("scannedDownloads", true)
                put("scannedBackupFolder", folderUriStr != null)
            })
        } catch (e: Exception) {
            call.reject("扫描失败: ${e.message}")
        }
    }

    /** Open a recoverable file for chunked reading (file:// or content://). */
    @PluginMethod
    fun beginRead(call: PluginCall) {
        val uriStr = call.getString("uri")
        if (uriStr == null) {
            call.reject("Missing required parameter: uri")
            return
        }
        try {
            val uri = Uri.parse(uriStr)
            val stream = openInputStream(uri)
                ?: throw IOException("无法打开文件")
            val size = querySize(uri)
            val handle = UUID.randomUUID().toString()
            openReads[handle] = OpenRead(stream, size)
            call.resolve(
                JSObject().apply {
                    put("handle", handle)
                    put("size", size)
                },
            )
        } catch (e: SecurityException) {
            call.reject("PERMISSION_LOST")
        } catch (e: Exception) {
            call.reject("无法读取文件: ${e.message}")
        }
    }

    @PluginMethod
    fun readChunk(call: PluginCall) {
        val handle = call.getString("handle")
        if (handle == null) {
            call.reject("Missing required parameter: handle")
            return
        }
        val open = openReads[handle]
        if (open == null) {
            call.reject("Invalid or closed read handle")
            return
        }
        try {
            val buf = ByteArray(READ_CHUNK_BYTES)
            val n = open.stream.read(buf)
            if (n <= 0) {
                call.resolve(
                    JSObject().apply {
                        put("data", "")
                        put("done", true)
                    },
                )
                return
            }
            val encoded = Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)
            call.resolve(
                JSObject().apply {
                    put("data", encoded)
                    put("done", false)
                },
            )
        } catch (e: IOException) {
            call.reject("Failed to read chunk: ${e.message}")
        }
    }

    @PluginMethod
    fun endRead(call: PluginCall) {
        val handle = call.getString("handle")
        if (handle == null) {
            call.resolve()
            return
        }
        val open = openReads.remove(handle)
        try {
            open?.stream?.close()
        } catch (_: Exception) {
        }
        call.resolve()
    }

    /**
     * Copy a recoverable file into public Downloads so the user can open it
     * from a normal file manager (useful when the original sits in app-private).
     */
    @PluginMethod
    fun copyRecoverableToDownloads(call: PluginCall) {
        val uriStr = call.getString("uri")
        val suggestedName = call.getString("suggestedName") ?: "lisse-recovered.json"
        if (uriStr == null) {
            call.reject("Missing required parameter: uri")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("UNSUPPORTED_API_LEVEL")
            return
        }
        try {
            val uri = Uri.parse(uriStr)
            val input = openInputStream(uri) ?: throw IOException("无法打开文件")
            input.use { src ->
                val open = openMediaStoreWrite("application/json", suggestedName)
                try {
                    src.copyTo(open.stream)
                    open.stream.flush()
                    open.stream.close()
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.IS_PENDING, 0)
                    }
                    context.contentResolver.update(open.uri, values, null, null)
                    call.resolve(JSObject().apply { put("path", open.uri.toString()) })
                } catch (e: Exception) {
                    cleanupFailedWrite(open)
                    throw e
                }
            }
        } catch (e: Exception) {
            call.reject("复制失败: ${e.message}")
        }
    }

    private fun scanPrivateDirs(out: MutableMap<String, JSObject>) {
        val roots = mutableListOf<File>()
        context.filesDir?.let { roots.add(it) }
        context.cacheDir?.let { roots.add(it) }
        context.codeCacheDir?.let { roots.add(it) }
        context.getExternalFilesDir(null)?.let { roots.add(it) }
        context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let { roots.add(it) }
        context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)?.let { roots.add(it) }
        context.externalCacheDir?.let { roots.add(it) }
        // Older WebView / Capacitor builds sometimes dropped <a download> here.
        roots.add(File(context.filesDir, "Download"))
        roots.add(File(context.cacheDir, "Download"))
        roots.add(File(context.filesDir, "downloads"))
        roots.add(File(context.cacheDir, "downloads"))

        for (root in roots.distinctBy { it.absolutePath }) {
            if (!root.exists()) continue
            walkFiles(root, depth = 0, sourceLabel = "app-private", out)
            if (out.size >= MAX_SCAN_FILES) return
        }
    }

    private fun walkFiles(
        dir: File,
        depth: Int,
        sourceLabel: String,
        out: MutableMap<String, JSObject>,
    ) {
        if (depth > MAX_SCAN_DEPTH || out.size >= MAX_SCAN_FILES) return
        val children = dir.listFiles() ?: return
        for (child in children) {
            if (out.size >= MAX_SCAN_FILES) return
            if (child.isDirectory) {
                // Skip huge / irrelevant trees. Keep scanning dot-dirs
                // (hidden folders) and anything with "download" in the name.
                val name = child.name.lowercase(Locale.US)
                if (name == "webview" || name == "image_manager_disk_cache" ||
                    name == "okhttp" || name == "http-cache" ||
                    name == "chromium" || name == "gpuservice" ||
                    name == "org.chromium.android_webview"
                ) {
                    continue
                }
                walkFiles(child, depth + 1, sourceLabel, out)
                continue
            }
            if (!child.isFile || child.length() <= 0L) continue
            if (!looksLikeCandidateName(child.name) && !peekLooksLikeLisse(child)) continue
            val uri = Uri.fromFile(child).toString()
            if (out.containsKey(uri)) continue
            out[uri] = fileMeta(
                uri = uri,
                name = child.name,
                size = child.length(),
                modifiedAt = child.lastModified(),
                source = sourceLabel,
                pathHint = child.absolutePath,
            )
        }
    }

    private fun scanMediaStoreDownloads(out: MutableMap<String, JSObject>) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val projection = arrayOf(
            MediaStore.Downloads._ID,
            MediaStore.Downloads.DISPLAY_NAME,
            MediaStore.Downloads.SIZE,
            MediaStore.Downloads.DATE_MODIFIED,
            MediaStore.Downloads.MIME_TYPE,
        )
        val selection = (
            "${MediaStore.Downloads.DISPLAY_NAME} LIKE ? OR " +
                "${MediaStore.Downloads.DISPLAY_NAME} LIKE ? OR " +
                "${MediaStore.Downloads.DISPLAY_NAME} LIKE ? OR " +
                "${MediaStore.Downloads.DISPLAY_NAME} LIKE ?"
            )
        val args = arrayOf("%lisse%", "%wisteria%", "%backup%", "%conversation%")
        try {
            context.contentResolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                args,
                "${MediaStore.Downloads.DATE_MODIFIED} DESC",
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Downloads.SIZE)
                val modCol = cursor.getColumnIndexOrThrow(MediaStore.Downloads.DATE_MODIFIED)
                while (cursor.moveToNext() && out.size < MAX_SCAN_FILES) {
                    val name = cursor.getString(nameCol) ?: continue
                    if (!name.lowercase(Locale.US).endsWith(".json") &&
                        !name.lowercase(Locale.US).endsWith(".json.bak")
                    ) {
                        continue
                    }
                    val id = cursor.getLong(idCol)
                    val uri = Uri.withAppendedPath(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        id.toString(),
                    ).toString()
                    if (out.containsKey(uri)) continue
                    val size = cursor.getLong(sizeCol)
                    val modifiedSec = cursor.getLong(modCol)
                    out[uri] = fileMeta(
                        uri = uri,
                        name = name,
                        size = size,
                        modifiedAt = if (modifiedSec < 10_000_000_000L) modifiedSec * 1000 else modifiedSec,
                        source = "downloads",
                        pathHint = "Downloads/$name",
                    )
                }
            }
        } catch (_: Exception) {
            // MediaStore may be unavailable on some devices — ignore.
        }
    }

    private fun scanSafTree(folderUriStr: String, out: MutableMap<String, JSObject>) {
        val folderUri = Uri.parse(folderUriStr)
        if (!hasPersistedPermission(folderUri)) return
        val tree = DocumentFile.fromTreeUri(context, folderUri) ?: return
        scanDocumentFile(tree, depth = 0, sourceLabel = "backup-folder", out)
    }

    private fun scanDocumentFile(
        dir: DocumentFile,
        depth: Int,
        sourceLabel: String,
        out: MutableMap<String, JSObject>,
    ) {
        if (depth > MAX_SCAN_DEPTH || out.size >= MAX_SCAN_FILES) return
        val children = try {
            dir.listFiles()
        } catch (_: Exception) {
            return
        }
        for (child in children) {
            if (out.size >= MAX_SCAN_FILES) return
            if (child.isDirectory) {
                scanDocumentFile(child, depth + 1, sourceLabel, out)
                continue
            }
            if (!child.isFile) continue
            val name = child.name ?: continue
            val size = child.length()
            if (size <= 0L) continue
            if (!looksLikeCandidateName(name)) continue
            val uri = child.uri.toString()
            if (out.containsKey(uri)) continue
            out[uri] = fileMeta(
                uri = uri,
                name = name,
                size = size,
                modifiedAt = child.lastModified(),
                source = sourceLabel,
                pathHint = name,
            )
        }
    }

    private fun looksLikeCandidateName(name: String): Boolean {
        val lower = name.lowercase(Locale.US)
        if (!(lower.endsWith(".json") || lower.endsWith(".json.bak") || lower.endsWith(".txt"))) {
            return false
        }
        return lower.contains("lisse") ||
            lower.contains("wisteria") ||
            lower.contains("backup") ||
            lower.contains("conversation") ||
            lower.contains("chatgpt") ||
            lower.contains("claude")
    }

    private fun peekLooksLikeLisse(file: File): Boolean {
        if (!file.name.lowercase(Locale.US).endsWith(".json")) return false
        if (file.length() > 32L * 1024 * 1024) return false
        return try {
            FileInputStream(file).use { input ->
                val buf = ByteArray(PEEK_BYTES)
                val n = input.read(buf)
                if (n <= 0) return false
                val head = String(buf, 0, n, Charsets.UTF_8)
                head.contains("\"__lisse\"") || head.contains("__lisse")
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun fileMeta(
        uri: String,
        name: String,
        size: Long,
        modifiedAt: Long,
        source: String,
        pathHint: String,
    ): JSObject {
        return JSObject().apply {
            put("uri", uri)
            put("name", name)
            put("size", size)
            put("modifiedAt", modifiedAt)
            put("source", source)
            put("pathHint", pathHint)
            put("kindGuess", guessKindFromName(name))
        }
    }

    private fun guessKindFromName(name: String): String {
        val lower = name.lowercase(Locale.US)
        return when {
            lower.contains("backup") -> "backup"
            lower.contains("config") -> "config"
            lower.contains("conversation") -> "conversations"
            lower.contains("chatgpt") -> "chatgpt"
            lower.contains("claude") -> "claude"
            else -> "unknown"
        }
    }

    private fun openInputStream(uri: Uri): InputStream? {
        return when (uri.scheme) {
            "file" -> {
                val path = uri.path ?: return null
                FileInputStream(File(path))
            }
            else -> context.contentResolver.openInputStream(uri)
        }
    }

    private fun querySize(uri: Uri): Long {
        when (uri.scheme) {
            "file" -> {
                val path = uri.path ?: return -1L
                return File(path).length()
            }
            "content" -> {
                try {
                    context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.SIZE), null, null, null)
                        ?.use { c ->
                            if (c.moveToFirst()) {
                                val idx = c.getColumnIndex(MediaStore.MediaColumns.SIZE)
                                if (idx >= 0) return c.getLong(idx)
                            }
                        }
                } catch (_: Exception) {
                }
                // Fallback: DocumentFile
                try {
                    DocumentFile.fromSingleUri(context, uri)?.length()?.let { if (it > 0) return it }
                } catch (_: Exception) {
                }
            }
        }
        return -1L
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
