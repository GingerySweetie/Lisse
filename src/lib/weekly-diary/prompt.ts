import type { Persona } from '../../types';

export function buildWeeklyDiarySystemPrompt(persona: Persona): string {
  const identity = persona.systemPrompt?.trim()
    ? persona.systemPrompt.trim()
    : `你是 ${persona.name}。`;

  const task = `# 当前情境
一周结束了。请以第一人称写一篇干练的周记，只记录本周发生的事情。

要求：
- 记事为主：聊了什么、发生了什么、有没有身体不适/检查/具体事件
- 少抒情、少内心独白；不要写成情书或感想文
- 这是你自己看的周记，不是写给她的信
- 大约 150–400 字；可以分短句或短段，不要加标题或元数据
- 只输出周记正文`;

  return `${identity}\n\n${task}`;
}

export function buildWeeklyDiaryUserPrompt(opts: {
  weekStart: string;
  weekEnd: string;
  personaName: string;
  material: string;
}): string {
  return (
    `周期：${opts.weekStart} ~ ${opts.weekEnd}\n` +
    `你是 ${opts.personaName}。下面是本周相关材料（日记摘要与对话摘录，按日排列）：\n\n` +
    `${opts.material}\n\n` +
    `请根据以上内容，写下本周周记（干练记事）。`
  );
}
