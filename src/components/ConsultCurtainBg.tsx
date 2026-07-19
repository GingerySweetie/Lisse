/**
 * Backlit sheer-curtain wash — bright sun through white lace in the center,
 * dusty-lavender drapes at the sides, soft bloom / fog. Matches the
 * "透光窗帘" reference: high-key white, faint lilac in the folds.
 */

/** Soft vertical pleats for the side drapes (dusty mauve) — wide stops so
 *  blur melts them into fabric, not candy bars. */
const DRAPE_PLEATS = `repeating-linear-gradient(
  90deg,
  #d8c8e2 0px,
  #e8dcf0 22px,
  #f2ebf7 40px,
  #e0d2ea 58px,
  #d8c8e2 80px
)`;

/** Sheer center folds — mostly white, lilac only in the troughs. */
const SHEER_FOLDS = `repeating-linear-gradient(
  90deg,
  #ffffff 0px,
  #ffffff 36px,
  #f8f4fb 58px,
  #f0eaf6 72px,
  #fbf9fd 96px,
  #ffffff 120px
)`;

/** Tiny lace motif as a data-URI SVG — watermark-soft on the sheer. */
const LACE_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
  <g fill="none" stroke="#d8cce6" stroke-width="0.7" opacity="0.55">
    <path d="M60 18c8 10 18 18 18 32 0 14-8 22-18 30-10-8-18-16-18-30 0-14 10-22 18-32z"/>
    <circle cx="60" cy="52" r="3.5"/>
    <path d="M38 88c6 4 12 4 18 0 6 8 6 18 0 28-6-4-12-4-18 0-6-10-6-20 0-28z"/>
    <path d="M64 88c6 4 12 4 18 0 6 8 6 18 0 28-6-4-12-4-18 0-6-10-6-20 0-28z"/>
    <path d="M60 118c-4 10-4 22 0 32 4-10 4-22 0-32z"/>
    <circle cx="28" cy="36" r="1.2"/>
    <circle cx="92" cy="40" r="1.2"/>
    <circle cx="44" cy="140" r="1"/>
    <circle cx="78" cy="136" r="1"/>
  </g>
</svg>
`);

export default function ConsultCurtainBg() {
  return (
    <div
      aria-hidden
      className="consult-sheer"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background:
          'linear-gradient(180deg, #f4eef8 0%, #faf7fc 35%, #ffffff 70%, #fbf9fd 100%)',
      }}
    >
      {/* Window light well — blown-out center */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 48% 70% at 50% 42%, #ffffff 0%, #ffffff 28%, rgba(255,252,255,0.85) 48%, rgba(244,236,250,0.35) 68%, transparent 82%)',
        }}
      />

      {/* Left drape — dusty lavender, heavily blurred into fabric mass */}
      <div
        className="consult-drape consult-drape-l"
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
          animation: 'consultDrapeL 18s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />

      {/* Right drape */}
      <div
        className="consult-drape consult-drape-r"
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
          animation: 'consultDrapeR 20s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />

      {/* Sheer lace panel in the center — translucent white */}
      <div
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
          animation: 'consultSheerSway 15s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />

      {/* Lace watermark — very faint floral on the sheer */}
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
          opacity: 0.22,
          filter: 'blur(0.6px)',
          mixBlendMode: 'multiply',
          maskImage:
            'radial-gradient(ellipse 70% 75% at 50% 45%, #000 20%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 75% at 50% 45%, #000 20%, transparent 75%)',
          animation: 'consultLaceDrift 24s ease-in-out infinite alternate',
        }}
      />

      {/* Sun bloom — overexposed hotspot through the fabric */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 36% 48% at 50% 38%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 40%, transparent 70%),
            radial-gradient(ellipse 55% 40% at 50% -5%, rgba(255, 246, 230, 0.55) 0%, rgba(255,255,255,0.15) 45%, transparent 70%)
          `,
          animation: 'consultBloom 10s ease-in-out infinite alternate',
        }}
      />

      {/* Soft haze — fog the whole room into high-key mist */}
      <div
        style={{
          position: 'absolute',
          inset: '-12%',
          background: `
            radial-gradient(ellipse 50% 40% at 35% 55%, rgba(255,255,255,0.45) 0%, transparent 65%),
            radial-gradient(ellipse 45% 38% at 68% 48%, rgba(236, 226, 245, 0.28) 0%, transparent 65%)
          `,
          filter: 'blur(28px)',
          animation: 'consultHaze 13s ease-in-out infinite alternate',
        }}
      />

      {/* Edge vignette into soft lilac shadow (like heavier drapes) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(196,178,210,0.28) 0%, transparent 22%, transparent 78%, rgba(196,178,210,0.26) 100%)',
        }}
      />

      {/* Final white lift so text stays readable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 65% 55% at 50% 48%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 55%, rgba(252,248,255,0.18) 100%)',
        }}
      />

      <style>{`
        @keyframes consultDrapeL {
          0%   { transform: translate3d(0, 0, 0) skewX(-0.6deg); }
          100% { transform: translate3d(1.8%, 0, 0) skewX(0.8deg); }
        }
        @keyframes consultDrapeR {
          0%   { transform: translate3d(0, 0, 0) skewX(0.6deg); }
          100% { transform: translate3d(-1.8%, 0, 0) skewX(-0.8deg); }
        }
        @keyframes consultSheerSway {
          0%   { transform: translate3d(-1%, 0, 0) skewX(-0.5deg) scale(1.02); }
          100% { transform: translate3d(1.4%, 0, 0) skewX(0.7deg) scale(1.04); }
        }
        @keyframes consultLaceDrift {
          0%   { transform: translate3d(0, 0, 0); opacity: 0.18; }
          100% { transform: translate3d(1.5%, 0.8%, 0); opacity: 0.28; }
        }
        @keyframes consultBloom {
          0%   { opacity: 0.85; }
          100% { opacity: 1; }
        }
        @keyframes consultHaze {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.04); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
