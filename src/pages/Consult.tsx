import { useNavigate } from 'react-router-dom';
import ConsultCurtainBg from '../components/ConsultCurtainBg';

/**
 * Immersive entry — nothing but wind-stirred sheer curtains.
 * Tap / click anywhere to step into the session.
 */

export default function ConsultPage() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/consult/session')}
      aria-label="进入会谈"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        minHeight: '100%',
        position: 'relative',
        overflow: 'hidden',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        background: '#ffffff',
      }}
    >
      <ConsultCurtainBg windy />
    </button>
  );
}
