import { Capacitor } from '@capacitor/core';
import { db } from '../db';
import FileSaver from './native/file-saver';
import { saveBlobNativeChunked } from './native-chunked-save';
import {
  mirrorBackupFolder,
  readMirroredBackupFolder,
} from './data-sentinel';

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
  try {
    const [uriRow, labelRow] = await Promise.all([
      db.kv.get(BACKUP_FOLDER_URI_KEY),
      db.kv.get(BACKUP_FOLDER_LABEL_KEY),
    ]);
    if (uriRow?.value && typeof uriRow.value === 'string') {
      const folder = {
        uri: uriRow.value,
        label:
          typeof labelRow?.value === 'string' && labelRow.value
            ? labelRow.value
            : '已选目录',
      };
      mirrorBackupFolder(folder);
      return folder;
    }
  } catch {
    // IDB unreadable — fall through to localStorage mirror.
  }
  return readMirroredBackupFolder();
}

export async function setBackupFolder(folder: BackupFolder): Promise<void> {
  await db.kv.put({ key: BACKUP_FOLDER_URI_KEY, value: folder.uri });
  await db.kv.put({ key: BACKUP_FOLDER_LABEL_KEY, value: folder.label });
  mirrorBackupFolder(folder);
}

export async function clearBackupFolder(): Promise<void> {
  await db.kv.delete(BACKUP_FOLDER_URI_KEY);
  await db.kv.delete(BACKUP_FOLDER_LABEL_KEY);
  mirrorBackupFolder(null);
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

/** Save a blob into the user-chosen SAF folder (chunked). Throws on permission loss. */
export async function saveBlobToBackupFolder(
  blob: Blob,
  filename: string,
  folderUri: string,
): Promise<void> {
  await saveBlobNativeChunked(blob, filename, { folderUri });
}
