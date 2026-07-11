/**
 * saveFile — save a Blob to the user's visible storage.
 *
 * Four paths in priority order:
 *
 * 0. Native FileSaver Capacitor plugin (Android APK only)
 *    Uses ACTION_CREATE_DOCUMENT — the system file picker lets the user
 *    choose the exact destination (Downloads, Documents, Drive, etc.).
 *    This is the only approach that gives a true "Save As" dialog on Android.
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

declare global {
  interface Window {
    // Capacitor bridge injected by the native shell.
    Capacitor?: {
      isNativePlatform: () => boolean;
      Plugins: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
    };
  }
}

export async function saveFile(
  blob: Blob,
  filename: string,
  /** Optional MIME-type description shown in the File System Access dialog. */
  description = 'File',
): Promise<void> {

  // Path 0: Native Capacitor FileSaver plugin — Android APK with proper "Save As".
  const cap = window.Capacitor;
  if (cap?.isNativePlatform() && cap.Plugins?.FileSaver) {
    try {
      const base64 = await blobToBase64(blob);
      const result = await cap.Plugins.FileSaver.saveFile({
        data: base64,
        mimeType: blob.type || 'application/octet-stream',
        suggestedName: filename,
      }) as { path: string };
      if (result.path) return;  // saved successfully
      // empty path → fall through
    } catch (err) {
      // UNSUPPORTED_API_LEVEL or any other native error → fall through to
      // web-based paths (share sheet, blob download).
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('UNSUPPORTED_API_LEVEL')) {
        // Unexpected error — still fall through, don't block the user.
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" — strip the prefix.
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
