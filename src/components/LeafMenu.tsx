import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Slide-down menu anchored to the upper-right leaf icon. Holds the
 * persona / style / endpoint / accent / export controls that used to
 * live as a separate row in the chat header.
 *
 * Closes on outside click, Escape, and the close X.
 */
export default function LeafMenu({ open, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'hsla(268, 28%, 18%, 0.18)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'leafFadeIn 180ms ease-out both',
      }}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 16,
          right: 12,
          width: 'min(92vw, 320px)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'hsla(270, 30%, 96%, 0.94)',
          border: '1px solid hsla(270, 30%, 78%, 0.4)',
          borderRadius: 16,
          boxShadow:
            '0 10px 28px hsla(270, 30%, 35%, 0.18), 0 0 0 1px hsla(270, 30%, 88%, 0.45) inset',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          padding: '12px 14px 16px',
          animation: 'leafSlide 220ms cubic-bezier(.33,.68,.42,1) both',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 8,
            marginBottom: 6,
            borderBottom: '1px solid hsla(270, 25%, 80%, 0.3)',
          }}
        >
          <span
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontStyle: 'italic',
              fontSize: 14,
              color: 'hsla(268, 30%, 38%, 0.85)',
              letterSpacing: '0.06em',
            }}
          >
            functions
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关掉"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: 'hsla(268, 20%, 50%, 0.6)',
              padding: 4,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes leafFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes leafSlide {
          from { transform: translateY(-6px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
