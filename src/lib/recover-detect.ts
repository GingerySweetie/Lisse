/**
 * Pure helpers for classifying recoverable conversation / backup files.
 * Kept free of Capacitor / IndexedDB so node tests can import them.
 */

export type RecoverKind =
  | 'backup'
  | 'conversation'
  | 'conversations'
  | 'config'
  | 'chatgpt'
  | 'claude'
  | 'unknown';

export type RecoverSource =
  | 'app-private'
  | 'downloads'
  | 'backup-folder'
  | 'picked'
  | 'directory';

/** Detect Lisse/Wisteria/ChatGPT/Claude export kind from JSON text (or a peek). */
export function detectRecoverKind(text: string): RecoverKind {
  const head = text.slice(0, 8_192);
  const marker = /"__lisse"\s*:\s*"([^"]+)"/.exec(head);
  if (marker) {
    const kind = marker[1];
    if (
      kind === 'backup' ||
      kind === 'conversation' ||
      kind === 'conversations' ||
      kind === 'config'
    ) {
      return kind;
    }
  }
  const trimmed = head.trimStart();
  if (trimmed.startsWith('[')) {
    if (
      head.includes('"mapping"') &&
      (head.includes('"current_node"') || head.includes('"create_time"'))
    ) {
      return 'chatgpt';
    }
    if (head.includes('"chat_messages"') || head.includes('"sender"')) {
      return 'claude';
    }
  }
  if (
    trimmed.startsWith('{') &&
    (head.includes('"chat_messages"') || head.includes('"name"')) &&
    head.includes('"uuid"')
  ) {
    return 'claude';
  }
  return 'unknown';
}

export function guessKindFromName(name: string): RecoverKind {
  const lower = name.toLowerCase();
  if (lower.includes('backup')) return 'backup';
  if (lower.includes('config')) return 'config';
  // Vendor names before the generic "conversation" token — filenames like
  // chatgpt-conversations.json should stay tagged as chatgpt.
  if (lower.includes('chatgpt')) return 'chatgpt';
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('conversation')) return 'conversations';
  if (lower.includes('lisse') || lower.includes('wisteria')) return 'unknown';
  return 'unknown';
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function sourceLabel(source: string): string {
  switch (source) {
    case 'app-private':
      return '应用私有目录（隐藏）';
    case 'downloads':
      return '系统下载';
    case 'backup-folder':
      return '备份目录';
    case 'picked':
      return '手动选择';
    case 'directory':
      return '目录扫描';
    default:
      return source;
  }
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case 'backup':
      return '全量备份';
    case 'conversation':
      return '单条对话';
    case 'conversations':
      return '对话 JSON';
    case 'config':
      return '配置';
    case 'chatgpt':
      return 'ChatGPT 导出';
    case 'claude':
      return 'Claude 导出';
    default:
      return '未知 / 待识别';
  }
}

export interface RecoverableItemBase {
  id: string;
  name: string;
  size: number;
  modifiedAt: number;
  source: RecoverSource | string;
  pathHint: string;
  kindGuess: RecoverKind | string;
}

/** Turn user-picked FileList into recoverable item metadata (+ File refs). */
export function filesToRecoverableItems(
  files: FileList | File[],
  source: RecoverSource = 'picked',
): Array<RecoverableItemBase & { file: File }> {
  const list = Array.from(files);
  return list
    .filter((f) => {
      const n = f.name.toLowerCase();
      return (
        n.endsWith('.json') ||
        n.endsWith('.json.bak') ||
        n.includes('lisse') ||
        n.includes('wisteria') ||
        n.includes('backup') ||
        n.includes('conversation')
      );
    })
    .map((f) => ({
      id: `file:${f.name}:${f.size}:${f.lastModified}`,
      file: f,
      name: f.name,
      size: f.size,
      modifiedAt: f.lastModified,
      source,
      pathHint:
        (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
        f.name,
      kindGuess: guessKindFromName(f.name),
    }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}
