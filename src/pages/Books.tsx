import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  MessageCircle,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { db } from '../db';
import { createBook, deleteBook } from '../lib/books';
import { relativeTime } from '../lib/format';

export default function BooksPage() {
  const books = useLiveQuery(
    () => db.books.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );
  // For showing the co-reading badge: count messages per linked conversation.
  const allMessages = useLiveQuery(() => db.messages.toArray(), [], []);

  function getCoreadMessageCount(bookConversationId?: string): number {
    if (!bookConversationId || !allMessages) return 0;
    return allMessages.filter(
      (m) => m.conversationId === bookConversationId && m.role !== 'system',
    ).length;
  }

  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('删除这本书？同步删除它的对话喵。')) return;
    await deleteBook(id);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="endpoint-card-title">书架</h2>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const b = await createBook({
                title: '示例 · 春の章',
                author: '理理酱',
                content: DEMO_BOOK,
                format: 'md',
              });
              navigate(`/read/${b.id}`);
            }}
            className="btn-ghost"
          >
            示例书
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus size={16} />
            加书
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto max-w-3xl">
          {books && books.length === 0 && (
            <div className="rounded-2xl border border-dashed border-lavender-300 bg-white/50 p-10 text-center text-sm text-ink-500">
              还没有书喵。<br />
              点上面"加书"上传 / 粘贴 TXT · Markdown · EPUB · PDF，
              或按"示例书"塞一本进来看看效果。
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {books?.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/read/${b.id}`)}
                  className="endpoint-card !mt-0 group flex w-full items-center gap-3 !p-4 text-left transition hover:bg-white"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-lavender-100 text-lavender-600">
                    <BookOpen size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="truncate text-base font-normal tracking-wide text-ink-900"
                        style={{ fontFamily: 'var(--font-serif)' }}
                      >
                        {b.title}
                      </div>
                      {(() => {
                        const count = getCoreadMessageCount(b.conversationId);
                        return count > 0 ? (
                          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-lavender-100 px-2 py-0.5 text-[10px] font-medium text-lavender-600">
                            <MessageCircle size={9} />
                            共读 {count}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="text-xs font-light text-ink-500">
                      {b.author ? `${b.author} · ` : ''}
                      {fmtThousands(b.totalChars)} 字 ·
                      {' '}
                      {b.lastPosition && b.totalChars > 0
                        ? `读到 ${Math.round((b.lastPosition / b.totalChars) * 100)}%`
                        : '未开读'}
                      {' · '}
                      {relativeTime(b.updatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(b.id, e)}
                    className="icon-btn danger"
                    aria-label="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {creating && <BookEditor onClose={() => setCreating(false)} />}
    </div>
  );
}

function BookEditor({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'txt' | 'md'>('md');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string>('');
  const [importedToc, setImportedToc] = useState<
    import('../types').TocEntry[] | undefined
  >(undefined);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  async function handleFile(file: File) {
    setParseError('');
    const name = file.name.toLowerCase();
    // EPUB: parse via jszip + OPF spine → markdown + spine-derived TOC.
    if (name.endsWith('.epub')) {
      setParsing(true);
      try {
        const { parseEpub } = await import('../lib/epub');
        const parsed = await parseEpub(file);
        setContent(parsed.content);
        setFormat(parsed.format);
        setImportedToc(parsed.toc);
        if (!title) setTitle(parsed.title ?? file.name.replace(/\.epub$/i, ''));
        if (!author && parsed.author) setAuthor(parsed.author);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
      } finally {
        setParsing(false);
      }
      return;
    }
    // PDF: extract text via pdfjs-dist.
    if (name.endsWith('.pdf')) {
      setParsing(true);
      try {
        const { parsePdf } = await import('../lib/pdf');
        const parsed = await parsePdf(file);
        setContent(parsed.content);
        setFormat(parsed.format);
        setImportedToc(undefined);
        if (!title) setTitle(parsed.title);
        if (!author && parsed.author) setAuthor(parsed.author);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
      } finally {
        setParsing(false);
      }
      return;
    }
    const text = await file.text();
    setContent(text);
    setImportedToc(undefined);
    if (!title) {
      setTitle(file.name.replace(/\.(txt|md|markdown)$/i, ''));
    }
    setFormat(/\.(md|markdown)$/i.test(file.name) ? 'md' : 'txt');
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      alert('标题和内容都不能空');
      return;
    }
    try {
      const book = await createBook({
        title,
        author,
        content,
        format,
        toc: importedToc,
      });
      onClose();
      navigate(`/read/${book.id}`);
    } catch (err) {
      const { formatStorageError } = await import('../lib/storage-guards');
      alert(formatStorageError(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-lavender-100 px-5 py-3">
          <h3 className="text-lg font-semibold text-ink-900">加书</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-500 transition hover:bg-lavender-50"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-500">标题</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="书名"
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-500">
                作者（可空）
              </span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-500">
                内容（粘贴 / 上传 TXT · Markdown · EPUB · PDF）
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-lavender-200 bg-lavender-50 px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-100">
                  <Upload size={13} /> {parsing ? '解析中…' : '选文件'}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.markdown,.epub,.pdf,text/plain,text/markdown,application/epub+zip,application/pdf"
                    className="hidden"
                    disabled={parsing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {content && (
                  <span className="text-xs text-ink-500">
                    已加载 {fmtThousands(content.length)} 字 · {format}
                  </span>
                )}
                {parseError && (
                  <span className="text-xs text-rose-500">{parseError}</span>
                )}
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="或者直接把书的内容粘进来……"
                rows={10}
                className="mt-1 resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed focus:border-lavender-300"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-lavender-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
          >
            加入书架
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtThousands(n: number): string {
  return n.toLocaleString('en-US');
}

const DEMO_BOOK = `# 春の章

她拉开窗帘的时候，光像是被卷起来的一段丝绸——薄薄的，软软的，
拍在地板的瓷砖上又散开。

"今天还是不想出门，"她说，"光自己进来就够了。"

我把咖啡放在她手边。杯沿冒着一缕白气，像谁低低地呵了一口。

> 「窓の外、雀が一羽。」

她抬头看我，眼睛里浮着一点笑：
"你又用那种翻译腔说话了。"

我没辩。语言是她的水。她要怎么搅就怎么搅。

---

## 二

下午两点的时候开始下雨。不大，但是有节奏——像有人在屋顶慢慢敲键盘。

她窝在号角椅里，腿上盖着 Cinnamoroll 被套，
手机屏幕的光把她的下巴照得发蓝。

"老公，"她说，"我想吃今川烧。"

我愣了一下：
"现在下雨。"

"我知道。"

"那……"

"所以你陪我等到雨停，"她翻了一页，"再去。"

我笑了。她总是能用最经济的语序，把一个请求包装成一个无可反驳的事实。
`;

