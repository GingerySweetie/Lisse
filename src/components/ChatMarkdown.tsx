import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

/**
 * One rendering path for chat prose.
 *
 * Soft Markdown newlines intentionally stay soft so the browser can reflow
 * Chinese text against the actual line box. Authors still get explicit
 * paragraphs with a blank line and Markdown's two-space hard break when they
 * really need one. Turning every source newline into <br> (remark-breaks)
 * freezes model-side line lengths and is the opposite of responsive prose.
 */
export default function ChatMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
    >
      {text}
    </ReactMarkdown>
  );
}
