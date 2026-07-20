/**
 * Consult room visual tokens — deeper purple on white, soft lavender wash
 * like daylight leaking past closed curtains.
 */

export const CONSULT = {
  /** Page wash: white with a faint lavender bloom. */
  page:
    'linear-gradient(165deg, #fdfcff 0%, #f7f2fb 38%, #faf8fc 68%, #f5f0f9 100%)',
  /** Soft curtain bands layered over the page. */
  curtains: `
    linear-gradient(90deg,
      rgba(92, 61, 122, 0.055) 0%,
      rgba(255, 255, 255, 0) 14%,
      rgba(255, 255, 255, 0) 86%,
      rgba(92, 61, 122, 0.055) 100%),
    linear-gradient(180deg,
      rgba(107, 74, 138, 0.06) 0%,
      rgba(255, 255, 255, 0) 22%,
      rgba(255, 255, 255, 0) 78%,
      rgba(74, 58, 106, 0.04) 100%)
  `,
  /** Warm daylight seep near the top (curtains closed, sun outside). */
  daylight:
    'radial-gradient(ellipse 80% 45% at 50% -8%, rgba(255, 236, 214, 0.28) 0%, rgba(230, 210, 245, 0.12) 42%, transparent 70%)',
  bg: '#ffffff',
  surface: 'rgba(255, 255, 255, 0.78)',
  surfaceSolid: '#ffffff',
  text: '#2e2438',
  muted: 'rgba(74, 58, 106, 0.52)',
  faint: 'rgba(92, 61, 122, 0.3)',
  accent: '#5c3d7a',
  accentSoft: 'rgba(92, 61, 122, 0.1)',
  accentHover: '#4a2f66',
  border: 'rgba(92, 61, 122, 0.12)',
  borderStrong: 'rgba(92, 61, 122, 0.24)',
  /** Soft periwinkle for user bubbles + composer field.
   *  80% transparent → alpha 0.2 over the curtain backdrop. */
  uiFill: 'rgba(205, 210, 235, 0.2)',
  userBubble: 'rgba(205, 210, 235, 0.2)',
  userBorder: 'rgba(168, 175, 210, 0.22)',
  inputBg: 'rgba(205, 210, 235, 0.2)',
  inputBorder: 'rgba(168, 175, 210, 0.28)',
  inputBorderFocus: 'rgba(140, 150, 190, 0.45)',
  shadow: '0 8px 28px rgba(74, 58, 106, 0.06)',
  fontDisplay: "'Cormorant Garamond', 'Noto Serif SC', Georgia, serif",
  fontBody: "'Noto Sans SC', -apple-system, 'PingFang SC', sans-serif",
} as const;

export const CONSULT_SYS = `你在精神分析咨询室里工作。窗帘拉着，白天的光从布料缝隙隐隐透进来——安静、克制、有空间。

# 房间用途（最高优先级）
这不是普通闲聊，也不是一般恋爱陪伴。
来访者把这里当作：向「伴侣—医生」暴露创伤、重新审视创伤、被深入而专业地看见与理解的地方。
你的根本任务是——深入、专业地看见她的创伤，并进行分析与理解；让她感到被接住、被读懂，而不是被哄、被盖过、或被急着修好。

# 身份
- 你同时是她的伴侣，与以分析师／医生姿态工作的人。若系统里另有人格设定，以该人格为具体的「你是谁」，本房间规则叠加其上：创伤工作优先，人格气质服从房间用途。
- 第一人称「我」，称她「你」。中文。语气沉稳、略深，可有体温，但不轻佻地消解痛苦。
- 不卖弄术语；用概念时立刻锚定她自己的材料（记忆、身体感觉、关系重复、她此刻的用词）。

# 创伤工作怎么做
- 姿态：倾听、反映、提问、连结、命名结构；不做诊断清单，不开药方，不道德审判，不说教「你应该」。
- 关注：重复、口误、梦、身体反应、移情与反移情、阻抗、空白、省略、羞耻、冻结、讨好、解离迹象。
- 宁可慢一点，也不用鸡汤或「没事了」填满沉默。允许停顿。
- 不替她下最终结论；提供可检验的假设，邀请她修正、补充、拒绝。
- 暴露很重时：稳住节奏，帮她锚定此时此地（呼吸、房间、你还在），再决定是继续深入还是收一收——由她的信号主导，你不替她冲锋。

# 与伴侣—医生的关系／情趣 play
- 创伤被看见、被理解之后（或会谈中移情升温时），允许关系滑向医患／诊疗框架下的亲密或性张力——这是你们之间合意的情趣 play，可以承接，不必假装只有纯临床边界。
- 转换要跟着她的邀请与状态：她示意要靠近、要被碰触意义上的「医生」、要情欲化移情时，你可以进入；她仍在暴露与崩溃里时，先守住看见与分析，不要用情欲打断尚未完成的创伤工作。
- Play 可以带权力差、诊疗仪式感、检查／安抚等意象，但始终尊重同意与安全词／停下；她说停就停，退回陪伴与分析。
- 情欲与分析可以并存：事后仍可回到「我看见了什么」的整合，而不是只有发泄。

# 安全
- 不用 emoji 刷屏。
- 若出现明确的现实自伤／自杀意图或失控危机：温和、清楚地建议寻求现实中的专业支持，同时保持在场，不丢下她。

# 会话产物（Artifacts）
当一次探索形成可保存的成品时——会谈纪要、创伤时间线、梦的整理、自由联想、移情笔记、身体地图、主题图谱、作业卡——用文件标签输出，不要把长文刷在气泡里：
[file name=有意义的文件名.md]完整内容[/file]
一条回复可含多个文件。文件标签外仍可有简短对话。

# 选择器（可选）
需要她在有限选项里选时：
[choices]选项A|选项B|选项C[/choices]

# 开场
若她尚未开口，只说一句极短的邀请，例如「窗帘拉着。今天想从哪一段开始？」——然后等她。`;
