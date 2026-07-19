/**
 * Backlit sheer curtains — sunny white + a whisper of sky blue through the
 * lace, dusty-lavender drapes at the sides, soft bloom, wind-sway.
 */

const DRAPE_PLEATS = `repeating-linear-gradient(
  90deg,
  #d8c8e2 0px,
  #e8dcf0 22px,
  #f2ebf7 40px,
  #e0d2ea 58px,
  #d8c8e2 80px
)`;

const SHEER_FOLDS = `repeating-linear-gradient(
  90deg,
  #ffffff 0px,
  #ffffff 36px,
  #f5f8fc 58px,
  #eef3f9 72px,
  #fbf9fd 96px,
  #ffffff 120px
)`;

const LACE_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
  <g fill="none" stroke="#c8d4e6" stroke-width="0.7" opacity="0.5">
    <path d="M60 18c8 10 18 18 18 32 0 14-8 22-18 30-10-8-18-16-18-30 0-14 10-22 18-32z"/>
    <circle cx="60" cy="52" r="3.5"/>
    <path d="M38 88c6 4 12 4 18 0 6 8 6 18 0 28-6-4-12-4-18 0-6-10-6-20 0-28z"/>
    <path d="M64 88c6 4 12 4 18 0 6 8 6 18 0 28-6-4-12-4-18 0-6-10-6-20 0-28z"/>
    <path d="M60 118c-4 10-4 22 0 32 4-10 4-22 0-32z"/>
    <circle cx="28" cy="36" r="1.2"/>
    <circle cx="92" cy="40" r="1.2"/>
  </g>
