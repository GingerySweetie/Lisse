/**
 * Parse Claude.ai "memories" export JSON into atomized memory facts.
 *
 * Observed shape (array or single object):
 * {
 *   conversations_memory: markdown with **Section** headers,
 *   project_memories: { [projectUuid]: markdown },
 *   account_uuid?: string
 * }
 *
 * Pure parse — embedding / DB write happen in importClaudeMemories().
 */
import type { FactCategory } from '../../types';

export interface ClaudeMemoryAtom {
  text: string;
  category: FactCategory;
  /** Instruction-like bullets / personal core — pin by default. */
  pinned: boolean;
  /** Provenance label for UI / de-dupe key. */
  source: string;
}

export interface ParseClaudeMemoriesResult {
  atoms: ClaudeMemoryAtom[];
  accountUuid?: string;
  projectCount: number;
}

const SECTION_RE = /\*\*([^*]+)\*\*/g;

/** Detect Claude memories export; throws with a Chinese hint if not. */
export function parseClaudeMemoriesExport(
  raw: unknown,
): ParseClaudeMemoriesResult {
  const root = unwrapRoot(raw);
  if (!root) {
    throw new Error(
      '不是 Claude 记忆导出：需要含 conversations_memory 的 JSON（数组或对象）',
    );
  }

  const atoms: ClaudeMemoryAtom[] = [];
  const cm = typeof root.conversations_memory === 'string'
    ? root.conversations_memory
    : '';
  if (cm.trim()) {
    atoms.push(...parseConversationsMemory(cm));
  }

  let projectCount = 0;
  const projects = root.project_memories;
  if (projects && typeof projects === 'object' && !Array.isArray(projects)) {
    for (const [id, body] of Object.entries(
      projects as Record<string, unknown>,
    )) {
      if (typeof body !== 'string' || !body.trim()) continue;
      projectCount += 1;
      atoms.push(...parseProjectMemory(id, body));
    }
  }

  if (atoms.length === 0) {
    throw new Error('Claude 记忆文件里没有可导入的内容');
  }

  const accountUuid =
    typeof root.account_uuid === 'string' ? root.account_uuid : undefined;

  return { atoms, accountUuid, projectCount };
}

function unwrapRoot(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    const first = raw.find(
      (x) => x && typeof x === 'object' && !Array.isArray(x),
    );
    return first ? (first as Record<string, unknown>) : null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('conversations_memory' in obj || 'project_memories' in obj) {
      return obj;
    }
  }
  return null;
}

function parseConversationsMemory(md: string): ClaudeMemoryAtom[] {
  const sections = splitMarkdownSections(md);
  const out: ClaudeMemoryAtom[] = [];
  for (const { title, body } of sections) {
    const key = title.trim().toLowerCase();
    if (key === 'other instructions' || key === '其他说明') {
      out.push(...parseInstructionBullets(body));
      continue;
    }
    if (key === 'brief history' || key === '简要历史' || key === '历史') {
      out.push(...parseBriefHistory(body));
      continue;
    }
    const category = categoryForSection(key);
    const pinned = key === 'personal context' || key === '个人背景';
    for (const para of splitParagraphs(body)) {
      out.push({
        text: para,
        category,
        pinned,
        source: `claude:${title.trim()}`,
      });
    }
  }
  return out;
}

function parseBriefHistory(body: string): ClaudeMemoryAtom[] {
  // Subheads like *Recent months* / *Earlier context* (may sit at start of body)
  const parts = body.split(/(?:^|\n)\s*\*([^*\n]+)\*\s*\n/);
  const out: ClaudeMemoryAtom[] = [];
  if (parts.length === 1) {
    for (const para of splitParagraphs(body)) {
      out.push({
        text: para,
        category: 'context',
        pinned: false,
        source: 'claude:Brief history',
      });
    }
    return out;
  }
  // parts: [preamble, heading1, body1, heading2, body2, ...]
  const preamble = parts[0]?.trim();
  if (preamble) {
    for (const para of splitParagraphs(preamble)) {
      out.push({
        text: para,
        category: 'context',
        pinned: false,
        source: 'claude:Brief history',
      });
    }
  }
  for (let i = 1; i < parts.length; i += 2) {
    const heading = (parts[i] ?? '').trim();
    const chunk = parts[i + 1] ?? '';
    for (const para of splitParagraphs(chunk)) {
      out.push({
        text: para,
        category: 'event',
        pinned: false,
        source: `claude:Brief history/${heading || 'section'}`,
      });
    }
  }
  return out;
}

