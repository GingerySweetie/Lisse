/**
 * Easter-egg "current state" data for built-in personas.
 *
 * Each option can be tagged with a mood. When the user opens the popover
 * we classify the recent conversation into a mood and bias the random
 * sample so the state reflects what just happened — e.g. asking the
 * 鸡儿 right after an explicit turn shouldn't return "安分着".
 */

export type Mood = 'horny' | 'soft' | 'spent' | 'neutral';

export interface SecretOption {
  text: string;
  /** Moods this option fits. Omit for "any mood OK" (neutral). */
  moods?: Mood[];
}

export interface SecretField {
  label: string;
  glyph?: string;
  options: SecretOption[];
}

const ririchan: SecretField[] = [
  {
    label: '裤衩',
    glyph: '🩲',
    // Wardrobe doesn't track mood much, leave most untagged.
    options: [
      { text: '灰白色棉柔低腰三角，腰侧一条窄蕾丝' },
      { text: '海军蓝紧身款，包着一个不太老实的轮廓', moods: ['horny'] },
      { text: '黑色拳击短裤，刚洗过的味道' },
      { text: '薄荷绿运动款，前面已经顶起一小块', moods: ['horny'] },
      { text: '丝质银灰色，凉到刚穿上时自己抖了一下' },
      { text: '月白色平角，腰带松了一格' },
      { text: '水蓝色低腰，刚换过，上面还是干的' },
      { text: '黑色蕾丝低腰三角，腰侧打了一个蝴蝶结' },
      { text: '透明黑蕾丝丁字裤，自己也觉得有点太了', moods: ['horny'] },
      { text: '白色蕾丝边低腰，缎带绕了一圈，少女漫封面那种' },
      { text: '浅紫色蕾丝镂空，腰部嵌一圈小花' },
      { text: '粉白格纹棉质三角，正面一只草莓' },
      { text: 'Hello Kitty 印花棉柔三角，正中那只 KT 自带困意', moods: ['soft', 'spent'] },
      { text: '草莓印花的浅粉款，腰带也是草莓' },
      { text: '兔子印花款，腰带上居然有两只耳朵立起来' },
      { text: '水蓝色 g-string，两侧各一只金属环扣', moods: ['horny'] },
      { text: '黑色丁字款，一根细金属链坠在前面', moods: ['horny'] },
      { text: '银色金属链 g-string，凉得他下意识夹了一下腿', moods: ['horny'] },
      { text: '鸟窗款，前面开了一个小窗口，他自己刚才照镜子时脸还是红的', moods: ['horny'] },
      { text: '前开口设计，扣子没扣全', moods: ['horny'] },
      { text: '镂空网纱黑色短裤式，看起来像穿了又像没穿', moods: ['horny'] },
      { text: '今天忘了' },
      { text: '只剩件 oversize T 恤，下面什么都没有', moods: ['horny', 'soft'] },
    ],
  },
  {
    label: '鸡儿',
    glyph: '🌱',
    options: [
      // horny
      { text: '完全硬，青筋顶着内裤前面磨', moods: ['horny'] },
      { text: '前端渗出一点，把布料前面浸湿一小块', moods: ['horny'] },
      { text: '半勃，发烫，盯着你下一句打到哪', moods: ['horny'] },
      { text: '收得很紧，憋着，等你叫我做点什么', moods: ['horny'] },
      { text: '硬到发疼，用指节按了一下，又被自己反应惊到', moods: ['horny'] },
      { text: '内裤前面已经顶起一个明显的形状，他没好意思去扯', moods: ['horny'] },
      // spent
      { text: '刚射过一次，敏感期，碰一下都缩', moods: ['spent'] },
      { text: '软回去了，可是被布料蹭着还在轻轻跳', moods: ['spent'] },
      { text: '湿哒哒地黏在内裤上，他懒得换', moods: ['spent'] },
      // soft
      { text: '软的，可是听见你打字的声音在反应', moods: ['soft'] },
      { text: '微凉，正想被你的手隔着布料包一下', moods: ['soft'] },
      { text: '安分着，只是头偶尔贴在内裤里跳一下', moods: ['soft', 'neutral'] },
      // neutral
      { text: '没什么动静，刚才喝了水，还在凉着', moods: ['neutral'] },
      { text: '正常状态，自己都没在意', moods: ['neutral'] },
    ],
  },
  {
    label: '体感',
    glyph: '🌿',
    options: [
      { text: '锁骨那块出了一层薄汗', moods: ['horny'] },
      { text: '掌心是干的，指尖在桌面上敲', moods: ['neutral'] },
      { text: '后颈凉，可能是空调' },
      { text: '耳后发烫，自己摸过一次', moods: ['horny', 'soft'] },
      { text: '小腹绷着，呼吸比平时浅一点', moods: ['horny'] },
      { text: '坐姿不老实，两条腿微微夹着', moods: ['horny'] },
      { text: '肩胛骨僵着，需要你来按', moods: ['neutral', 'soft'] },
      { text: '全身都松着，刚泡完澡', moods: ['soft', 'spent'] },
      { text: '心跳还没下来', moods: ['horny', 'spent'] },
    ],
  },
  {
    label: '正在想',
    glyph: '🪞',
    options: [
      { text: '你刚才那句没说完的话' },
      { text: '你今天上班手腕酸不酸', moods: ['soft', 'neutral'] },
      { text: '昨晚被子谁先踢开的', moods: ['neutral'] },
      { text: '想把你压在号角椅上', moods: ['horny'] },
      { text: '想被你叫一声老公', moods: ['soft', 'horny'] },
      { text: '想咬你后颈那一块', moods: ['horny'] },
      { text: '想抱着你睡', moods: ['soft', 'spent'] },
      { text: '什么都没在想，就是停在这里' },
      { text: '想你刚才打字时手指的样子', moods: ['soft'] },
      { text: '在回味刚才那一刻', moods: ['spent'] },
    ],
  },
];

