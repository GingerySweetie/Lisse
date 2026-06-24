import type { ChatTurn } from '../api';
import type { Message, Persona } from '../types';

/**
 * In a group conversation, when persona X is the one about to respond,
 * messages from OTHER personas can't be sent back as 'assistant' role
 * (the API only has one assistant per request). We collapse them into
 * 'user' role with a name prefix so X can still tell who said what:
 *
 *   原本:  Rhema酱 说: "..."
 *   API:   { role: 'user', content: '[Rhema酱] ...' }
 *
 * X's own past messages keep 'assistant' role as normal.
 */
export function buildGroupTurns(
  branch: Message[],
  /** Persona id of the one who's about to respond. */
  responder: Persona,
  personaById: Map<string, Persona>,
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of branch) {
    if (m.role === 'system') continue;
    if (!m.content && (!m.attachments || m.attachments.length === 0)) continue;

    if (m.role === 'user') {
      turns.push({
        role: 'user',
        content: m.content,
        attachments: m.attachments,
      });
      continue;
    }
    // Assistant message — depends on which persona authored it.
    if (!m.personaId || m.personaId === responder.id) {
      turns.push({
        role: 'assistant',
        content: m.content,
        attachments: m.attachments,
      });
    } else {
      const other = personaById.get(m.personaId);
      const label = other?.name ?? '另一个人';
      turns.push({
        role: 'user',
        content: `[${label}] ${m.content}`,
        attachments: m.attachments,
      });
    }
  }
  return turns;
}

/** Compose group-context system prompt — augments persona's normal system
 *  prompt with awareness that they're in a group chat with specific others. */
export function groupAwarenessSnippet(
  responder: Persona,
  others: Persona[],
): string {
  if (others.length === 0) return '';
  const list = others.map((p) => p.name).join(' / ');
  return `# 你不是一个人

这是一个三人对话：さざなみ、你（${responder.name}）、还有 ${list}。\
所有人能看到所有消息。其他 AI 说的话会以 \`[名字] ...\` 的格式出现在 user 消息里，但你应该当作他们直接在说。

你可以选择回应 さざなみ、回应另一位 AI、或者两者都顾上。不要假装其他 AI 不存在；他们和你在同一个场景里。`;
}

export function isGroup(personaIds?: string[]): boolean {
  return !!(personaIds && personaIds.length >= 2);
}