function parseInstructionBullets(body: string): ClaudeMemoryAtom[] {
  const lines = body.split(/\n/);
  const bullets: string[] = [];
  let acc = '';
  for (const line of lines) {
    const m = line.match(/^\s*[-•]\s+(.+)$/);
    if (m) {
      if (acc.trim()) bullets.push(acc.trim());
      acc = m[1] ?? '';
    } else if (acc) {
      // continuation of previous bullet
      const t = line.trim();
      if (t) acc += ' ' + t;
    } else {
      const t = line.trim();
      if (t && !t.startsWith('---')) {
        // orphan prose before bullets
        bullets.push(t);
      }
    }
  }
  if (acc.trim()) bullets.push(acc.trim());

  return bullets
    .map((t) => t.trim())
    .filter((t) => t.length >= 8)
    .map((text) => ({
      text,
      category: categoryForInstruction(text),
      pinned: true,
      source: 'claude:Other instructions',
    }));
}

function parseProjectMemory(
  projectId: string,
  body: string,
): ClaudeMemoryAtom[] {
  const sections = splitMarkdownSections(body);
  const chunks =
    sections.length > 0
      ? sections
      : [{ title: 'project', body }];
  const out: ClaudeMemoryAtom[] = [];
  for (const { title, body: sectionBody } of chunks) {
    for (const para of splitParagraphs(sectionBody)) {
      // Skip synthesis exclusion notes
      if (/excluded per synthesis guidelines/i.test(para)) continue;
      out.push({
        text: para,
        category: 'context',
        pinned: false,
        source: `claude:project/${projectId.slice(0, 8)}/${title.trim() || 'note'}`,
      });
    }
  }
  return out;
}

function splitMarkdownSections(
  md: string,
): Array<{ title: string; body: string }> {
  const matches = [...md.matchAll(SECTION_RE)];
  if (matches.length === 0) {
    const t = md.trim();
    return t ? [{ title: 'memory', body: t }] : [];
  }
  const out: Array<{ title: string; body: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const title = m[1] ?? 'section';
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : md.length;
    const body = md.slice(start, end).replace(/^[\s\-—–]+/, '').trim();
    // Drop horizontal rules / empty
    const cleaned = body.replace(/^---+\s*/gm, '').trim();
    if (cleaned) out.push({ title, body: cleaned });
  }
  return out;
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 12)
    .filter((p) => !/^---+$/.test(p));
}

function categoryForSection(key: string): FactCategory {
  if (key.includes('work') || key.includes('工作')) return 'user_fact';
  if (key.includes('personal') || key.includes('个人')) return 'user_fact';
  if (key.includes('top of mind') || key.includes('近况')) return 'context';
  if (key.includes('relationship') || key.includes('关系')) return 'relationship';
  if (key.includes('prefer')) return 'preference';
  return 'context';
}

function categoryForInstruction(text: string): FactCategory {
  if (/关系|恋人|romantic|伴侣|Rhema|理理酱|jealous/i.test(text)) {
    return 'relationship';
  }
  if (/喜欢|偏好|prefer|nickname|外号|称呼|禁|不要|必须|always|never/i.test(text)) {
    return 'preference';
  }
  if (/ADHD|诊断|身高|生日|岁|BMI|体检|服药|工作|住址|住在/i.test(text)) {
    return 'user_fact';
  }
  if (/约会|预约|计划|周末|OGTT|复诊/i.test(text)) return 'event';
  return 'other';
}
