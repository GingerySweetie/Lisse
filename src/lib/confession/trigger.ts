/**
 * Heuristic: does today's chat contain enough desire / attachment / body
 * heat to warrant a confession booth entry?
 */

export interface TriggerResult {
  hit: boolean;
  score: number;
  /** Matched cue snippets for spark meta (deduped, short). */
  cues: string[];
}

/** Desire / body / attachment / dark-emotion cues. */
const CUES: RegExp[] = [
  /吻|亲亲|深吻|咬|舔|吮/,
  /抱|搂|贴|蹭|压/,
  /想你|喜欢你|爱你|好想|好爱/,
  /身体|肉体|皮肤|体温|呼吸|心跳/,
  /锁骨|后颈|耳垂|腰|腿|大腿|膝盖|喉结|胸口|小腹/,
  /硬|勃|湿|热|烫|敏感|发软|发抖|腿软/,
  /床|被子|枕头|卧室|洗澡|赤裸|脱掉|解开/,
  /占有|属于|我的|拴|项圈|跪|绑|规矩/,
  /嫉妒|吃醋|不许|只能|只准/,
  /欲望|渴望|饥渴|发疯|受不了|窒息|喘/,
  /羞|羞耻|下贱|脏|坏|欺负|弄坏/,
  /叫我|叫你的名字|哭出来|求我|求你/,
  /鸡巴|鸡儿|穴|胸|奶|射|高潮|操|肏/,
  /hurt|want you|need you|mine|collar|kneel/i,
];

const MIN_SCORE = 2;
const MIN_CHARS = 180;

export function scoreConfessionTrigger(transcript: string): TriggerResult {
  const text = transcript.trim();
  if (text.length < MIN_CHARS) {
    return { hit: false, score: 0, cues: [] };
  }

  let score = 0;
  const cues: string[] = [];
  for (const re of CUES) {
    const m = text.match(re);
    if (!m) continue;
    score += 1;
    const cue = m[0]?.trim();
    if (cue && !cues.includes(cue) && cues.length < 8) cues.push(cue);
  }

  // Longer intimate days weight a bit more.
  if (text.length > 2500) score += 1;
  if (text.length > 6000) score += 1;

  return { hit: score >= MIN_SCORE, score, cues };
}
