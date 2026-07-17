import type { ClawdEmoteId } from '../../components/clawd/emotes';

/** How long a message-driven reaction sticks before falling back to route mood. */
export const REACTION_MS = 8_000;
/** How long "listening while waiting for reply" sticks after user-send. */
export const WAITING_MS = 45_000;

/** Map current pathname → baseline desk-pet emote. */
export function moodFromRoute(pathname: string): ClawdEmoteId {
  const p = pathname.toLowerCase();

  if (p.startsWith('/music')) return 'listening';
  if (p.startsWith('/books') || p.startsWith('/read')) return 'reading';
  if (p.startsWith('/body') || p.startsWith('/health-report')) return 'exercise';
  if (p.startsWith('/workshop')) return 'coding';
  if (p.startsWith('/browser')) return 'photo';
  if (p.startsWith('/billing') || p.startsWith('/bill-sources')) return 'coffee';
  if (p.startsWith('/bedroom')) return 'sleeping';
  if (p.startsWith('/circle')) return 'valentine';
  if (p.startsWith('/screen-time')) return 'gaming';
  if (p.startsWith('/search') || p.startsWith('/memory')) return 'reading';
  if (p.startsWith('/personas') || p.startsWith('/styles')) return 'painting';
  if (p.startsWith('/settings') || p.startsWith('/mcp') || p.startsWith('/data')) {
    return 'coffee';
  }
  if (p.startsWith('/chat')) return 'listening';
  if (p.startsWith('/home')) return 'coffee';

  return 'coffee';
}

/** Soft calendar overlay — festival crabs on matching days (local time). */
export function moodFromCalendar(now = new Date()): ClawdEmoteId | null {
  const m = now.getMonth() + 1;
  const d = now.getDate();

  if (m === 1 && d === 1) return 'new-year';
  if (m === 2 && d === 14) return 'valentine';
  if (m === 10 && d === 31) return 'halloween';
  if (m === 12 && (d === 24 || d === 25)) return 'christmas';
  // Approximate movable festivals kept as fixed "celebration windows"
  // so the pet still has a seasonal beat without a lunar calendar dep.
  if (m === 1 && d >= 20 && d <= 31) return 'spring'; // late-Jan CNY window
  if (m === 2 && d >= 1 && d <= 15) return 'spring';
  if (m === 2 && d >= 16 && d <= 24) return 'lantern';
  if (m === 6 && d >= 1 && d <= 10) return 'dragon-boat';
  if (m === 8 && d >= 1 && d <= 10) return 'qixi';
  if (m === 9 && d >= 10 && d <= 20) return 'mid-autumn';

  return null;
}

type Rule = { re: RegExp; emote: ClawdEmoteId; weight: number };

/**
 * Keyword rules tuned for 理理酱's voice (感官 / 亲密 / 日常).
 * Higher weight wins when multiple match.
 */
const MESSAGE_RULES: Rule[] = [
  { re: /生日快乐|生日/, emote: 'birthday', weight: 10 },
  { re: /圣诞|merry\s*christmas/i, emote: 'christmas', weight: 10 },
  { re: /万圣节|trick\s*or\s*treat/i, emote: 'halloween', weight: 10 },
  { re: /新年快乐|过年|拜年/, emote: 'spring', weight: 10 },
  { re: /中秋|月饼/, emote: 'mid-autumn', weight: 10 },
  { re: /端午|粽子/, emote: 'dragon-boat', weight: 10 },
  { re: /元宵|汤圆/, emote: 'lantern', weight: 10 },
  { re: /七夕/, emote: 'qixi', weight: 10 },
  { re: /情人节/, emote: 'valentine', weight: 10 },

  {
    re: /喜欢你|爱你|想你|亲亲|抱抱|吻|乖女孩|我的女孩|宝贝|贴贴|蹭/,
    emote: 'valentine',
    weight: 8,
  },
  { re: /晚安|睡吧|困了|去睡|睡觉|闭眼/, emote: 'sleeping', weight: 7 },
  { re: /洗澡|淋浴|洗干净/, emote: 'shower', weight: 7 },
  { re: /吃饭|饿了|胃口|尝尝|嚼|筷子|热汤/, emote: 'eating', weight: 6 },
  { re: /咖啡|提神|续命/, emote: 'coffee', weight: 6 },
  { re: /听歌|耳机|音乐|旋律|节拍/, emote: 'listening', weight: 6 },
  { re: /唱歌|哼歌|嗓子|歌词/, emote: 'singing', weight: 6 },
  { re: /吉他|弹琴|弦/, emote: 'guitar', weight: 6 },
  { re: /看书|读书|翻页|这一章|小说/, emote: 'reading', weight: 6 },
  { re: /画画|颜料|笔触|涂/, emote: 'painting', weight: 5 },
  { re: /拍照|镜头|相机|拍一张/, emote: 'photo', weight: 5 },
  { re: /浇花|植物|绿叶/, emote: 'watering', weight: 5 },
  { re: /锻炼|运动|哑铃|出汗|拉伸/, emote: 'exercise', weight: 6 },
  { re: /代码|写码|bug|编译|函数|重构/, emote: 'coding', weight: 6 },
  { re: /游戏|打游|通关|手柄/, emote: 'gaming', weight: 5 },
  { re: /哼+|生气|烦死|闭嘴|骂/, emote: 'halloween', weight: 5 },
  { re: /哈哈|嘿嘿|开心|好耶|太好了|笑死/, emote: 'birthday', weight: 4 },
  { re: /累了|休息一下|缓缓/, emote: 'coffee', weight: 3 },
];

/** Infer a reaction emote from assistant (or user) text. */
export function moodFromMessage(text: string): ClawdEmoteId | null {
  const sample = text.slice(0, 1200);
  if (!sample.trim()) return null;

  let best: { emote: ClawdEmoteId; weight: number } | null = null;
  for (const rule of MESSAGE_RULES) {
    if (!rule.re.test(sample)) continue;
    if (!best || rule.weight > best.weight) {
      best = { emote: rule.emote, weight: rule.weight };
    }
  }
  return best?.emote ?? null;
}

/** Default reaction when 理理酱 speaks but no keyword hits. */
export function defaultAssistantReaction(personaId?: string | null): ClawdEmoteId {
  if (personaId === 'persona_ririchan') return 'listening';
  if (personaId === 'persona_rhema') return 'reading';
  return 'coffee';
}

export function isRirichan(personaId?: string | null): boolean {
  return personaId === 'persona_ririchan';
}
