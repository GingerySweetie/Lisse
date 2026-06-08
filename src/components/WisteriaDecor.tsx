/**
 * Wisteria decoration — two hanging flower strands in the upper-left
 * + a leaf in the upper-right + a vertical hairline crossing through.
 * All purely decorative; pointer-events are off so nothing intercepts
 * taps on the actual UI.
 *
 * The leaf is rendered separately by Chat.tsx so the tap target lives
 * inside the React tree with onClick handlers.
 */

interface StrandDot {
  size: number;
  hue: number;
  sat: number;
  lit: number;
  op: number;
  mx: number;
}

const STRAND_A: StrandDot[] = [
  { size: 5.5, hue: 268, sat: 50, lit: 62, op: 0.55, mx: -3 },
  { size: 5, hue: 272, sat: 52, lit: 58, op: 0.5, mx: 2 },
  { size: 4.5, hue: 275, sat: 48, lit: 60, op: 0.45, mx: -1.5 },
  { size: 4, hue: 270, sat: 55, lit: 56, op: 0.48, mx: 3 },
  { size: 3.5, hue: 278, sat: 45, lit: 64, op: 0.4, mx: -2 },
  { size: 3, hue: 280, sat: 48, lit: 66, op: 0.32, mx: 1 },
  { size: 2.5, hue: 276, sat: 42, lit: 70, op: 0.24, mx: -1 },
  { size: 2, hue: 282, sat: 38, lit: 74, op: 0.16, mx: 0.5 },
];

const STRAND_B: StrandDot[] = [
  { size: 4, hue: 274, sat: 45, lit: 60, op: 0.4, mx: -2 },
  { size: 3.5, hue: 278, sat: 48, lit: 62, op: 0.35, mx: 1.5 },
  { size: 3, hue: 276, sat: 42, lit: 66, op: 0.28, mx: -1 },
  { size: 2.5, hue: 280, sat: 38, lit: 68, op: 0.2, mx: 1 },
  { size: 2, hue: 282, sat: 34, lit: 72, op: 0.14, mx: 0 },
];

function Strand({ left, dots, stemHeight }: { left: number; dots: StrandDot[]; stemHeight: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 50,
        left,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 1,
          height: stemHeight,
          background:
            'linear-gradient(180deg, hsla(270, 35%, 65%, 0.4), hsla(272, 40%, 62%, 0.35))',
        }}
      />
      {dots.map((dot, i) => (
        <div
          key={i}
          style={{
            width: dot.size,
            height: dot.size,
            borderRadius: '50%',
            background: `hsla(${dot.hue}, ${dot.sat}%, ${dot.lit}%, ${dot.op})`,
            marginTop: i === 0 ? 2 : 1.5,
            marginLeft: dot.mx,
            boxShadow:
              i < 3 ? `0 0 ${dot.size + 1}px hsla(${dot.hue}, 45%, 60%, ${dot.op * 0.3})` : 'none',
            animation: `strandSway ${5 + i * 0.5}s ease-in-out ${i * 0.2}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

export function WisteriaDecor() {
  return (
    <>
      <Strand left={18} dots={STRAND_A} stemHeight={18} />
      <Strand left={34} dots={STRAND_B} stemHeight={12} />

      {/* Curvy vertical vine on the right — emulates a wisteria trellis
       *  post. Crosses the header bottom-border to form the + cross with
       *  the leaf. SVG path is a gentle S-meander, the whole thing
       *  scales to viewport height. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 1000"
        preserveAspectRatio="xMidYMin slice"
        style={{
          position: 'absolute',
          right: 40,
          top: 0,
          width: 16,
          height: '100%',
          zIndex: 4,
          pointerEvents: 'none',
        }}
      >
        <defs>
          <linearGradient id="vine-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsla(270, 35%, 58%, 0.55)" />
            <stop offset="35%" stopColor="hsla(270, 32%, 62%, 0.40)" />
            <stop offset="70%" stopColor="hsla(272, 28%, 66%, 0.22)" />
            <stop offset="100%" stopColor="hsla(272, 25%, 70%, 0.05)" />
          </linearGradient>
        </defs>
        <path
          d="
            M 12 0
            C 12 50, 4 80, 12 120
            C 20 160, 4 200, 12 240
            C 20 280, 4 320, 12 360
            C 20 400, 4 440, 12 480
            C 20 520, 4 560, 12 600
            C 20 640, 4 680, 12 720
            C 20 760, 4 800, 12 840
            C 20 880, 4 920, 12 960
            L 12 1000
          "
          fill="none"
          stroke="url(#vine-grad)"
          strokeWidth="1.2"
          strokeLinecap="round"
          style={{
            animation: 'strandSway 12s ease-in-out infinite alternate',
            transformOrigin: 'center top',
          }}
        />
        {/* Tiny buds at each curve crest, fade as they descend */}
        {[120, 240, 360, 480, 600, 720, 840].map((y, i) => (
          <circle
            key={y}
            cx={12}
            cy={y}
            r={1.6 - i * 0.15}
            fill={`hsla(270, 40%, ${60 + i}%, ${0.45 - i * 0.04})`}
          />
        ))}
      </svg>

      {/* Grain — lighter, multiply blend */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
          backgroundSize: '256px 256px',
          opacity: 0.35,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

/** The leaf in the upper-right corner. Tap to open the function menu. */
export function LeafButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="功能菜单"
      style={{
        position: 'absolute',
        right: 4,
        top: 8,
        width: 66,
        height: 140,
        zIndex: 20,
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <svg viewBox="0 0 66 140" width="66" height="140" fill="none">
        <path
          d="M36 24 Q48 10 60 18 Q48 32 36 24Z"
          fill="hsla(262, 32%, 66%, 0.2)"
          stroke="hsla(264, 36%, 52%, 0.4)"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        <path
          d="M37 24 Q48 18 59 18"
          stroke="hsla(264, 28%, 55%, 0.25)"
          strokeWidth="0.4"
          strokeLinecap="round"
        />
        <path
          d="M22 50 Q 30 58 22 66 Q 14 74 22 82 Q 30 90 22 98 Q 14 106 22 114 Q 28 118 22 124"
          stroke="hsla(264, 36%, 54%, 0.35)"
          strokeWidth="0.9"
          strokeLinecap="round"
          style={{ animation: 'strandSway 10s ease-in-out infinite alternate' }}
        />
        {[66, 82, 98, 114].map((y, i) => (
          <circle
            key={i}
            cx={22}
            cy={y}
            r={1.4 - i * 0.15}
            fill={`hsla(268, 42%, 62%, ${0.32 - i * 0.04})`}
          />
        ))}
      </svg>
    </button>
  );
}
