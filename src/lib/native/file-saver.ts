import { registerPlugin } from '@capacitor/core';

/**
 * FileSaver — native Android file writes (Downloads + SAF folder).
 * On non-Android every method is guarded by callers; registerPlugin
 * resolves to a no-op proxy in the browser.
 */

export interface FileSaverPlugin {
  saveFile(opts: {
    data: string;
    mimeType: string;
    suggestedName: string;
  }): Promise<{ path: string }>;
  pickBackupFolder(): Promise<{ uri: string; label: string }>;
  checkBackupFolderPermission(opts: {
    uri: string;
  }): Promise<{ valid: boolean; label?: string }>;
  saveFileToFolder(opts: {
    data: string;
    mimeType: string;
    suggestedName: string;
    folderUri: string;
  }): Promise<{ path: string }>;
}

const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');
export default FileSaver;
