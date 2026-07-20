import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Download, Trash2, X } from 'lucide-react';
import { db } from '../db';
import { deleteConversation } from '../lib/chat';
import {
  createConsultConversation,
  listConsultConversations,
  setActiveConsultConversationId,
} from '../lib/consult-conversations';
import { CONSULT } from '../lib/consult-theme';
import {
  downloadBlob,
  downloadText,
  exportAllConversationsZip,
  exportConversation,
} from '../lib/export';
import { relativeTime } from '../lib/format';
import type { Conversation } from '../types';

interface Props {
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDeletedActive: (nextId: string | null) => void;
}

export default function ConsultConversationList({
  activeId,
  onClose,
  onSelect,
  onDeletedActive,
}: Props) {
  const conversations = useLiveQuery(
    () => listConsultConversations(),
    [],
    [] as Conversation[],
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allIds = useMemo(
    () => (conversations ?? []).map((c) => c.id),
    [conversations],
  );
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleNew() {
    const current = conversations?.find((c) => c.id === activeId) ?? null;
    const conv = await createConsultConversation({ copyFrom: current });
    onSelect(conv.id);
    onClose();
  }

  async function handleDeleteSelected() {
    if (selected.size === 0 || busy) return;
    if (
      !confirm(
        `确定删除选中的 ${selected.size} 条会谈？消息会一并清除，不可撤销。`,
      )
    )
      return;
    setBusy(true);
    try {
      const ids = [...selected];
      for (const id of ids) {
        await deleteConversation(id);
      }
      const remaining = (await listConsultConversations()).filter(
        (c) => !ids.includes(c.id),
      );
      if (activeId && ids.includes(activeId)) {
        if (remaining.length > 0) {
          setActiveConsultConversationId(remaining[0].id);
          onDeletedActive(remaining[0].id);
        } else {
          const fresh = await createConsultConversation();
          onDeletedActive(fresh.id);
        }
      }
      exitSelect();
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadSelected() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const ids = [...selected];
      if (ids.length === 1) {
        const conv = await db.conversations.get(ids[0]);
        if (!conv) return;
        const out = await exportConversation(conv, {
          format: 'markdown',
          scope: 'tree',
        });
        await downloadText(out.content, out.filename, out.mime);
      } else {
        const { blob, filename } = await exportAllConversationsZip({
          conversationIds: ids,
          format: 'markdown',
          scope: 'tree',
        });
        await downloadBlob(blob, filename);
      }
      exitSelect();
    } catch (e) {
      console.error('[consult] export failed', e);
      alert(e instanceof Error ? e.message : '导出失败');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 420,
        background: 'rgba(40, 28, 55, 0.32)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="会谈列表"
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: 'min(82vh, 640px)',
          background: 'rgba(255,255,255,0.97)',
          borderRadius: '18px 18px 0 0',
          boxShadow: '0 -10px 40px rgba(74, 58, 106, 0.14)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'consultListIn 0.22s ease both',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 16px 12px',
            borderBottom: `1px solid ${CONSULT.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: CONSULT.fontDisplay,
                fontSize: 17,
                letterSpacing: '0.12em',
                color: CONSULT.accent,
              }}
            >
              会谈列表
            </div>
            <div style={{ fontSize: 10.5, color: CONSULT.faint, marginTop: 2 }}>
              {(conversations ?? []).length} 条 ·{' '}
              {selectMode ? '勾选后可删除或下载' : '点开继续，或进入选择'}
            </div>
          </div>
          {!selectMode ? (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              style={ghostBtn}
            >
              选择
            </button>
          ) : (
            <button type="button" onClick={exitSelect} style={ghostBtn}>
              取消
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ ...ghostBtn, padding: 6 }}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </header>

        {!selectMode && (
          <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
            <button type="button" onClick={() => void handleNew()} style={newBtn}>
              ＋ 新建会谈
            </button>
          </div>
        )}

        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '10px 12px 16px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {(conversations ?? []).length === 0 && (
            <li
              style={{
                textAlign: 'center',
                padding: '36px 12px',
                color: CONSULT.muted,
                fontSize: 13,
              }}
            >
              还没有会谈。
            </li>
          )}
          {(conversations ?? []).map((c) => {
            const isActive = c.id === activeId;
            const isChecked = selected.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (selectMode) toggle(c.id);
                    else {
                      setActiveConsultConversationId(c.id);
                      onSelect(c.id);
                      onClose();
                    }
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 12px',
                    textAlign: 'left',
                    borderRadius: 12,
                    border: `1px solid ${
                      isActive && !selectMode
                        ? CONSULT.borderStrong
                        : CONSULT.border
                    }`,
                    background:
                      isActive && !selectMode
                        ? 'rgba(205, 210, 235, 0.35)'
                        : isChecked
                          ? 'rgba(205, 210, 235, 0.22)'
                          : 'rgba(250, 248, 252, 0.9)',
                    cursor: 'pointer',
                    color: CONSULT.text,
                  }}
                >
                  {selectMode && (
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        border: `1.5px solid ${
                          isChecked ? CONSULT.accent : CONSULT.borderStrong
                        }`,
                        background: isChecked ? CONSULT.accent : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#fff',
                      }}
                    >
                      {isChecked && <Check size={12} strokeWidth={2.5} />}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13.5,
                        letterSpacing: '0.02em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.title || '未命名会谈'}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 10.5,
                        color: CONSULT.faint,
                        marginTop: 3,
                      }}
                    >
                      {relativeTime(c.updatedAt)}
                      {isActive ? ' · 当前' : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {selectMode && (
          <div
            style={{
              borderTop: `1px solid ${CONSULT.border}`,
              padding: '10px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              flexShrink: 0,
              background: 'rgba(255,255,255,0.96)',
            }}
          >
            <button type="button" onClick={toggleAll} style={ghostBtnWide}>
              {allSelected ? '取消全选' : `全选（${allIds.length}）`}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={selected.size === 0 || busy}
                onClick={() => void handleDownloadSelected()}
                style={{
                  ...actionBtn,
                  flex: 1,
                  opacity: selected.size === 0 || busy ? 0.4 : 1,
                }}
              >
                <Download size={14} />
                下载{selected.size > 0 ? ` ${selected.size}` : ''}
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || busy}
                onClick={() => void handleDeleteSelected()}
                style={{
                  ...actionBtn,
                  flex: 1,
                  color: '#b44a5a',
                  background: 'rgba(244, 220, 224, 0.65)',
                  opacity: selected.size === 0 || busy ? 0.4 : 1,
                }}
              >
                <Trash2 size={14} />
                删除{selected.size > 0 ? ` ${selected.size}` : ''}
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes consultListIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

const ghostBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: CONSULT.muted,
  fontSize: 12,
  letterSpacing: '0.04em',
  padding: '6px 8px',
  fontFamily: CONSULT.fontBody,
};

const ghostBtnWide: CSSProperties = {
  ...ghostBtn,
  width: '100%',
  textAlign: 'center',
  padding: '8px',
  borderRadius: 8,
  background: 'rgba(250, 248, 252, 0.9)',
};

const newBtn: CSSProperties = {
  width: '100%',
  background: 'rgba(205, 210, 235, 0.45)',
  border: `1px solid ${CONSULT.border}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
  letterSpacing: '0.06em',
  color: CONSULT.text,
  cursor: 'pointer',
  fontFamily: CONSULT.fontBody,
};

const actionBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: 'none',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 12.5,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  background: 'rgba(205, 210, 235, 0.4)',
  color: CONSULT.text,
  fontFamily: CONSULT.fontBody,
};
