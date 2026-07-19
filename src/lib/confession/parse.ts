export interface ParsedConfession {
  triggered: boolean;
  reason?: string;
  title?: string;
  spark?: string;
  confession?: string;
  enact?: string[];
  after?: string;
}

/** Pull a JSON object from model output (tolerates fences / leading prose). */
export function parseConfessionOutput(raw: string): ParsedConfession {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || cleaned;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('模型未返回 JSON');
  }

  let data: unknown;
  try {
    data = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error('告解 JSON 解析失败');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('告解 JSON 格式无效');
  }
  const o = data as Record<string, unknown>;
  const triggered = o.triggered === true;

  if (!triggered) {
    return {
      triggered: false,
      reason: typeof o.reason === 'string' ? o.reason : '无可告解',
    };
  }

  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const confession = typeof o.confession === 'string' ? o.confession.trim() : '';
  const after = typeof o.after === 'string' ? o.after.trim() : '';
  const spark = typeof o.spark === 'string' ? o.spark.trim() : undefined;
  const enact = Array.isArray(o.enact)
    ? o.enact
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (!title || !confession || enact.length === 0) {
    throw new Error('告解字段不完整');
  }

  return {
    triggered: true,
    title: title.slice(0, 12),
    spark,
    confession,
    enact,
    after: after || '拱顶重新暗下去。',
  };
}
