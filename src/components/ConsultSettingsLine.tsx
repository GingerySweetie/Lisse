import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import AccentPicker from './AccentPicker';
import ConsultPromptEditor from './ConsultPromptEditor';
import EndpointPicker from './EndpointPicker';
import ExportMenu from './ExportMenu';
import PersonaPicker from './PersonaPicker';
import StylePicker from './StylePicker';
import WallpaperPicker from './WallpaperPicker';
import { db, getSettings, saveSettings } from '../db';
import { CONSULT } from '../lib/consult-theme';
import type { Conversation, Persona } from '../types';

/**
 * Thin purple hairline from the right edge, fading toward the center.
 * Tap to reveal consult settings — same pickers as normal chat, plus
 * consult-only exits (collections / curtains / leave).
 */

interface Props {
  conversation: Conversation | null;
  personaId: string | null;
  styleId: string | null;
  endpointId: string | null;
  model: string | null;
  persona?: Persona;
  contextText?: string;
  exportDisabled?: boolean;
  onPersonaChange: (id: string | null) => void;
  onStyleChange: (id: string | null) => void;
  onEndpointChange: (endpointId: string, model: string) => void;
  onNewConversation: () => void;
  onOpenConversationList: () => void;
}

export default function ConsultSettingsLine({
  conversation,
  personaId,
  styleId,
  endpointId,
  model,
  persona,
  contextText,
  exportDisabled,
  onPersonaChange,
  onStyleChange,
  onEndpointChange,
  onNewConversation,
  onOpenConversationList,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const settings = useLiveQuery(() => getSettings(), [], null);
  const wallpaper = settings?.consultWallpaper ?? null;
  const promptCustom = Boolean(settings?.consultSystemPrompt?.trim());

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleChangeGroup(nextIds: string[]) {
    if (!conversation) return;
    const personaIds = nextIds.length >= 2 ? nextIds : undefined;
    let nextPersonaId = personaId;
    if (personaIds && (!nextPersonaId || !personaIds.includes(nextPersonaId))) {
      nextPersonaId = personaIds[0];
      onPersonaChange(nextPersonaId);
    } else if (!personaIds && nextIds.length === 1) {
      nextPersonaId = nextIds[0];
      onPersonaChange(nextPersonaId);
    }
    await db.conversations.update(conversation.id, {
      personaIds,
      personaId: nextPersonaId ?? undefined,
      updatedAt: Date.now(),
    });
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: 'calc(14px + env(safe-area-inset-top, 0px))',
        right: 0,
        left: '28%',
        zIndex: 40,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        pointerEvents: 'none',
      }}
    >
      {/* Hairline: solid at right, fades out toward center.
          Use a div (not <button>) so browsers never paint a focus ring / black frame. */}
      <div
        role="button"
        tabIndex={0}
        className="consult-hairline-btn"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-label="咨询室设置"
        aria-expanded={open}
        title="设置"
        style={{
          pointerEvents: 'auto',
          border: 0,
          outline: 'none',
          boxShadow: 'none',
          background: 'transparent',
          padding: '14px 0',
          width: '100%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'block',
            width: '100%',
            height: open ? 2 : 1.25,
            border: 0,
            outline: 'none',
            borderRadius: 0,
            background: `linear-gradient(270deg,
              #A8AFD2 0%,
              rgba(168, 175, 210, 0.7) 18%,
              rgba(168, 175, 210, 0.28) 48%,
              rgba(168, 175, 210, 0.06) 78%,
              transparent 100%)`,
            transition: 'height 0.2s ease',
            pointerEvents: 'none',
          }}
        />
      </div>

      {open && (
        <div
          className="consult-settings-panel"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: 36,
            right: 12,
            width: 'min(280px, calc(100vw - 28px))',
            maxHeight: 'min(72vh, 520px)',
            overflowY: 'auto',
            background: 'rgba(255,255,255,0.97)',
            border: '0 solid transparent',
            outline: 'none',
            borderRadius: 14,
            padding: 12,
            boxShadow: '0 12px 36px rgba(90, 70, 120, 0.1)',
            backdropFilter: 'blur(14px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            animation: 'consultSettingsIn 0.2s ease both',
          }}
        >
          <div
            style={{
              fontFamily: CONSULT.fontDisplay,
              fontSize: 13,
              letterSpacing: '0.12em',
              color: CONSULT.accent,
              marginBottom: 4,
              padding: '0 4px',
            }}
          >
            设置
          </div>

          <MenuRow label="人格">
            <PersonaPicker
              personaId={personaId}
              onChange={async (id) => {
                onPersonaChange(id);
                if (conversation) {
                  await db.conversations.update(conversation.id, {
                    personaId: id ?? undefined,
                    updatedAt: Date.now(),
                  });
                }
              }}
              groupPersonaIds={conversation?.personaIds}
              onChangeGroup={(ids) => void handleChangeGroup(ids)}
              contextText={contextText}
            />
          </MenuRow>

          <MenuRow label="风格">
            <StylePicker
              styleId={styleId}
              onChange={async (id) => {
                onStyleChange(id);
                // Global default + this consult session — so every send picks it up.
                await saveSettings({ defaultStyleId: id });
                if (conversation) {
                  await db.conversations.update(conversation.id, {
                    styleId: id ?? undefined,
                    updatedAt: Date.now(),
                  });
                }
              }}
            />
          </MenuRow>

          <MenuRow label="模型">
            <EndpointPicker
              endpointId={endpointId}
              model={model}
              onChange={async (epId, m) => {
                onEndpointChange(epId, m);
                if (conversation) {
                  await db.conversations.update(conversation.id, {
                    defaultEndpointId: epId,
                    defaultModel: m,
                    updatedAt: Date.now(),
                  });
                }
              }}
            />
          </MenuRow>

          <MenuRow label="颜色">
            <AccentPicker
              value={conversation?.accentColor ?? null}
              onChange={async (next) => {
                if (!conversation) return;
                await db.conversations.update(conversation.id, {
                  accentColor: next ?? undefined,
                  updatedAt: Date.now(),
                });
              }}
            />
          </MenuRow>

          <MenuRow label="壁纸">
            <WallpaperPicker
              value={wallpaper}
              onChange={(next) => void saveSettings({ consultWallpaper: next })}
            />
          </MenuRow>

          <MenuRow label="导出">
            <ExportMenu
              conversation={conversation ?? undefined}
              persona={persona}
              disabled={exportDisabled || !conversation}
              scope="tree"
            />
          </MenuRow>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPromptOpen(true);
            }}
            style={menuBtnStyle}
          >
            房间提示词{promptCustom ? ' · 已自定义' : ''}
          </button>

          <div
            style={{
              height: 1,
              background: 'rgba(92, 61, 122, 0.1)',
              margin: '6px 4px',
            }}
          />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNewConversation();
            }}
            style={menuBtnStyle}
          >
            新建对话
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenConversationList();
            }}
            style={menuBtnStyle}
          >
            对话列表
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/consult/collections');
            }}
            style={menuBtnStyle}
          >
            产物合集
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/consult');
            }}
            style={menuBtnStyle}
          >
            回到窗帘
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/home');
            }}
            style={{ ...menuBtnStyle, color: CONSULT.faint }}
          >
            离开咨询室
          </button>
        </div>
      )}

      {promptOpen && (
        <ConsultPromptEditor
          value={settings?.consultSystemPrompt ?? null}
          onClose={() => setPromptOpen(false)}
        />
      )}

      <style>{`
        @keyframes consultSettingsIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .consult-hairline-btn,
        .consult-hairline-btn:focus,
        .consult-hairline-btn:focus-visible,
        .consult-hairline-btn:active {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
          -webkit-tap-highlight-color: transparent;
        }
        .consult-settings-panel {
          border: none !important;
          outline: none !important;
        }
        .consult-settings-panel button,
        .consult-settings-panel select {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  );
}

function MenuRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 4px',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: CONSULT.muted,
          letterSpacing: '0.08em',
          width: 36,
          flexShrink: 0,
          fontFamily: CONSULT.fontDisplay,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

const menuBtnStyle: CSSProperties = {
  background: 'rgba(250, 248, 252, 0.9)',
  border: 'none',
  outline: 'none',
  borderRadius: 8,
  padding: '9px 12px',
  textAlign: 'left',
  fontSize: 12,
  letterSpacing: '0.04em',
  color: CONSULT.text,
  cursor: 'pointer',
  fontFamily: CONSULT.fontBody,
  WebkitTapHighlightColor: 'transparent',
};
