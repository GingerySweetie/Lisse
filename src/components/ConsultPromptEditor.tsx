import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { saveSettings } from '../db';
import { CONSULT, CONSULT_SYS } from '../lib/consult-theme';

interface Props {
  /** Current stored override (null = using built-in). */
  value: string | null;
  onClose: () => void;
}

/**
 * Full-screen-ish editor for the consult room system prompt.
 * Empty / reset → falls back to built-in CONSULT_SYS.
 */
export default function ConsultPromptEditor({ value, onClose }: Props) {
  const [draft, setDraft] = useState(value?.trim() ? value : CONSULT_SYS);
  const [saving, setSaving] = useState(false);
  const isCustom = Boolean(value?.trim());
  const dirty =
    draft.trim() !== (value?.trim() ? value.trim() : CONSULT_SYS.trim());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    try {
      const next = draft.trim();
      // Store null when equal to built-in, so upgrades to default prompt apply.
      const toStore =
        !next || next === CONSULT_SYS.trim() ? null : next;
      await saveSettings({ consultSystemPrompt: toStore });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('恢复为内置默认提示词？未保存的编辑会丢失。')) return;
    setDraft(CONSULT_SYS);
    setSaving(true);
    try {
      await saveSettings({ consultSystemPrompt: null });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 430,
        background: 'rgba(40, 28, 55, 0.36)',
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
        aria-label="编辑咨询室提示词"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(88vh, 720px)',
          background: 'rgba(255,255,255,0.98)',
          borderRadius: '18px 18px 0 0',
          boxShadow: '0 -10px 40px rgba(74, 58, 106, 0.14)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'consultPromptIn 0.22s ease both',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px 12px',
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
              房间提示词
            </div>
            <div style={{ fontSize: 10.5, color: CONSULT.faint, marginTop: 2 }}>
              {isCustom ? '自定义中 · 随设置备份' : '当前为内置默认 · 可直接改'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={iconBtn}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </header>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 280,
            width: '100%',
            boxSizing: 'border-box',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '14px 16px',
            fontSize: 12.5,
            lineHeight: 1.65,
            color: CONSULT.text,
            background: 'rgba(250, 248, 252, 0.65)',
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        />

        <footer
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: `1px solid ${CONSULT.border}`,
            flexShrink: 0,
            background: 'rgba(255,255,255,0.96)',
          }}
        >
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={saving}
            style={{ ...ghostBtn, opacity: saving ? 0.5 : 1 }}
          >
            恢复默认
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ ...ghostBtn, opacity: saving ? 0.5 : 1 }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !draft.trim() || !dirty}
            style={{
              ...saveBtn,
              flex: 1,
              opacity: saving || !draft.trim() || !dirty ? 0.45 : 1,
              cursor:
                saving || !draft.trim() || !dirty ? 'default' : 'pointer',
            }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </footer>

        <style>{`
          @keyframes consultPromptIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

const iconBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: CONSULT.muted,
  padding: 6,
};

const ghostBtn: CSSProperties = {
  background: 'rgba(250, 248, 252, 0.9)',
  border: 'none',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 12.5,
  letterSpacing: '0.04em',
  color: CONSULT.muted,
  cursor: 'pointer',
  fontFamily: CONSULT.fontBody,
};

const saveBtn: CSSProperties = {
  background: 'rgba(205, 210, 235, 0.55)',
  border: 'none',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
  letterSpacing: '0.06em',
  color: CONSULT.text,
  fontFamily: CONSULT.fontBody,
};
