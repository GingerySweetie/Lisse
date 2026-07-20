/** Shared result shape for exports that may land in the SAF backup folder. */

export interface ExportSaveFolder {
  uri: string;
  label: string;
}

export interface ExportSaveResult {
  /** True when the file landed in the user-picked SAF folder. */
  usedBackupFolder: boolean;
  /** Folder used, if any (may be null when saved to Downloads / web). */
  folder: ExportSaveFolder | null;
  /** Native path hint when available. */
  path?: string;
}

/** Short Chinese label for where an export landed. */
export function formatExportSaveLabel(
  result: ExportSaveResult,
  fallback: string,
): string {
  if (result.usedBackupFolder && result.folder) {
    return `${fallback}（已保存到「${result.folder.label}」）`;
  }
  return fallback;
}
