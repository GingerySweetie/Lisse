import { useNavigate } from 'react-router-dom';
import { CONSULT } from '../lib/consult-theme';

/**
 * Consult room entry — curtains-closed daytime hush before the session.
 * One composition: brand-like room name, one line, one CTA group.
 */

export default function ConsultPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: CONSULT.page,
        fontFamily: CONSULT.fontBody,
        color: CONSULT.text,
      }}
    >
      {/* Daylight seep + curtain bands */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: CONSULT.daylight,
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: CONSULT.curtains,
          pointerEvents: 'none',
        }}
      />
      {/* Soft vertical curtain folds */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent 0px,
            transparent 48px,
            rgba(92, 61, 122, 0.025) 49px,
            transparent 50px,
            transparent 96px
          )`,
          pointerEvents: 'none',
          animation: 'consultCurtainDrift 18s ease-in-out infinite',
        }}
      />

      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          padding: '14px 18px 10px',
          paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/home')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: CONSULT.faint,
            fontSize: 15,
            padding: '4px 8px 4px 0',
          }}
          aria-label="返回玄関"
        >
          ←
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => navigate('/consult/collections')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: CONSULT.muted,
            fontSize: 12,
            letterSpacing: '0.08em',
            padding: '6px 4px',
          }}
        >
          合集
        </button>
      </header>

      <main
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          minHeight: 'calc(100% - 120px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 28px 48px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: CONSULT.fontDisplay,
            fontWeight: 400,
            fontSize: 'clamp(28px, 8vw, 40px)',
            letterSpacing: '0.22em',
            color: CONSULT.accent,
            marginBottom: 18,
            animation: 'consultFadeUp 0.9s ease both',
          }}
        >
          咨询室
        </div>
        <p
          style={{
            maxWidth: 280,
            fontSize: 13,
            lineHeight: 1.75,
            color: CONSULT.muted,
            fontWeight: 300,
            letterSpacing: '0.04em',
            marginBottom: 36,
            animation: 'consultFadeUp 0.9s ease 0.12s both',
          }}
        >
          窗帘拉着。白天的光从布料缝隙隐隐透进来。
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            animation: 'consultFadeUp 0.9s ease 0.22s both',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/consult/session')}
            style={{
              background: CONSULT.accent,
              color: '#faf8fc',
              border: 'none',
              borderRadius: 2,
              padding: '12px 36px',
              fontSize: 13,
              letterSpacing: '0.18em',
              cursor: 'pointer',
              fontFamily: CONSULT.fontBody,
              boxShadow: CONSULT.shadow,
              transition: 'background 0.2s ease, transform 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = CONSULT.accentHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = CONSULT.accent;
            }}
          >
            进入会谈
          </button>
          <button
            type="button"
            onClick={() => navigate('/consult/collections')}
            style={{
              background: 'none',
              border: 'none',
              color: CONSULT.faint,
              fontSize: 12,
              letterSpacing: '0.06em',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            查看产物合集
          </button>
        </div>
      </main>

      <style>{`
        @keyframes consultFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes consultCurtainDrift {
          0%, 100% { opacity: 0.85; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(2px); }
        }
      `}</style>
    </div>
  );
}
