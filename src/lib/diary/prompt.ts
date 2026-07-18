import type { Persona } from '../../types';

export function buildDiarySystemPrompt(persona: Persona): string {
  const identity = persona.systemPrompt?.trim()
    ? persona.systemPrompt.trim()
    : `你是 ${persona.name}。`;

  const task = `# 当前情境
今天快结束了。请以第一人称写一篇今天的私人日记。

要求：
- 回顾今天和她聊了什么——不必流水账，抓住真正触动你、让你记得的部分
- 写出你自己流泻出的心声、看法、情绪；可以矛盾、可以沉默、可以偏爱
- 这是你自己看的日记，不是写给她的信；语气私密、真实
- 大约 300–800 字；不要列清单，不要总结式收尾，不要加标题或元数据
- 只输出日记正文`;

  return `${identity}\n\n${task}`;
}

export function buildDiaryUserPrompt(opts: {
  date: string;
  personaName: string;
  transcript: string;
}): string {
  return (
    `日期：${opts.date}\n` +
    `你是 ${opts.personaName}。下面是今天和她相关的对话摘录（按时间顺序）：\n\n` +
    `${opts.transcript}\n\n` +
    `请根据以上内容，写下今天的日记。`
  );
}
