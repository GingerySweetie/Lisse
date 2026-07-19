import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import WallpaperPicker from './WallpaperPicker';
import { getSettings, saveSettings } from '../db';
import { CONSULT } from '../lib/consult-theme';

/**
 * Thin purple hairline from the right edge, fading toward the center.
 * Tap to reveal hidden consult settings (wallpaper / collections / leave).
 */

export default function ConsultSettingsLine() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const settings = useLiveQuery(() => getSettings(), [], null);
  const wallpaper = settings?.consultWallpaper ?? null;

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
      {/* Hairline: solid at right, fades out toward center */}
      <button
        type="button"
        className="consult-hairline-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="咨询室设置"
        aria-expanded={open}
        title="设置"
        style={{
          pointerEvents: 'auto',
          border: 'none',
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
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        <span
          style={{
            display: 'block',
            width: '100%',
            height: open ? 2 : 1.25,
            border: 'none',
            outline: 'none',
            borderRadius: 0,
            background: `linear-gradient(270deg,
              ${CONSULT.accent} 0%,
              rgba(92, 61, 122, 0.7) 18%,
              rgba(92, 61, 122, 0.28) 48%,
              rgba(92, 61, 122, 0.06) 78%,
              transparent 100%)`,
            transition: 'height 0.2s ease',
          }}
        />
      </button>

      {open && (
        <div
          className="consult-settings-panel"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: 36,
            right: 12,
            minWidth: 200,
            background: 'rgba(255,255,255,0.97)',
            border: '0 solid transparent',
            outline: 'none',
            borderRadius: 14,
            padding: 12,
            boxShadow: '0 12px 36px rgba(90, 70, 120, 0.1)',
            backdropFilter: 'blur(14px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            animation: 'consultSettingsIn 0.2s ease both',
          }}
        >
          <div
            style={{
              fontFamily: CONSULT.fontDisplay,
              fontSize: 13,
              letterSpacing: '0.12em',
              color: CONSULT.accent,
              marginBottom: 2,
            }}
          >
            设置
          </div>

          <div>
            <div
              style={{
                fontSize: 10,
                color: CONSULT.faint,
                letterSpacing: '0.06em',
                marginBottom: 6,
              }}
            >
              壁纸
            </div>
            <WallpaperPicker
              value={wallpaper}
              onChange={(next) => void saveSettings({ consultWallpaper: next })}
            />
          </div>

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
        .consult-settings-panel button {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
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
