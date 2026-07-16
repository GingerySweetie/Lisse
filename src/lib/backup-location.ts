import { Capacitor } from '@capacitor/core';
import { db } from '../db';
import FileSaver from './native/file-saver';

const BACKUP_FOLDER_URI_KEY = 'backup_folder_uri';
const BACKUP_FOLDER_LABEL_KEY = 'backup_folder_label';

export interface BackupFolder {
  uri: string;
  label: string;
}

/** True when the SAF folder picker is available (Android APK). */
export function isBackupFolderPickerAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getBackupFolder(): Promise<BackupFolder | null> {
  const [uriRow, labelRow] = await Promise.all([
    db.kv.get(BACKUP_FOLDER_URI_KEY),
    db.kv.get(BACKUP_FOLDER_LABEL_KEY),
  ]);
  if (!uriRow?.value || typeof uriRow.value !== 'string') return null;
  return {
    uri: uriRow.value,
    label:
      typeof labelRow?.value === 'string' && labelRow.value
        ? labelRow.value
        : '已选目录',
  };
}

export async function setBackupFolder(folder: BackupFolder): Promise<void> {
  await db.kv.put({ key: BACKUP_FOLDER_URI_KEY, value: folder.uri });
  await db.kv.put({ key: BACKUP_FOLDER_LABEL_KEY, value: folder.label });
}

export async function clearBackupFolder(): Promise<void> {
  await db.kv.delete(BACKUP_FOLDER_URI_KEY);
  await db.kv.delete(BACKUP_FOLDER_LABEL_KEY);
}

/** Returns the saved folder only if the persisted SAF grant is still valid. */
export async function getValidBackupFolder(): Promise<BackupFolder | null> {
  const folder = await getBackupFolder();
  if (!folder || !isBackupFolderPickerAvailable()) return folder;

  try {
    const result = await FileSaver.checkBackupFolderPermission({ uri: folder.uri });
    if (!result.valid) {
      await clearBackupFolder();
      return null;
    }
    if (result.label && result.label !== folder.label) {
      const updated = { uri: folder.uri, label: result.label };
      await setBackupFolder(updated);
      return updated;
    }
    return folder;
  } catch {
    return null;
  }
}

export async function pickBackupFolder(): Promise<BackupFolder> {
  const result = await FileSaver.pickBackupFolder();
  const folder = { uri: result.uri, label: result.label };
  await setBackupFolder(folder);
  return folder;
}

async function blobToBase64(blob: Blob): Promise<string> {
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

/** Save a blob into the user-chosen SAF folder. Throws on permission loss. */
export async function saveBlobToBackupFolder(
  blob: Blob,
  filename: string,
  folderUri: string,
): Promise<void> {
  const base64 = await blobToBase64(blob);
  await FileSaver.saveFileToFolder({
    data: base64,
    mimeType: blob.type || 'application/octet-stream',
    suggestedName: filename,
    folderUri,
  });
}
