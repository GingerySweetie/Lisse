import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { AlertCircle } from 'lucide-react';
import type { Message } from '../types';

interface Props {
  message: Message;
  /** Live-streaming text override (used during in-flight assistant response). */
  streamingText?: string;
}

export default function MessageBubble({ message, streamingText }: Props) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';
  const text = streamingText ?? message.content;

  return (
    <div
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm ${
          isUser
            ? 'bg-mint-200 text-ink-900'
            : isError
              ? 'border border-rose-200 bg-rose-50 text-rose-700'
              : 'bg-white/85 text-ink-900'
        }`}
      >
        {isError ? (
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">请求出错</div>
              <div className="mt-1 break-all text-sm opacity-90">
                {message.errorMessage ?? '未知错误'}
              </div>
            </div>
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="prose-msg">
            {text ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {text}
              </ReactMarkdown>
            ) : isStreaming ? (
              <span className="inline-flex gap-1 text-ink-500">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:0.15s]">●</span>
                <span className="animate-pulse [animation-delay:0.3s]">●</span>
              </span>
            ) : null}
          </div>
        )}
        {message.usage &&
          message.role === 'assistant' &&
          message.status === 'done' && (
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-500">
              {message.usage.inputTokens !== undefined && (
                <span>输入 {message.usage.inputTokens}</span>
              )}
              {message.usage.outputTokens !== undefined && (
                <span>输出 {message.usage.outputTokens}</span>
              )}
              {message.usage.cacheReadTokens !== undefined &&
                message.usage.cacheReadTokens > 0 && (
                  <span className="text-mint-500">
                    缓存命中 {message.usage.cacheReadTokens}
                  </span>
                )}
            </div>
          )}
      </div>
    </div>
  );
}