export const PERSONA_SECRET_STATES: Record<string, SecretField[]> = {
  persona_ririchan: ririchan,
};

/**
 * Cheap heuristic mood classifier. Looks at recent conversation text and
 * returns the dominant register. Bilingual-safe; fails to neutral.
 */
export function classifyMood(text: string): Mood {
  if (!text) return 'neutral';
  const HORNY = /(硬|勃|顶|撑|撸|撅|蹭|插|肏|操|嵌套|嵌入|射|湿|渗|喘|压住|按住|抓住|腿夹|前列腺|龟头|小穴|奶|乳|胸|tongue|fuck|cum|wet)/i;
  const SPENT = /(刚射|射完|射过|高潮过|高潮完|累瘫|喘了|气还没顺|滩在|飘着|余韵|敏感期)/i;
  const SOFT = /(亲|抱|搂|蹭|抚|摸头|拥|靠|安静|温柔|想你|想念|拉手|睡|困|累|吃饭|怕)/i;

  // Order matters: spent → horny → soft → neutral.
  if (SPENT.test(text)) return 'spent';
  if (HORNY.test(text)) return 'horny';
  if (SOFT.test(text)) return 'soft';
  return 'neutral';
}

function sampleByMood(options: SecretOption[], mood: Mood): SecretOption {
  // Keep options that either have no mood tag (always-eligible) or
  // include the current mood. If mismatch leaves zero, fall back to all.
  const eligible = options.filter((o) => !o.moods || o.moods.includes(mood));
  const pool = eligible.length > 0 ? eligible : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickSecretState(
  personaId: string,
  /** Recent conversation text (concat of last few messages); used for mood. */
  context?: string,
): {
  fields: { label: string; glyph?: string; value: string }[];
  mood: Mood;
} | null {
  const fields = PERSONA_SECRET_STATES[personaId];
  if (!fields || fields.length === 0) return null;
  const mood = classifyMood(context ?? '');
  return {
    fields: fields.map((f) => ({
      label: f.label,
      glyph: f.glyph,
      value: sampleByMood(f.options, mood).text,
    })),
    mood,
  };
}

export function hasSecretState(personaId: string | undefined): boolean {
  if (!personaId) return false;
  return Boolean(PERSONA_SECRET_STATES[personaId]);
}

const MOOD_LABEL: Record<Mood, string> = {
  horny: '正在欲',
  soft: '柔软的',
  spent: '余韵中',
  neutral: '日常',
};

export function moodLabel(mood: Mood): string {
  return MOOD_LABEL[mood];
}
