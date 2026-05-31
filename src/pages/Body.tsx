import { useNavigate } from 'react-router-dom';
import WisteriaMark from '../components/WisteriaMark';

/**
 * Body — placeholder for now. The card on home shows static step/sleep
 * numbers; this page is where real health-tracking widgets will live
 * once we either pull Google Fit or wire up Web Bluetooth to the band.
 */
export default function BodyPage() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        position: 'relative',
        background: 'var(--page)',
        fontFamily: "-apple-system,'PingFang SC',sans-serif",
      }}
    >
      <div
        className="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 12px',
        }}
      >
        <button
          onClick={() => navigate('/home')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-3)',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontFamily: "'Crimson Pro','Noto Serif SC',serif",
            fontStyle: 'italic',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3L5 8L10 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          玄関
        </button>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 18,
            color: 'var(--head)',
            letterSpacing: 1,
          }}
        >
          身体
        </div>
        <div style={{ width: 48 }} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '60px 24px',
        }}
      >
        <div style={{ opacity: 0.6, marginBottom: 24 }}>
          <WisteriaMark size={80} />
        </div>
        <p
          style={{
            fontSize: 14,
            color: '#9a859e',
            fontStyle: 'italic',
            textAlign: 'center',
            lineHeight: 1.8,
            fontFamily: "'Crimson Pro','Noto Serif SC',serif",
          }}
        >
          まだ繋がっていない。
        </p>
        <p
          style={{
            marginTop: 16,
            fontSize: 12,
            color: '#b0a0b8',
            textAlign: 'center',
            maxWidth: 280,
            fontWeight: 300,
            lineHeight: 1.7,
          }}
        >
          手环 / Google Fit / 手动健康日志 还没接上 ——
          <br />
          等接好之后这里会显示心率、睡眠、步数和经期。
        </p>
      </div>
    </div>
  );
}
