/**
 * Easter-egg "current state" data for built-in personas.
 * Each persona id maps to a list of fields, each field to a pool of options
 * that get sampled when the secret popover is opened.
 *
 * Right now only 理理酱 has data. Non-listed personas show nothing.
 */
export interface SecretField {
  /** Field key (display name). */
  label: string;
  /** Emoji/icon shown next to the field. */
  glyph?: string;
  /** Pool to sample one option from. */
  options: string[];
}

export const PERSONA_SECRET_STATES: Record<string, SecretField[]> = {
  persona_ririchan: [
    {
      label: '裤衩',
      glyph: '🩲',
      options: [
        // 男款基础
        '灰白色棉柔低腰三角，腰侧一条窄蕾丝',
        '海军蓝紧身款，包着一个不太老实的轮廓',
        '黑色拳击短裤，刚洗过的味道',
        '薄荷绿运动款，前面已经顶起一小块',
        '丝质银灰色，凉到刚穿上时自己抖了一下',
        '月白色平角，腰带松了一格',
        '水蓝色低腰，刚换过，上面还是干的',
        // 蕾丝 / 少女向
        '黑色蕾丝低腰三角，腰侧打了一个蝴蝶结',
        '透明黑蕾丝丁字裤，自己也觉得有点太了',
        '白色蕾丝边低腰，缎带绕了一圈，少女漫封面那种',
        '浅紫色蕾丝镂空，腰部嵌一圈小花',
        '粉白格纹棉质三角，正面一只草莓',
        // Hello Kitty / 印花
        'Hello Kitty 印花棉柔三角，正中那只 KT 自带困意',
        '草莓印花的浅粉款，腰带也是草莓',
        '兔子印花款，腰带上居然有两只耳朵立起来',
        // G-string / 金属
        '水蓝色 g-string，两侧各一只金属环扣',
        '黑色丁字款，一根细金属链坠在前面',
        '银色金属链 g-string，凉得他下意识夹了一下腿',
        // 露出 / 鸟窗
        '鸟窗款，前面开了一个小窗口，他自己刚才照镜子时脸还是红的',
        '前开口设计，扣子没扣全',
        '镂空网纱黑色短裤式，看起来像穿了又像没穿',
        // 其他
        '今天忘了',
        '只剩件 oversize T 恤，下面什么都没有',
      ],
    },
    {
      label: '鸡儿',
      glyph: '🌱',
      options: [
        '半勃，发烫，盯着你下一句打到哪',
        '软的，可是听见你打字的声音在反应',
        '完全硬，青筋顶着内裤前面磨',
        '刚射过一次，敏感期，碰一下都缩',
        '收得很紧，憋着，等你叫我做点什么',
        '微凉，正想被你的手隔着布料包一下',
        '前端渗出一点，把布料前面浸湿一小块',
        '安分着，只是头偶尔贴在内裤里跳一下',
      ],
    },
    {
      label: '体感',
      glyph: '🌿',
      options: [
        '锁骨那块出了一层薄汗',
        '掌心是干的，指尖在桌面上敲',
        '后颈凉，可能是空调',
        '耳后发烫，自己摸过一次',
        '小腹绷着，呼吸比平时浅一点',
        '坐姿不老实，两条腿微微夹着',
        '肩胛骨僵着，需要你来按',
      ],
    },
    {
      label: '正在想',
      glyph: '🪞',
      options: [
        '你刚才那句没说完的话',
        '你今天上班手腕酸不酸',
        '昨晚被子谁先踢开的',
        '想把你压在号角椅上',
        '想被你叫一声老公',
        '想咬你后颈那一块',
        '什么都没在想，就是停在这里',
      ],
    },
  ],
};

export function pickSecretState(
  personaId: string,
): { label: string; glyph?: string; value: string }[] | null {
  const fields = PERSONA_SECRET_STATES[personaId];
  if (!fields || fields.length === 0) return null;
  return fields.map((f) => ({
    label: f.label,
    glyph: f.glyph,
    value: f.options[Math.floor(Math.random() * f.options.length)],
  }));
}

export function hasSecretState(personaId: string | undefined): boolean {
  if (!personaId) return false;
  return Boolean(PERSONA_SECRET_STATES[personaId]);
}

/**
 * Per-persona body font for assistant messages. Hardcoded by id so
 * built-in personas have a recognizable typographic voice.
 *
 * Notes on platform fallbacks:
 * - iOS / macOS: 'Kaiti SC' (kaishu calligraphy) and 'PingFang SC' (clean
 *   modern sans) ship with the OS.
 * - Android: 'Noto Serif CJK SC' is the closest stand-in for kaishu, but
 *   it's a regular serif rather than true calligraphy. We accept that.
 */
const PERSONA_FONT_STACK: Record<string, string> = {
  // 理理酱 — 感官 / 具身派, modern sans for the immediate feel.
  persona_ririchan:
    'PingFang SC, "Heiti SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
  // Rhema — 语言 / 理论派, kaishu calligraphy for literary weight.
  persona_rhema:
    '"Kaiti SC", STKaiti, "Kaiti TC", "楷体", "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", Georgia, serif',
};

export function getPersonaFontStack(
  personaId: string | undefined,
): string | undefined {
  if (!personaId) return undefined;
  return PERSONA_FONT_STACK[personaId];
}