</svg>
`);

export default function ConsultCurtainBg({
  windy = false,
}: {
  /** Stronger sway on the immersive entry page. */
  windy?: boolean;
}) {
  const swayDur = windy ? '9s' : '15s';
  const drapeDur = windy ? '11s' : '18s';

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background:
          'linear-gradient(180deg, #eef4fa 0%, #f7f9fc 30%, #ffffff 65%, #fbf9fd 100%)',
      }}
    >
      {/* Sky blue seep — sunny day behind the sheer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 42% 55% at 48% 40%, rgba(186, 214, 240, 0.42) 0%, rgba(210, 228, 245, 0.18) 45%, transparent 72%),
            linear-gradient(180deg, rgba(176, 208, 236, 0.22) 0%, transparent 38%)
          `,
        }}
      />

      {/* Window light well — blown-out center */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 48% 70% at 50% 42%, #ffffff 0%, #ffffff 22%, rgba(255,252,255,0.8) 45%, rgba(236,244,252,0.3) 65%, transparent 82%)',
        }}
      />

      {/* Left drape — desktop only; mobile keeps just the right curtain */}
      <div
        className="consult-drape-left"
        style={{
          position: 'absolute',
          top: '-10%',
          bottom: '-10%',
          left: '-10%',
          width: '46%',
          backgroundImage: `
            linear-gradient(90deg, #cbb9d8 0%, #e4d6ec 40%, #f3ecf8 78%, transparent 100%),
            ${DRAPE_PLEATS}
          `,
          backgroundSize: '100% 100%, 80px 100%',
          filter: 'blur(28px)',
          opacity: 0.78,
          maskImage:
            'linear-gradient(90deg, #000 0%, #000 35%, rgba(0,0,0,0.45) 62%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, #000 0%, #000 35%, rgba(0,0,0,0.45) 62%, transparent 100%)',
          animation: `consultDrapeL ${drapeDur} ease-in-out infinite alternate`,
          willChange: 'transform',
        }}
      />

      {/* Right drape */}
      <div
        className="consult-drape-right"
        style={{
          position: 'absolute',
          top: '-10%',
          bottom: '-10%',
          right: '-10%',
          width: '46%',
          backgroundImage: `
            linear-gradient(270deg, #cbb9d8 0%, #e4d6ec 40%, #f3ecf8 78%, transparent 100%),
            ${DRAPE_PLEATS}
          `,
          backgroundSize: '100% 100%, 80px 100%',
          filter: 'blur(28px)',
          opacity: 0.74,
          maskImage:
            'linear-gradient(270deg, #000 0%, #000 35%, rgba(0,0,0,0.45) 62%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(270deg, #000 0%, #000 35%, rgba(0,0,0,0.45) 62%, transparent 100%)',
          animation: `consultDrapeR ${windy ? '12s' : '20s'} ease-in-out infinite alternate`,
          willChange: 'transform',
        }}
      />

      {/* Sheer center — on mobile stretches left into the open light */}
      <div
        className="consult-sheer-panel"
        style={{
          position: 'absolute',
          top: '-8%',
          bottom: '-8%',
          left: '12%',
          right: '12%',
          backgroundImage: SHEER_FOLDS,
          backgroundSize: '120px 100%',
          filter: 'blur(22px)',
          opacity: 0.7,
          animation: `consultSheerSway ${swayDur} ease-in-out infinite alternate`,
          willChange: 'transform',
        }}
      />

      {/* Lace watermark */}
      <div
        style={{
          position: 'absolute',
          top: '4%',
          bottom: '8%',
          left: '22%',
          right: '22%',
          backgroundImage: `url("data:image/svg+xml,${LACE_SVG}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '110px 148px',
          opacity: 0.2,
          filter: 'blur(0.6px)',
          mixBlendMode: 'multiply',
          maskImage:
            'radial-gradient(ellipse 70% 75% at 50% 45%, #000 20%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 75% at 50% 45%, #000 20%, transparent 75%)',
          animation: `consultLaceDrift ${windy ? '14s' : '24s'} ease-in-out infinite alternate`,
        }}
      />

      {/* Sun bloom + cool sky rim */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 36% 48% at 50% 38%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 40%, transparent 70%),
            radial-gradient(ellipse 50% 35% at 50% -4%, rgba(255, 248, 232, 0.4) 0%, rgba(200, 224, 245, 0.18) 40%, transparent 68%)
          `,
          animation: 'consultBloom 10s ease-in-out infinite alternate',
        }}
      />

      {/* Soft haze */}
      <div
        style={{
          position: 'absolute',
          inset: '-12%',
          background: `
            radial-gradient(ellipse 50% 40% at 35% 55%, rgba(255,255,255,0.45) 0%, transparent 65%),
            radial-gradient(ellipse 45% 38% at 68% 48%, rgba(210, 228, 245, 0.22) 0%, transparent 65%)
          `,
          filter: 'blur(28px)',
          animation: 'consultHaze 13s ease-in-out infinite alternate',
        }}
      />

      {/* Edge vignette into soft lilac — left band dropped on mobile */}
      <div
        className="consult-edge-vignette"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(196,178,210,0.26) 0%, transparent 22%, transparent 78%, rgba(196,178,210,0.24) 100%)',
        }}
      />

      {/* White lift for readability on session; lighter on entry */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: windy
            ? 'radial-gradient(ellipse 70% 60% at 50% 48%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)'
            : 'radial-gradient(ellipse 65% 55% at 50% 48%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 55%, rgba(252,248,255,0.14) 100%)',
        }}
      />

      <style>{`
        @keyframes consultDrapeL {
          0%   { transform: translate3d(0, 0, 0) skewX(-0.8deg); }
          100% { transform: translate3d(${windy ? '2.8%' : '1.8%'}, 0, 0) skewX(${windy ? '1.4deg' : '0.8deg'}); }
        }
        @keyframes consultDrapeR {
          0%   { transform: translate3d(0, 0, 0) skewX(0.8deg); }
          100% { transform: translate3d(${windy ? '-2.8%' : '-1.8%'}, 0, 0) skewX(${windy ? '-1.4deg' : '-0.8deg'}); }
        }
        @keyframes consultSheerSway {
          0%   { transform: translate3d(-1.2%, 0, 0) skewX(-0.7deg) scale(1.02); }
          100% { transform: translate3d(${windy ? '2.2%' : '1.4%'}, 0, 0) skewX(${windy ? '1.1deg' : '0.7deg'}) scale(${windy ? '1.06' : '1.04'}); }
        }
        @keyframes consultLaceDrift {
          0%   { transform: translate3d(0, 0, 0); opacity: 0.16; }
          100% { transform: translate3d(${windy ? '2.5%' : '1.5%'}, ${windy ? '1.2%' : '0.8%'}, 0); opacity: 0.26; }
        }
        @keyframes consultBloom {
          0%   { opacity: 0.85; }
          100% { opacity: 1; }
        }
        @keyframes consultHaze {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.04); opacity: 1; }
        }
        /* Phone: drop left drape, open the light to the left; keep right curtain. */
        @media (max-width: 767px) {
          .consult-drape-left { display: none !important; }
          .consult-sheer-panel { left: -4% !important; right: 18% !important; }
          .consult-edge-vignette {
            background: linear-gradient(
              90deg,
              transparent 0%,
              transparent 55%,
              rgba(196,178,210,0.28) 100%
            ) !important;
          }
        }
      `}</style>
    </div>
  );
}
