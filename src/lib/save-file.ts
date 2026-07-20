/**
 * saveFile — save a Blob to the user's visible storage.
 *
 * Four paths in priority order:
 *
 * 0. Native FileSaver Capacitor plugin (Android APK only)
 *    Writes to the public Downloads folder via MediaStore (no picker).
 *    Large files are written in base64 chunks so they stay under the
 *    Android Binder ~1 MiB limit (a single giant payload crashes the app).
 *    Backup / config / conversation exports may instead use a user-chosen
 *    SAF folder — see backup-location.ts saveExportBlob and
 *    FileSaverPlugin.pickBackupFolder.
 *
 * 1. File System Access API (`showSaveFilePicker`)
 *    Chrome / Edge desktop: opens a native "Save As" dialog.
 *    Not available in Android WebView — falls through.
 *
 * 2. Web Share API with files
 *    Mobile Chrome / some Android WebView builds: opens the system share
 *    sheet so the user can pick Downloads, Drive, etc.
 *
 * 3. Blob URL download fallback
 *    Classic `<a download>` trick; always works on desktop Firefox / Safari.
 */

import { Capacitor } from '@capacitor/core';
import { saveBlobNativeChunked } from './native-chunked-save';

export async function saveFile(
  blob: Blob,
  filename: string,
  /** Optional MIME-type description shown in the File System Access dialog. */
  description = 'File',
): Promise<void> {

  // Path 0: Native Capacitor FileSaver — chunked write to Downloads.
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const path = await saveBlobNativeChunked(blob, filename);
      if (path) return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('UNSUPPORTED_API_LEVEL')) {
        console.warn('[FileSaver] native save failed:', msg);
      }
    }
  }

  // Path 1: File System Access API — user picks the exact save location.
  if ('showSaveFilePicker' in window) {
    try {
      const ext = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
      const accept: Record<string, string[]> = {};
      if (ext) accept[blob.type || 'application/octet-stream'] = [ext];

      const handle = await (
        window as Window & {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  // Path 2: Web Share API with files — Android share sheet.
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  // Path 3: Blob URL download — desktop fallback.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
