import { registerPlugin } from '@capacitor/core';

/**
 * FileSaver — native Android file writes (Downloads + SAF folder).
 * Large files must use beginSave / writeChunk / endSave.
 */

export interface FileSaverPlugin {
  saveFile(opts: {
    data: string;
    mimeType: string;
    suggestedName: string;
  }): Promise<{ path: string }>;
  beginSave(opts: {
    mimeType: string;
    suggestedName: string;
    folderUri?: string;
  }): Promise<{ handle: string }>;
  writeChunk(opts: { handle: string; data: string }): Promise<void>;
  endSave(opts: { handle: string }): Promise<{ path: string }>;
  abortSave(opts: { handle: string }): Promise<void>;
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
