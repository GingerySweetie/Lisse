/**
 * Fogged curtain wash — soft vertical white / pale-lavender folds
 * heavily blurred into mist, gently drifting. CSS blur so it never
 * hardens into candy stripes.
 */

const FOLD_A = `repeating-linear-gradient(
  90deg,
  #ffffff 0px,
  #ffffff 36px,
  #efe6f7 72px,
  #e4d8f0 96px,
  #f7f2fb 128px,
  #ffffff 160px
)`;

const FOLD_B = `repeating-linear-gradient(
  92deg,
  #faf8fc 0px,
  #f3ecf8 48px,
  #ddd2eb 90px,
  #faf8fc 140px
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
        background: 'linear-gradient(180deg, #fbf8fd 0%, #f6f2fa 50%, #faf8fc 100%)',
      }}
    >
      {/* Layer 1 — wide soft folds, blown out by blur */}
      <div
        style={{
          position: 'absolute',
          inset: '-22%',
          backgroundImage: FOLD_A,
          backgroundSize: '160px 100%',
          filter: 'blur(42px)',
          opacity: 0.75,
          transformOrigin: '50% 50%',
          animation: 'consultFogDriftA 14s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Layer 2 — slower, slightly denser lavender mist */}
      <div
        style={{
          position: 'absolute',
          inset: '-28%',
          backgroundImage: FOLD_B,
          backgroundSize: '140px 100%',
          filter: 'blur(56px)',
          opacity: 0.45,
          animation: 'consultFogDriftB 19s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Floating haze pools */}
      <div
        style={{
          position: 'absolute',
          inset: '-10%',
          background: `
            radial-gradient(ellipse 55% 40% at 30% 35%, rgba(255,255,255,0.55) 0%, transparent 70%),
            radial-gradient(ellipse 50% 45% at 72% 60%, rgba(232,220,245,0.35) 0%, transparent 72%),
            radial-gradient(ellipse 60% 35% at 50% 80%, rgba(255,255,255,0.4) 0%, transparent 70%)
          `,
          filter: 'blur(18px)',
          animation: 'consultFogBreathe 11s ease-in-out infinite alternate',
        }}
      />
      {/* Daylight seep through closed curtains */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(255, 240, 220, 0.32) 0%, rgba(236, 222, 245, 0.1) 40%, transparent 70%)',
        }}
      />
      {/* Final white veil — kills residual stripe readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(255,255,255,0.08) 0%, rgba(250,248,252,0.28) 100%)',
        }}
      />

      <style>{`
        @keyframes consultFogDriftA {
          0%   { transform: translate3d(-1.5%, 0, 0) skewX(-1.2deg) scale(1.05); }
          100% { transform: translate3d(2.2%, 0, 0) skewX(1.4deg) scale(1.08); }
        }
        @keyframes consultFogDriftB {
          0%   { transform: translate3d(2%, 0.5%, 0) skewX(1deg) scale(1.08); }
          100% { transform: translate3d(-2.5%, -0.5%, 0) skewX(-1.6deg) scale(1.1); }
        }
        @keyframes consultFogBreathe {
          0%   { opacity: 0.7; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}
