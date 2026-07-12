import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code2, Download, ExternalLink, FileText, Globe, X } from 'lucide-react';
import type { Artifact } from '../types';
import { saveFile } from '../lib/save-file';

// ─── Icon helpers ────────────────────────────────────────────────────────────

function artifactIcon(mime: string) {
  if (mime === 'text/html' || mime === 'image/svg+xml') return Globe;
  if (mime === 'text/markdown') return FileText;
  return Code2;
}

function artifactLabel(mime: string): string {
  if (mime === 'text/html') return 'HTML';
  if (mime === 'image/svg+xml') return 'SVG';
  if (mime === 'text/markdown') return 'Markdown';
  if (mime === 'text/css') return 'CSS';
  if (mime === 'application/json') return 'JSON';
  if (mime === 'text/javascript' || mime === 'text/typescript') return '代码';
  return '文件';
}

// ─── Minimal Markdown renderer for the preview modal ────────────────────────

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```[\s\S]*?```/g, (m) => {
      const inner = m.slice(3, -3).replace(/^[^\n]*\n?/, '');
      return `<pre><code>${inner}</code></pre>`;
    })
    .replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^(?!<[hupol])(.+)$/gm, '<p>$1</p>');
}

// ─── Viewer modal ─────────────────────────────────────────────────────────────

function ArtifactViewer({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'));
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  });

  function handleClose() {
    setPhase('closing');
    window.setTimeout(onClose, 180);
  }

  function handleDownload() {
    const blob = new Blob([artifact.content], { type: artifact.mimeType + ';charset=utf-8' });
    saveFile(blob, artifact.name);
  }

  const isHtml =
    artifact.mimeType === 'text/html' || artifact.mimeType === 'image/svg+xml';
  const isMarkdown = artifact.mimeType === 'text/markdown';

  const mdSrcdoc = isMarkdown
    ? `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:-apple-system,sans-serif;line-height:1.7;padding:24px 28px;color:#2a2530;max-width:720px;margin:0 auto}
  h1,h2,h3,h4{margin:1.2em 0 0.4em;color:#1a1520}
  code{background:#f0ecf6;padding:1px 5px;border-radius:4px;font-size:.88em}
  pre{background:#f0ecf6;padding:12px;border-radius:8px;overflow-x:auto}
  pre code{background:none;padding:0}
  a{color:#6f5990}
  ul{padding-left:1.4em}
  li{margin:.25em 0}
  p{margin:.6em 0}
</style></head><body>${renderMarkdown(artifact.content)}</body></html>`
    : '';

  return createPortal(
    <div
      className={`artifact-viewer-backdrop ${phase === 'open' ? 'is-open' : ''}`}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={`artifact-viewer-window ${phase === 'open' ? 'is-open' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={artifact.name}
      >
        <div className="artifact-viewer-bar">
          <span className="artifact-viewer-title">{artifact.name}</span>
          <div className="artifact-viewer-actions">
            <button
              type="button"
              className="artifact-viewer-btn"
              onClick={handleDownload}
              title="下载文件"
            >
              <Download size={15} />
            </button>
            {isHtml && (
              <button
                type="button"
                className="artifact-viewer-btn"
                onClick={() => {
                  const blob = new Blob([artifact.content], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank', 'noopener');
                }}
                title="在新标签页打开"
              >
                <ExternalLink size={15} />
              </button>
            )}
            <button
              type="button"
              className="artifact-viewer-btn"
              onClick={handleClose}
              title="关闭"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="artifact-viewer-body">
          {isHtml ? (
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts"
              srcDoc={artifact.content}
              title={artifact.name}
              className="artifact-iframe"
            />
          ) : isMarkdown ? (
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts"
              srcDoc={mdSrcdoc}
              title={artifact.name}
              className="artifact-iframe"
            />
          ) : (
            <pre className="artifact-pre">{artifact.content}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Card (inline bubble) ─────────────────────────────────────────────────────

export default function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false);
  const Icon = artifactIcon(artifact.mimeType);
  const label = artifactLabel(artifact.mimeType);

  return (
    <>
      <button
        type="button"
        className="artifact-card"
        onClick={() => setOpen(true)}
      >
        <span className="artifact-card-icon">
          <Icon size={16} />
        </span>
        <span className="artifact-card-info">
          <span className="artifact-card-name">{artifact.name}</span>
          <span className="artifact-card-meta">{label} · 点击预览</span>
        </span>
      </button>
      {open && (
        <ArtifactViewer artifact={artifact} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
