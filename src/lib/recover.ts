/**
 * Manual recovery of previous conversation / backup JSON files.
 *
 * Android APK: scans app-private ("hidden") dirs, MediaStore Downloads, and
 * the remembered SAF backup folder via FileSaverPlugin.
 *
 * Web / PWA: user picks files or a directory (including ones file managers
 * hide from casual browsing); we detect `__lisse` markers and import.
 */

import { Capacitor } from '@capacitor/core';
import type { ImportBackupResult } from './backup';
import { importBackupStream } from './backup-stream-import';
import { getBackupFolder, getValidBackupFolder } from './backup-location';
import { importConfigBundle, type ImportConfigResult } from './config-export';
import {
  importChatGPTStream,
  importClaudeStream,
  importLisseConversation,
} from './import';
import type { ImportResult } from './import';
import FileSaver, { type RecoverableFileMeta } from './native/file-saver';
import {
  assertBackupImportFileSize,
  assertImportFileSize,
  MAX_IMPORT_FILE_BYTES,
  StorageLimitError,
  formatBytes as formatGuardBytes,
} from './storage-guards';
import {
  detectRecoverKind,
  filesToRecoverableItems,
  formatBytes,
  guessKindFromName,
  kindLabel,
  sourceLabel,
  type RecoverKind,
  type RecoverSource,
} from './recover-detect';

export type { RecoverKind, RecoverSource };
export {
  detectRecoverKind,
  filesToRecoverableItems,
  formatBytes,
  guessKindFromName,
  kindLabel,
  sourceLabel,
};

export interface RecoverableItem {
  id: string;
  name: string;
  size: number;
  modifiedAt: number;
  source: RecoverSource | string;
  pathHint: string;
  kindGuess: RecoverKind | string;
  /** Present for native-scanned files. */
  uri?: string;
  /** Present for browser-picked files. */
  file?: File;
}

export interface RecoverScanResult {
  files: RecoverableItem[];
  scannedPrivate: boolean;
  scannedDownloads: boolean;
  scannedBackupFolder: boolean;
  note?: string;
}

export function isNativeRecoverAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function metaToItem(m: RecoverableFileMeta): RecoverableItem {
  return {
    id: m.uri,
    uri: m.uri,
    name: m.name,
    size: m.size,
    modifiedAt: m.modifiedAt,
    source: m.source,
    pathHint: m.pathHint,
    kindGuess: (m.kindGuess as RecoverKind) || guessKindFromName(m.name),
  };
}

/** Native scan of private dirs + Downloads + optional SAF backup folder. */
export async function scanRecoverableNative(): Promise<RecoverScanResult> {
  if (!isNativeRecoverAvailable()) {
    return {
      files: [],
      scannedPrivate: false,
      scannedDownloads: false,
      scannedBackupFolder: false,
      note: '当前环境不是 Android APK，请改用下方「选择文件 / 选择文件夹」。',
    };
  }

  let folderUri: string | undefined;
  try {
    const valid = await getValidBackupFolder();
    folderUri = valid?.uri ?? (await getBackupFolder())?.uri;
  } catch {
    folderUri = undefined;
  }

  const result = await FileSaver.findRecoverableFiles(
    folderUri ? { folderUri } : {},
  );
  const files = (result.files ?? []).map(metaToItem);
  return {
    files,
    scannedPrivate: !!result.scannedPrivate,
    scannedDownloads: !!result.scannedDownloads,
    scannedBackupFolder: !!result.scannedBackupFolder,
  };
}

/** Read a native recoverable file as UTF-8 text via chunked base64. */
export async function readRecoverableText(uri: string): Promise<string> {
  const { handle } = await FileSaver.beginRead({ uri });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { data, done } = await FileSaver.readChunk({ handle });
      if (data) {
        const bytes = base64ToBytes(data);
        chunks.push(bytes);
        total += bytes.byteLength;
      }
      if (done) break;
    }
  } finally {
    try {
      await FileSaver.endRead({ handle });
    } catch {
      // ignore
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('文件读取失败'));
    r.readAsText(file);
  });
}

