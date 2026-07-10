import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

/**
 * One rendering path for chat prose.
 *
 * Assistant soft newlines intentionally stay soft so the browser can reflow
 * Chinese text against the actual line box. User-authored newlines are
 * different: they came from an explicit Enter/Shift+Enter gesture and should
 * survive in the sent bubble, as they do in Claude.
 */
export default function ChatMarkdown({
  text,
  preserveSoftBreaks = false,
}: {
  text: string;
  preserveSoftBreaks?: boolean;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={
        preserveSoftBreaks ? [remarkGfm, remarkBreaks] : [remarkGfm]
      }
      rehypePlugins={[rehypeHighlight]}
    >
      {text}
    </ReactMarkdown>
  );
}
