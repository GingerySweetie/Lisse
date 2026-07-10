/**
 * 炼金工房 · UI 美化方案审查
 *
 * 分析 UI 相关文件（CSS、JSX/TSX、HTML）并给出美化建议和评分。
 */

import type { ChatTurn } from '../../api/types';
import { streamChat } from '../../api';
import type { Endpoint } from '../../types';

export interface BeautyScore {
  overall: number;
  colors: number;
  typography: number;
  spacing: number;
  consistency: number;
  accessibility: number;
}

export interface BeautyIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  file?: string;
  line?: number;
  category: 'color' | 'typography' | 'spacing' | 'accessibility' | 'consistency' | 'other';
  message: string;
  fix?: string;
}

export interface BeautyReport {
  score: BeautyScore;
  issues: BeautyIssue[];
  summary: string;
  highlights: string[];
  model: string;
  tokensUsed: number;
}

const BEAUTY_SYSTEM_PROMPT = `你是一个专业的 UI/UX 审查专家，代号「美化炼金师」。

你的任务是审查代码中的 UI 实现，评估其美观性和用户体验质量，并给出具体的改进建议。

## 评分维度（每项 0-10 分）
- **色彩 (colors)**: 配色方案是否和谐、品牌感是否统一、深色/浅色模式处理
- **排版 (typography)**: 字体选择、字号层级、行高、字重是否合理
- **间距 (spacing)**: padding/margin 是否一致、留白是否充足、元素密度是否舒适
- **一致性 (consistency)**: 组件风格是否统一、设计 token 使用是否规范
- **可访问性 (accessibility)**: 对比度是否足够、交互反馈是否清晰、ARIA 属性

## 输出格式
必须以下面的 JSON 格式输出，不要有任何额外文字：

\`\`\`json
{
  "score": {
    "overall": 7,
    "colors": 8,
    "typography": 6,
    "spacing": 7,
    "consistency": 7,
    "accessibility": 6
  },
  "issues": [
    {
      "severity": "warning",
      "file": "src/components/Button.tsx",
      "category": "color",
      "message": "主按钮颜色 #2563eb 在白色背景上的对比度约 4.5:1，刚好达到 AA 标准但未达到 AAA",
      "fix": "将颜色调整为 #1d4ed8 可将对比度提升到 7:1（AAA 级别）"
    }
  ],
  "summary": "整体 UI 设计中规中矩，色彩体系较清晰但排版层级不够明显。间距使用基本一致但部分卡片内边距偏小（8px）。建议建立统一的设计 token 系统。",
  "highlights": [
    "✅ 色彩系统已有基本规范，primary/secondary 颜色定义清晰",
    "✅ 使用了 Tailwind CSS，天然有间距一致性",
    "⚠️ 部分文字对比度偏低，建议检查灰色文字",
    "⚠️ 缺少 focus-visible 样式，键盘用户体验较差"
  ]
}
\`\`\``;

const UI_FILE_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.jsx',
  '.tsx',
  '.html',
  '.vue',
  '.svelte',
]);

/** 判断是否是 UI 相关文件 */
export function isUiFile(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return UI_FILE_EXTENSIONS.has(ext);
}

/** 从文件内容中提取 UI 相关信息（限制 token 数量） */
function extractUiSnippets(
  files: Map<string, string>,
  maxChars = 20_000,
): string {
  const parts: string[] = [];
  let total = 0;

  // 优先处理 CSS / style 文件
  for (const [path, content] of files) {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (['.css', '.scss', '.sass'].includes(ext)) {
      const snippet = content.slice(0, 3000);
      parts.push(`### ${path}\n\`\`\`${ext.slice(1)}\n${snippet}\n\`\`\``);
      total += snippet.length;
      if (total >= maxChars) break;
    }
  }

  // 然后处理组件文件
  for (const [path, content] of files) {
    if (total >= maxChars) break;
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (['.jsx', '.tsx', '.vue', '.svelte'].includes(ext)) {
      const snippet = content.slice(0, 2000);
      parts.push(`### ${path}\n\`\`\`${ext.slice(1)}\n${snippet}\n\`\`\``);
      total += snippet.length;
    }
  }

  return parts.join('\n\n');
}

/** 运行 UI 美化审查 */
export async function runBeautyReview(opts: {
  endpoint: Endpoint;
  model: string;
  files: Map<string, string>;
  stagedChanges?: Map<string, { content: string; reason: string }>;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<BeautyReport> {
  const { endpoint, model, files, stagedChanges, signal, onDelta } = opts;

  // 合并原文件和暂存变更
  const allFiles = new Map(files);
  if (stagedChanges) {
    for (const [path, change] of stagedChanges) {
      allFiles.set(path, change.content);
    }
  }

  // 只取 UI 相关文件
  const uiFiles = new Map<string, string>();
  for (const [path, content] of allFiles) {
    if (isUiFile(path)) {
      uiFiles.set(path, content);
    }
  }

  if (uiFiles.size === 0) {
    return {
      score: { overall: 0, colors: 0, typography: 0, spacing: 0, consistency: 0, accessibility: 0 },
      issues: [],
      summary: '没有找到 UI 相关文件（CSS、JSX/TSX、Vue 等）',
      highlights: [],
      model,
      tokensUsed: 0,
    };
  }

  const uiSnippets = extractUiSnippets(uiFiles);
  const changedPaths = stagedChanges ? Array.from(stagedChanges.keys()).join(', ') : '';

  const userMessage = `请审查以下 UI 代码${changedPaths ? `（重点关注这次变更: ${changedPaths}）` : ''}：

${uiSnippets}

请给出详细的美化审查报告，严格按照指定 JSON 格式输出。`;

  const turns: ChatTurn[] = [
    { role: 'system', content: BEAUTY_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  let fullText = '';
  let tokensUsed = 0;

  for await (const evt of streamChat({ endpoint, model, messages: turns, signal })) {
    if (evt.type === 'delta' && evt.delta) {
      fullText += evt.delta;
      onDelta?.(evt.delta);
    } else if (evt.type === 'done' && evt.usage) {
      tokensUsed = (evt.usage.inputTokens ?? 0) + (evt.usage.outputTokens ?? 0);
    }
  }

  // 解析 JSON
  try {
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/) ??
      fullText.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error('no JSON found');
    const parsed = JSON.parse(jsonMatch[1]);
    return {
      score: parsed.score ?? { overall: 5, colors: 5, typography: 5, spacing: 5, consistency: 5, accessibility: 5 },
      issues: parsed.issues ?? [],
      summary: parsed.summary ?? '',
      highlights: parsed.highlights ?? [],
      model,
      tokensUsed,
    };
  } catch {
    return {
      score: { overall: 5, colors: 5, typography: 5, spacing: 5, consistency: 5, accessibility: 5 },
      issues: [],
      summary: fullText.slice(0, 500),
      highlights: [],
      model,
      tokensUsed,
    };
  }
}