/** Peek the first ~8KB to refine kindGuess without loading the whole file. */
export async function peekRecoverKind(item: RecoverableItem): Promise<RecoverKind> {
  try {
    if (item.file) {
      const slice = item.file.slice(0, 8_192);
      const text = await readFileAsText(new File([slice], item.name));
      return detectRecoverKind(text);
    }
    if (item.uri) {
      const { handle } = await FileSaver.beginRead({ uri: item.uri });
      try {
        const { data } = await FileSaver.readChunk({ handle });
        if (!data) return guessKindFromName(item.name);
        const text = new TextDecoder('utf-8').decode(base64ToBytes(data));
        return detectRecoverKind(text);
      } finally {
        try {
          await FileSaver.endRead({ handle });
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // fall through
  }
  return guessKindFromName(item.name);
}

export type RecoverImportMode = 'merge' | 'replace';

export type RecoverImportOutcome =
  | { kind: 'backup'; result: ImportBackupResult }
  | { kind: 'conversations'; result: ImportResult }
  | { kind: 'config'; result: ImportConfigResult }
  | { kind: 'chatgpt'; result: ImportResult }
  | { kind: 'claude'; result: ImportResult };

export async function importRecoverableItem(
  item: RecoverableItem,
  opts: {
    mode?: RecoverImportMode;
    personaId?: string;
    defaultEndpointId?: string;
    defaultModel?: string;
    onProgress?: (label: string) => void;
  } = {},
): Promise<{ detected: RecoverKind; outcome: RecoverImportOutcome }> {
  const mode = opts.mode ?? 'merge';

  // Full backups + ChatGPT/Claude exports use streaming — peek kind, then
  // never load the whole JSON string into JS heap when possible.
  const peeked = await peekRecoverKind(item);
  const vendorGuess =
    peeked === 'chatgpt' || peeked === 'claude'
      ? peeked
      : item.kindGuess === 'chatgpt' || item.kindGuess === 'claude'
        ? item.kindGuess
        : null;

  if (peeked === 'backup') {
    assertBackupImportFileSize(item.size || item.file?.size || 0, item.name);
    if (!item.file && !item.uri) {
      throw new Error('没有可读取的文件内容');
    }
    const result = await importBackupStream(
      item.file
        ? { kind: 'file', file: item.file }
        : { kind: 'uri', uri: item.uri! },
      { mode, onProgress: opts.onProgress },
    );
    return { detected: 'backup', outcome: { kind: 'backup', result } };
  }

  if (vendorGuess === 'chatgpt' || vendorGuess === 'claude') {
    assertBackupImportFileSize(
      item.size || item.file?.size || 0,
      vendorGuess === 'claude' ? 'Claude 导出' : 'ChatGPT 导出',
    );
    if (!item.file) {
      // URI-only recover: load text then stream from string chunks.
      // Still avoids FileReader on the ImportExport path; recover URI path
      // already reads via native chunking into a string.
      const text = item.uri
        ? await readRecoverableText(item.uri)
        : (() => {
            throw new Error('没有可读取的文件内容');
          })();
      if (vendorGuess === 'chatgpt') {
        const result = await importChatGPTStream(
          { kind: 'text', text },
          {
            personaId: opts.personaId,
            defaultEndpointId: opts.defaultEndpointId,
            defaultModel: opts.defaultModel,
            onProgress: opts.onProgress,
          },
        );
        return { detected: 'chatgpt', outcome: { kind: 'chatgpt', result } };
      }
      const result = await importClaudeStream(
        { kind: 'text', text },
        {
          personaId: opts.personaId,
          defaultEndpointId: opts.defaultEndpointId,
          defaultModel: opts.defaultModel,
          onProgress: opts.onProgress,
        },
      );
      return { detected: 'claude', outcome: { kind: 'claude', result } };
    }
    if (vendorGuess === 'chatgpt') {
      const result = await importChatGPTStream(
        { kind: 'file', file: item.file },
        {
          personaId: opts.personaId,
          defaultEndpointId: opts.defaultEndpointId,
          defaultModel: opts.defaultModel,
          onProgress: opts.onProgress,
        },
      );
      return { detected: 'chatgpt', outcome: { kind: 'chatgpt', result } };
    }
    const result = await importClaudeStream(
      { kind: 'file', file: item.file },
      {
        personaId: opts.personaId,
        defaultEndpointId: opts.defaultEndpointId,
        defaultModel: opts.defaultModel,
        onProgress: opts.onProgress,
      },
    );
    return { detected: 'claude', outcome: { kind: 'claude', result } };
  }

  if (item.file) {
    assertImportFileSize(item.file, item.name);
  } else if (item.size > MAX_IMPORT_FILE_BYTES) {
    throw new StorageLimitError(
      `${item.name}太大了（${formatGuardBytes(item.size)}），上限 ${formatGuardBytes(MAX_IMPORT_FILE_BYTES)}。` +
        `请先在电脑上拆分，或导出一份更小的备份再导入——整文件读进内存会直接把页面打死。`,
    );
  }

  const text = item.file
    ? await readFileAsText(item.file)
    : item.uri
      ? await readRecoverableText(item.uri)
      : (() => {
          throw new Error('没有可读取的文件内容');
        })();

  const detected = detectRecoverKind(text);

  switch (detected) {
    case 'backup': {
      // Peek missed the marker (odd encoding); still stream from source.
      assertBackupImportFileSize(item.size || item.file?.size || 0, item.name);
      const result = await importBackupStream(
        { kind: 'text', text },
        { mode, onProgress: opts.onProgress },
      );
      return { detected, outcome: { kind: 'backup', result } };
    }
    case 'conversation':
    case 'conversations': {
      const result = await importLisseConversation(text);
      return {
        detected: 'conversations',
        outcome: { kind: 'conversations', result },
      };
    }
    case 'config': {
      const result = await importConfigBundle(text, { mode });
      return { detected, outcome: { kind: 'config', result } };
    }
    case 'chatgpt': {
      const result = await importChatGPTStream(
        { kind: 'text', text },
        {
          personaId: opts.personaId,
          defaultEndpointId: opts.defaultEndpointId,
          defaultModel: opts.defaultModel,
          onProgress: opts.onProgress,
        },
      );
      return { detected, outcome: { kind: 'chatgpt', result } };
    }
    case 'claude': {
      const result = await importClaudeStream(
        { kind: 'text', text },
        {
          personaId: opts.personaId,
          defaultEndpointId: opts.defaultEndpointId,
          defaultModel: opts.defaultModel,
          onProgress: opts.onProgress,
        },
      );
      return { detected, outcome: { kind: 'claude', result } };
    }
    default:
      throw new Error(
        `无法识别文件格式（${item.name}）。需要带 __lisse 标记的备份/对话 JSON，或 ChatGPT/Claude 导出。`,
      );
  }
}

/** Copy a hidden/private recoverable file into public Downloads (Android). */
export async function copyRecoverableToDownloads(
  item: RecoverableItem,
): Promise<string> {
  if (!item.uri) throw new Error('只能复制原生扫描到的文件');
  const result = await FileSaver.copyRecoverableToDownloads({
    uri: item.uri,
    suggestedName: item.name.endsWith('.json')
      ? item.name
      : `${item.name}.json`,
  });
  return result.path;
}

/**
 * Scan a directory handle (File System Access API) for candidate JSON files.
 * Works on desktop Chrome/Edge; not available in Android WebView.
 */
export async function scanDirectoryHandle(
  root: FileSystemDirectoryHandle,
): Promise<RecoverableItem[]> {
  const out: RecoverableItem[] = [];
  await walkDir(root, '', 0, out);
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  out: RecoverableItem[],
): Promise<void> {
  if (depth > 4 || out.length >= 400) return;
  const entries = (
    dir as FileSystemDirectoryHandle & {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    }
  ).entries();
  for await (const [name, handle] of entries) {
    if (out.length >= 400) return;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      const lower = name.toLowerCase();
      if (
        lower === 'node_modules' ||
        lower === '.git' ||
        lower === 'webview' ||
        lower === 'image_manager_disk_cache' ||
        lower === 'okhttp' ||
        lower === 'http-cache'
      ) {
        continue;
      }
      await walkDir(handle as FileSystemDirectoryHandle, path, depth + 1, out);
      continue;
    }
    const lower = name.toLowerCase();
    if (!(lower.endsWith('.json') || lower.endsWith('.json.bak'))) continue;
    if (
      !(
        lower.includes('lisse') ||
        lower.includes('wisteria') ||
        lower.includes('backup') ||
        lower.includes('conversation') ||
        lower.includes('chatgpt') ||
        lower.includes('claude')
      )
    ) {
      continue;
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    out.push({
      id: `dir:${path}:${file.size}:${file.lastModified}`,
      file,
      name: file.name,
      size: file.size,
      modifiedAt: file.lastModified,
      source: 'directory',
      pathHint: path,
      kindGuess: guessKindFromName(file.name),
    });
  }
}

export function isDirectoryPickerAvailable(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickRecoverDirectory(): Promise<RecoverableItem[]> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: {
        id?: string;
        mode?: 'read' | 'readwrite';
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ id: 'lisse-recover', mode: 'read' });
  return scanDirectoryHandle(handle);
}

export function summarizeRecoverOutcome(
  detected: RecoverKind,
  outcome: RecoverImportOutcome,
): string {
  if (outcome.kind === 'backup') {
    const r = outcome.result;
    return `已恢复备份：对话 ${r.conversationsAdded}，消息 ${r.messagesAdded}`;
  }
  if (outcome.kind === 'config') {
    const r = outcome.result;
    const parts: string[] = [];
    if (r.personasAdded) parts.push(`人格 ${r.personasAdded}`);
    if (r.endpointsAdded) parts.push(`接口 ${r.endpointsAdded}`);
    if (r.writingStylesAdded) parts.push(`风格 ${r.writingStylesAdded}`);
    return parts.length ? `已恢复配置：${parts.join('，')}` : '配置已导入';
  }
  const r = outcome.result;
  const parts = [`导入 ${r.importedCount} 条`];
  if (r.skippedCount) parts.push(`跳过 ${r.skippedCount} 条`);
  if (r.errors.length) parts.push(`${r.errors.length} 条出错`);
  return `${kindLabel(detected)}：${parts.join('，')}`;
}
