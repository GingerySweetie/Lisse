/**
 * saveFile — save a Blob to the user's visible storage.
 *
 * Three paths in priority order:
 *
 * 1. File System Access API (`showSaveFilePicker`)
 *    Chrome / Edge desktop: opens a native "Save As" dialog so the user
 *    picks the exact destination path.
 *
 * 2. Web Share API with files
 *    Android WebView / mobile Chrome: opens the system share sheet
 *    (user chooses Downloads, Drive, etc.) instead of silently dropping
 *    the file into a hidden internal-storage directory.
 *
 * 3. Blob URL download fallback
 *    Classic `<a download>` trick; always works on desktop Firefox / Safari.
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  /** Optional MIME-type description shown in the File System Access dialog. */
  description = 'File',
): Promise<void> {
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
      // User cancelled the picker → do nothing and return.
      if (err instanceof Error && err.name === 'AbortError') return;
      // Any unexpected error → fall through to next method.
    }
  }

  // Path 2: Web Share API with files — Android share sheet.
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // User dismissed the sheet → do nothing.
      if (err instanceof Error && err.name === 'AbortError') return;
      // Unexpected error → fall through to blob download.
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
