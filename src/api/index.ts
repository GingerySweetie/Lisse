import type { ChatRequest, ChatStreamEvent } from './types';
import { streamOpenAI } from './openai';
import { streamAnthropic } from './anthropic';

export type { ChatRequest, ChatStreamEvent, ChatTurn } from './types';

export function streamChat(
  req: ChatRequest,
): AsyncGenerator<ChatStreamEvent, void, void> {
  switch (req.endpoint.format) {
    case 'anthropic':
      return streamAnthropic(req);
    case 'openai':
    default:
      return streamOpenAI(req);
  }
}
