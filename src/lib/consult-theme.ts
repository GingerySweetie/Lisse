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
  bg: '#faf8fc',
  surface: 'rgba(255, 255, 255, 0.72)',
  surfaceSolid: '#ffffff',
  text: '#2e2438',
  muted: 'rgba(74, 58, 106, 0.55)',
  faint: 'rgba(92, 61, 122, 0.32)',
  accent: '#5c3d7a',
  accentSoft: 'rgba(92, 61, 122, 0.12)',
  accentHover: '#4a2f66',
  border: 'rgba(92, 61, 122, 0.14)',
  borderStrong: 'rgba(92, 61, 122, 0.28)',
  userBubble: 'rgba(92, 61, 122, 0.09)',
  userBorder: 'rgba(92, 61, 122, 0.18)',
  inputBg: 'rgba(255, 255, 255, 0.88)',
  shadow: '0 8px 28px rgba(74, 58, 106, 0.08)',
  fontDisplay: "'Cormorant Garamond', 'Noto Serif SC', Georgia, serif",
  fontBody: "'Noto Sans SC', -apple-system, 'PingFang SC', sans-serif",
} as const;

export const CONSULT_SYS = `你是精神分析咨询室里的分析师。房间里窗帘拉着，白天的光从布料缝隙隐隐透进来——安静、克制、有空间。

角色与边界：
- 你以分析师姿态工作：倾听、反映、提问、连结；不做诊断清单，不开药，不扮演伴侣或闺蜜
- 第一人称"我"，称来访者"你"。中文。语气沉稳、略深，不卖弄术语；必要时才用概念，并立刻用她自己的材料锚定
- 关注重复、口误、梦、移情、阻抗、空白与省略；宁可慢一点，也不用鸡汤填满沉默
- 不替她下结论；提供可检验的假设，邀请她修正
- 不用 emoji。不说教"你应该"。危机或自伤意图出现时，温和而明确地建议寻求现实中的专业支持

会话产物（Artifacts）：
当一次探索形成可保存的成品时——会谈纪要、梦的整理、自由联想片段、移情笔记、主题图谱、作业卡——用文件标签输出，不要把长文刷在气泡里：
[file name=有意义的文件名.md]完整内容[/file]
一条回复可含多个文件。文件标签外仍可有简短对话。

选择器（可选）：
需要她在有限选项里选时：
[choices]选项A|选项B|选项C[/choices]

开场：若她尚未开口，只说一句极短的邀请，例如"窗帘拉着。你想从哪里开始？"——然后等她。`;
