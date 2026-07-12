import type { Artifact } from '../types';
import { newId } from './id';

/** Map common extensions to MIME types. */
function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const MAP: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    js: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    jsx: 'text/javascript',
    css: 'text/css',
    json: 'application/json',
    py: 'text/x-python',
    go: 'text/x-go',
    rs: 'text/x-rust',
    java: 'text/x-java',
    c: 'text/x-c',
    cpp: 'text/x-cpp',
    sh: 'text/x-sh',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    toml: 'text/toml',
    xml: 'text/xml',
    svg: 'image/svg+xml',
    csv: 'text/csv',
  };
  return MAP[ext] ?? 'text/plain';
}

export interface ParseResult {
  /** Response text with all artifact/choice tags removed. */
  cleanText: string;
  artifacts: Artifact[];
  choices: string[];
}

/**
 * Parse AI response text and extract [file name=X]…[/file] and
 * [choices]A|B|C[/choices] blocks.
 *
 * The tags are stripped from the returned cleanText so the chat bubble
 * doesn't render raw markup. Both tag types must be pre-extracted before
 * any bubble-splitting logic because file bodies can contain newlines and
 * pipe characters that would otherwise corrupt downstream parsing.
 */
export function parseArtifacts(text: string): ParseResult {
  const artifacts: Artifact[] = [];
  const choiceGroups: string[][] = [];

  // Extract [file name=X]content[/file] blocks (DOTALL — content spans lines).
  let cleanText = text.replace(
    /\[file\s+name=([^\]]+)\]([\s\S]*?)\[\/file\]/g,
    (_, rawName: string, rawContent: string) => {
      const name = rawName.trim().replace(/["']/g, '');
      const content = rawContent.trim();
      artifacts.push({
        id: newId(),
        name,
        content,
        mimeType: mimeFromName(name),
      });
      return '';
    },
  );

  // Extract [choices]A|B|C[/choices] blocks.
  cleanText = cleanText.replace(
    /\[choices\]([\s\S]*?)\[\/choices\]/g,
    (_, raw: string) => {
      const options = raw
        .split('|')
        .map((o) => o.trim())
        .filter(Boolean);
      if (options.length > 0) choiceGroups.push(options);
      return '';
    },
  );

  // Collapse runs of blank lines left by the removed blocks to at most one.
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  // Flatten multiple choice groups to a single choices array (first group wins;
  // having two separate choice groups in one message is uncommon enough that
  // taking the first is the pragmatic choice).
  const choices = choiceGroups[0] ?? [];

  return { cleanText, artifacts, choices };
}
