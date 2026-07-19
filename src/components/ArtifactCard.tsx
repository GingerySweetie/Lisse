import { createElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookmarkPlus,
  Check,
  Code2,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  Globe,
  Plus,
  X,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Artifact } from '../types';
import {
  collectionsContaining,
  createCollection,
  saveArtifactToCollection,
} from '../lib/artifact-collections';
import { CONSULT } from '../lib/consult-theme';
import { db } from '../db';
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

// ─── Save-to-collection picker ───────────────────────────────────────────────

function SaveToCollectionModal({
  artifact,
  sourceConversationId,
  sourceMessageId,
  onClose,
}: {
  artifact: Artifact;
  sourceConversationId?: string;
  sourceMessageId?: string;
  onClose: () => void;
}) {
  const collections = useLiveQuery(
    () => db.artifactCollections.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );
  const [contained, setContained] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void collectionsContaining(artifact.id).then((ids) =>
      setContained(new Set(ids)),
    );
  }, [artifact.id, collections?.length]);

  async function saveTo(collectionId: string) {
    if (contained.has(collectionId) || busy) return;
    setBusy(collectionId);
    try {
      await saveArtifactToCollection({
        collectionId,
        artifact,
        sourceConversationId,
        sourceMessageId,
      });
      setContained((prev) => new Set(prev).add(collectionId));
      setToast('已收入合集');
      window.setTimeout(() => setToast(null), 1200);
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateAndSave() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy('__new__');
    try {
      const col = await createCollection({ name });
      await saveArtifactToCollection({
        collectionId: col.id,
        artifact,
        sourceConversationId,
        sourceMessageId,
      });
      setContained((prev) => new Set(prev).add(col.id));
      setNewName('');
      setCreating(false);
      setToast('已新建并收入');
      window.setTimeout(() => setToast(null), 1200);
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div
      className="artifact-viewer-backdrop is-open"
      onClick={onClose}
      role="presentation"
      style={{ alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="收入合集"
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '70vh',
          background: CONSULT.surfaceSolid,
          borderRadius: '16px 16px 0 0',
          padding: '18px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 32px rgba(74, 58, 106, 0.14)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          animation: 'consultMsgIn 0.25s ease both',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: CONSULT.fontDisplay,
                fontSize: 18,
                letterSpacing: '0.1em',
                color: CONSULT.accent,
              }}
            >
              收入合集
            </div>
            <div
              style={{
                fontSize: 11,
                color: CONSULT.faint,
                marginTop: 3,
                maxWidth: 260,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {artifact.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CONSULT.muted,
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 80,
          }}
        >
          {(collections ?? []).length === 0 && !creating && (
            <div
              style={{
                fontSize: 12,
                color: CONSULT.muted,
                padding: '16px 4px',
                textAlign: 'center',
              }}
            >
              还没有合集。先新建一个。
            </div>
          )}
          {(collections ?? []).map((c) => {
            const inIt = contained.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={inIt || busy === c.id}
                onClick={() => void saveTo(c.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 12px',
                  background: inIt ? CONSULT.accentSoft : CONSULT.bg,
                  border: `1px solid ${inIt ? CONSULT.borderStrong : CONSULT.border}`,
                  borderRadius: 8,
                  cursor: inIt ? 'default' : 'pointer',
                  textAlign: 'left',
                  opacity: busy && busy !== c.id ? 0.55 : 1,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: c.color ?? CONSULT.accent,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: CONSULT.text,
                  }}
                >
                  {c.name}
                </span>
                {inIt ? (
                  <Check size={14} color={CONSULT.accent} />
                ) : (
                  <BookmarkPlus size={14} color={CONSULT.muted} />
                )}
              </button>
            );
          })}
        </div>

        {creating ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateAndSave();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder="合集名称"
              style={{
                flex: 1,
                background: CONSULT.bg,
                border: `1px solid ${CONSULT.borderStrong}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                color: CONSULT.text,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => void handleCreateAndSave()}
              disabled={!newName.trim()}
              style={{
                background: newName.trim() ? CONSULT.accent : CONSULT.accentSoft,
                color: newName.trim() ? '#faf8fc' : CONSULT.muted,
                border: 'none',
                borderRadius: 8,
                padding: '0 14px',
                fontSize: 12,
                cursor: newName.trim() ? 'pointer' : 'default',
              }}
            >
              创建并收入
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'none',
              border: `1px dashed ${CONSULT.borderStrong}`,
              borderRadius: 8,
              padding: '11px',
              color: CONSULT.accent,
              fontSize: 12,
              letterSpacing: '0.06em',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            新建合集并收入
          </button>
        )}

        {toast && (
          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: CONSULT.accent,
              letterSpacing: '0.06em',
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Viewer modal ─────────────────────────────────────────────────────────────

function ArtifactViewer({
  artifact,
  onClose,
  onCollect,
  hideCollect,
}: {
  artifact: Artifact;
  onClose: () => void;
  onCollect?: () => void;
  hideCollect?: boolean;
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
            {!hideCollect && onCollect && (
              <button
                type="button"
                className="artifact-viewer-btn"
                onClick={onCollect}
                title="收入合集"
              >
                <FolderPlus size={15} />
              </button>
            )}
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

export interface ArtifactCardProps {
  artifact: Artifact;
  /** Provenance for saved copies. */
  sourceConversationId?: string;
  sourceMessageId?: string;
  /** Hide the collect affordance (e.g. already inside a collection). */
  hideCollect?: boolean;
}

export default function ArtifactCard({
  artifact,
  sourceConversationId,
  sourceMessageId,
  hideCollect,
}: ArtifactCardProps) {
  const [open, setOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const label = artifactLabel(artifact.mimeType);

  return (
    <>
      <div className="artifact-card-row">
        <button
          type="button"
          className="artifact-card"
          onClick={() => setOpen(true)}
        >
          <span className="artifact-card-icon">
            {createElement(artifactIcon(artifact.mimeType), { size: 16 })}
          </span>
          <span className="artifact-card-info">
            <span className="artifact-card-name">{artifact.name}</span>
            <span className="artifact-card-meta">{label} · 点击预览</span>
          </span>
        </button>
        {!hideCollect && (
          <button
            type="button"
            className="artifact-collect-btn"
            onClick={(e) => {
              e.stopPropagation();
              setCollectOpen(true);
            }}
            title="收入合集"
            aria-label="收入合集"
          >
            <FolderPlus size={15} />
          </button>
        )}
      </div>
      {open && (
        <ArtifactViewer
          artifact={artifact}
          hideCollect={hideCollect}
          onCollect={() => {
            setOpen(false);
            setCollectOpen(true);
          }}
          onClose={() => setOpen(false)}
        />
      )}
      {collectOpen && (
        <SaveToCollectionModal
          artifact={artifact}
          sourceConversationId={sourceConversationId}
          sourceMessageId={sourceMessageId}
          onClose={() => setCollectOpen(false)}
        />
      )}
    </>
  );
}
