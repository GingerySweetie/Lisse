import { registerPlugin } from '@capacitor/core';

/**
 * FileSaver — native Android file writes (Downloads + SAF folder)
 * and manual recovery reads (app-private / Downloads / SAF scan).
 * Large payloads must use beginSave / writeChunk / endSave (or
 * beginRead / readChunk / endRead).
 */

export interface RecoverableFileMeta {
  uri: string;
  name: string;
  size: number;
  modifiedAt: number;
  source: string;
  pathHint: string;
  kindGuess: string;
}

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
  findRecoverableFiles(opts?: {
    folderUri?: string;
  }): Promise<{
    files: RecoverableFileMeta[];
    scannedPrivate: boolean;
    scannedDownloads: boolean;
    scannedBackupFolder: boolean;
  }>;
  beginRead(opts: { uri: string }): Promise<{ handle: string; size: number }>;
  readChunk(opts: { handle: string }): Promise<{ data: string; done: boolean }>;
  endRead(opts: { handle: string }): Promise<void>;
  copyRecoverableToDownloads(opts: {
    uri: string;
    suggestedName?: string;
  }): Promise<{ path: string }>;
}

const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');
export default FileSaver;
