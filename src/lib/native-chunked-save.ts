import FileSaver from './native/file-saver';

/** ~192 KiB binary per chunk → ~256 KiB base64, safely under Binder ~1 MiB. */
const CHUNK_BYTES = 192 * 1024;

/**
 * Write a Blob to native storage in small base64 chunks.
 * Avoids the Android Binder transaction crash that happens when a large
 * backup is sent as one giant base64 string across the Capacitor bridge.
 */
export async function saveBlobNativeChunked(
  blob: Blob,
  filename: string,
  opts?: { folderUri?: string },
): Promise<string> {
  const { handle } = await FileSaver.beginSave({
    mimeType: blob.type || 'application/octet-stream',
    suggestedName: filename,
    folderUri: opts?.folderUri,
  });

  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const slice = blob.slice(offset, offset + CHUNK_BYTES);
      const data = await blobToBase64(slice);
      if (data) {
        await FileSaver.writeChunk({ handle, data });
      }
      // Yield so the WebView can paint progress / stay responsive.
      if (offset + CHUNK_BYTES < blob.size) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    const result = await FileSaver.endSave({ handle });
    return result.path;
  } catch (err) {
    try {
      await FileSaver.abortSave({ handle });
    } catch {
      // ignore abort errors
    }
    throw err;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
