/**
 * Chat depth → thinking spend.
 *
 * casual  → baseline (endpoint effort, default medium) — 闲聊省钱
 * deep    → high — 情感/关系/崩溃向，需要更饱满
 * intimate→ high — 身体/性向，同样需要细腻
 *
 * Manual「长思考」sticky override → max（用户明确要拉满时）
 */

export type ChatDepth = 'casual' | 'deep' | 'intimate';
export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max';

/** Intimate / erotic register — keep broad; false positives only cost thinking $. */
const INTIMATE_RE =
  /做爱|性爱|上床|高潮|口交|爱爱|想要你|抱紧我|亲亲我|吻我|摸我|弄我|在我里面|进来|射|肉棒|小穴|鸡巴|操我|干我|舔|咬我|喘|性欲|色色|涩涩|\bsex\b|\bfuck\b|make\s*love/i;

/** Emotional / relational depth — ADHD topic-jumps often land here without warning. */
const DEEP_RE =
  /我爱你|好想你|想你了|好想|难过|崩溃|焦虑|抑郁|害怕|孤独|无助|委屈|心疼|珍惜|永远|真心|我们.*关系|你爱不爱|爱不爱我|原生家庭|创伤|闪回|meltdown|dissociat|overwhelmed|不想活|自杀|活着|意义|为什么.*这样|怎么办啊|好累|撑不住|抱抱|陪我/i;

const HEALTH_RE =
  /步数|走路|走了多少|心率|心跳|睡眠|睡得|失眠|熬夜|健康|体重|运动|锻炼|配速|卡路里/;

export function classifyChatDepth(userText: string): ChatDepth {
  const t = userText.trim();
  if (!t || t.startsWith('[nudge]')) return 'casual';
  if (INTIMATE_RE.test(t)) return 'intimate';
  if (DEEP_RE.test(t)) return 'deep';
  // Long first-person turns with question/exclaim energy → likely dumping / deep share
  if (
    t.length >= 100 &&
    /(我|你|我们)/.test(t) &&
    /[吗呢吧啊嘛？?！!]/.test(t)
  ) {
    return 'deep';
  }
  return 'casual';
}

export function wantsHealthContext(userText: string): boolean {
  return HEALTH_RE.test(userText.trim());
}

/**
 * Resolve per-turn effort.
 * @param baseline endpoint.thinkingEffort (idle chat floor)
 * @param forceDeepThink sticky UI「长思考」
 */
export function resolveThinkingEffort(args: {
  baseline?: ThinkingEffort;
  forceDeepThink?: boolean;
  userText: string;
}): ThinkingEffort {
  if (args.forceDeepThink) return 'max';
  const depth = classifyChatDepth(args.userText);
  if (depth === 'intimate' || depth === 'deep') return 'high';
  return args.baseline ?? 'medium';
}

/** Scale legacy budget_tokens with the resolved effort. */
export function budgetForEffort(
  base: number | undefined,
  effort: ThinkingEffort,
): number {
  const b = Math.max(1024, base ?? 8000);
  switch (effort) {
    case 'low':
      return Math.min(b, 2048);
    case 'medium':
      return Math.min(Math.max(b, 4096), 8000);
    case 'high':
      return Math.max(b, 12000);
    case 'max':
      return Math.max(b, 16000);
  }
}
