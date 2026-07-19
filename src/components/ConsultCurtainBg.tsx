/**
 * Sunny closed-curtain wash — mostly white daylight, with only a faint
 * purple seep through the folds. Soft blur + slow drift; never candy bars.
 */

const FOLD_A = `repeating-linear-gradient(
  90deg,
  #ffffff 0px,
  #ffffff 48px,
  #f7f3fb 78px,
  #f0eaf6 100px,
  #fbf9fd 130px,
  #ffffff 168px
)`;

const FOLD_B = `repeating-linear-gradient(
  92deg,
  #ffffff 0px,
  #faf8fc 56px,
  #efe8f5 88px,
  #ffffff 148px
)`;

export default function ConsultCurtainBg() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, #ffffff 0%, #fdfcff 45%, #ffffff 100%)',
      }}
    >
      {/* Layer 1 — barely-there folds in white */}
      <div
        style={{
          position: 'absolute',
          inset: '-22%',
          backgroundImage: FOLD_A,
          backgroundSize: '168px 100%',
          filter: 'blur(48px)',
          opacity: 0.55,
          transformOrigin: '50% 50%',
          animation: 'consultFogDriftA 16s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Layer 2 — whisper of lavender only */}
      <div
        style={{
          position: 'absolute',
          inset: '-28%',
          backgroundImage: FOLD_B,
          backgroundSize: '148px 100%',
          filter: 'blur(64px)',
          opacity: 0.28,
          animation: 'consultFogDriftB 22s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Soft white bloom pools */}
      <div
        style={{
          position: 'absolute',
          inset: '-10%',
          background: `
            radial-gradient(ellipse 60% 45% at 28% 30%, rgba(255,255,255,0.75) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 75% 55%, rgba(245, 238, 252, 0.22) 0%, transparent 72%),
            radial-gradient(ellipse 65% 40% at 50% 85%, rgba(255,255,255,0.55) 0%, transparent 70%)
          `,
          filter: 'blur(20px)',
          animation: 'consultFogBreathe 12s ease-in-out infinite alternate',
        }}
      />
      {/* Sunny daylight from above — warm white, hint of lilac at the edge */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 85% 55% at 50% -8%, rgba(255, 248, 236, 0.45) 0%, rgba(245, 236, 252, 0.12) 38%, transparent 68%)',
        }}
      />
      {/* Heavy white veil — keep the room bright */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 75% 65% at 50% 45%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.55) 100%)',
        }}
      />

      <style>{`
        @keyframes consultFogDriftA {
          0%   { transform: translate3d(-1.2%, 0, 0) skewX(-0.8deg) scale(1.04); }
          100% { transform: translate3d(1.8%, 0, 0) skewX(1deg) scale(1.06); }
        }
        @keyframes consultFogDriftB {
          0%   { transform: translate3d(1.5%, 0.4%, 0) skewX(0.7deg) scale(1.06); }
          100% { transform: translate3d(-2%, -0.4%, 0) skewX(-1deg) scale(1.08); }
        }
        @keyframes consultFogBreathe {
          0%   { opacity: 0.75; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
}
