import { useMemo } from 'react';

/**
 * Bedroom decoration layer — hanging-thread structure with density-gradient
 * nodes, geometric edge tracery, corner frame (pomegranate), lotus ornament.
 *
 * Two visual variants: 'sennya' (deep midnight purple, circular motifs) and
 * 'pomegranate' (deep wine red, diamond motifs).
 *
 * Layered absolutely on top of the page background; no interactivity.
 * Stable across renders thanks to useMemo on the random seed.
 */
export type BedroomDecorVariant = 'sennya' | 'pomegranate';

interface DecorTokens {
  bgGrad: string;
  nodeC: string;
  threadC: string;
  beam: string;
  horizon: string;
  geoC: string;
  focusC: string;
  frameC?: string;
}

export const BEDROOM_DECOR_TOKENS: Record<BedroomDecorVariant, DecorTokens> = {
  sennya: {
    bgGrad:
      'linear-gradient(180deg, #0d0a25 0%, #110e30 50%, #0a0820 100%)',
    nodeC: 'rgba(210,205,240,',
    threadC: 'rgba(210,205,240,0.06)',
    beam: 'rgba(210,205,240,0.04)',
    horizon: 'rgba(210,205,240,0.03)',
    geoC: 'rgba(160,150,210,0.02)',
    focusC: 'rgba(230,225,255,',
  },
  pomegranate: {
    bgGrad:
      'linear-gradient(180deg, #3a1520 0%, #4a1e28 20%, #3d1822 60%, #2d1018 100%)',
    nodeC: 'rgba(232,196,104,',
    threadC: 'rgba(232,196,104,0.06)',
    beam: 'rgba(232,196,104,0.04)',
    horizon: 'rgba(232,196,104,0.03)',
    geoC: 'rgba(232,196,104,0.02)',
    focusC: 'rgba(255,230,140,',
    frameC: 'rgba(232,196,104,0.12)',
  },
};

interface Node {
  y: number;
  r: number;
  alpha: number;
  drift: number;
  dur: number;
  delay: number;
  symbol: 'dot' | 'open' | 'compound';
}

interface Thread {
  x: number;
  endY: number;
  nodes: Node[];
}

interface Stray {
  x: number;
  y: number;
  r: number;
  alpha: number;
  drift: number;
  dur: number;
  delay: number;
  symbol: 'dot' | 'open';
}

interface Structure {
  threads: Thread[];
  strays: Stray[];
  focus: { x: number; y: number; r: number };
  srcX: number;
}

function buildStructure(): Structure {
  const srcX = 40 + Math.random() * 20;
  const srcY = 6;
  const threads: Thread[] = [];
  for (let i = 0; i < 24; i++) {
    const r1 = Math.random();
    const r2 = Math.random();
    const g = Math.sqrt(-2 * Math.log(r1)) * Math.cos(2 * Math.PI * r2);
    const x = srcX + g * 18;
    if (x < 2 || x > 98) continue;
    const distFromSrc = Math.abs(x - srcX) / 50;
    const maxLen = 65 - distFromSrc * 30;
    const endY = srcY + 8 + Math.random() * Math.max(10, maxLen);
    const nodeCountBase =
      distFromSrc < 0.3 ? 4 : distFromSrc < 0.6 ? 2 : 1;
    const nc = Math.max(1, nodeCountBase + Math.floor(Math.random() * 2));
    const nodes: Node[] = [];
    const syms: Node['symbol'][] = ['dot', 'open', 'compound'];
    for (let n = 0; n < nc; n++) {
      const ny = srcY + (0.05 + Math.random() * 0.85) * (endY - srcY);
      const distFromBeam = (ny - srcY) / (endY - srcY);
      const sizesNear = [4, 5, 6, 7, 8];
      const sizesFar = [2, 3, 3, 4];
      const sizes = distFromBeam < 0.4 ? sizesNear : sizesFar;
      const r = sizes[Math.floor(Math.random() * sizes.length)];
      const alpha =
        distFromBeam < 0.3
          ? 0.25 + Math.random() * 0.2
          : distFromBeam < 0.6
            ? 0.15 + Math.random() * 0.15
            : 0.06 + Math.random() * 0.1;
      nodes.push({
        y: ny,
        r,
        alpha,
        drift: 1 + Math.random() * (distFromBeam * 6),
        dur: 18 + Math.random() * 25,
        delay: Math.random() * 20,
        symbol: syms[Math.floor(Math.random() * syms.length)],
      });
    }
    threads.push({ x, endY, nodes });
  }
  const strays: Stray[] = [];
  for (let i = 0; i < 8; i++) {
    strays.push({
      x: 5 + Math.random() * 90,
      y: 15 + Math.random() * 50,
      r: 2 + Math.random() * 2,
      alpha: 0.04 + Math.random() * 0.06,
      drift: 2 + Math.random() * 4,
      dur: 25 + Math.random() * 15,
      delay: Math.random() * 20,
      symbol: (['dot', 'open'] as const)[Math.floor(Math.random() * 2)],
    });
  }
  return {
    threads,
    strays,
    focus: { x: srcX, y: srcY + 12, r: 9 },
    srcX,
  };
}

function DecorNode({
  x,
  y,
  r,
  alpha,
  drift,
  dur,
  delay,
  nodeC,
  symbol,
  isSennya,
  keyframeName,
}: {
  x: number;
  y: number;
  r: number;
  alpha: number;
  drift: number;
  dur: number;
  delay: number;
  nodeC: string;
  symbol: 'dot' | 'open' | 'compound';
  isSennya: boolean;
  keyframeName: string;
}) {
  let inner: React.ReactNode;
  if (isSennya) {
    if (symbol === 'dot')
      inner = (
        <div
          style={{
            width: r,
            height: r,
            borderRadius: '50%',
            background: `${nodeC}${alpha})`,
          }}
        />
      );
    else if (symbol === 'open')
      inner = (
        <div
          style={{
            width: r * 1.3,
            height: r * 1.3,
            borderRadius: '50%',
            border: `0.7px solid ${nodeC}${alpha})`,
          }}
        />
      );
    else
      inner = (
        <>
          <div
            style={{
              position: 'absolute',
              width: r * 0.5,
              height: r * 0.5,
              borderRadius: '50%',
              background: `${nodeC}${alpha})`,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
            }}
          />
          <div
            style={{
              width: r * 1.5,
              height: r * 1.5,
              borderRadius: '50%',
              border: `0.5px solid ${nodeC}${alpha * 0.5})`,
            }}
          />
        </>
      );
  } else {
    if (symbol === 'dot')
      inner = (
        <div
          style={{
            width: r * 0.7,
            height: r * 0.7,
            borderRadius: '50%',
            background: `${nodeC}${alpha})`,
          }}
        />
      );
    else if (symbol === 'open')
      inner = (
        <div
          style={{
            width: r * 1.1,
            height: r * 1.1,
            border: `0.7px solid ${nodeC}${alpha})`,
            transform: 'rotate(45deg)',
          }}
        />
      );
    else
      inner = (
        <div
          style={{
            width: r,
            height: r,
            background: `${nodeC}${alpha})`,
            transform: 'rotate(45deg)',
          }}
        />
      );
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%,-50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: `${keyframeName} ${dur}s ease-in-out ${delay}s infinite`,
        pointerEvents: 'none',
        ['--drift' as string]: `${drift}px`,
      } as React.CSSProperties}
    >
      {inner}
    </div>
  );
}

function GeometricBg({
  color,
  variant,
}: {
  color: string;
  variant: BedroomDecorVariant;
}) {
  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      preserveAspectRatio="none"
      viewBox="0 0 430 900"
    >
      {variant === 'sennya' ? (
        <>
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => {
            const rad = (a * Math.PI) / 180;
            const cx = 215,
              cy = 50,
              r1 = 30,
              r2 = 140,
              r3 = 220;
            return (
              <g key={a}>
                <line
                  x1={cx + Math.cos(rad) * r1}
                  y1={cy + Math.sin(rad) * r1}
                  x2={cx + Math.cos(rad) * r2}
                  y2={cy + Math.sin(rad) * r2}
                  stroke={color}
                  strokeWidth={a % 60 === 0 ? '0.4' : '0.2'}
                />
                {a % 60 === 0 && (
                  <line
                    x1={cx + Math.cos(rad) * r2}
                    y1={cy + Math.sin(rad) * r2}
                    x2={cx + Math.cos(rad) * r3}
                    y2={cy + Math.sin(rad) * r3}
                    stroke={color}
                    strokeWidth="0.15"
                  />
                )}
              </g>
            );
          })}
          {[50, 90, 140].map((r, i) => (
            <circle
              key={i}
              cx="215"
              cy="50"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={0.35 - i * 0.08}
            />
          ))}
          <path d="M 0 0 Q 50 0 50 50" fill="none" stroke={color} strokeWidth="0.25" />
          <path d="M 0 0 Q 70 0 70 70" fill="none" stroke={color} strokeWidth="0.15" />
          <path d="M 430 0 Q 380 0 380 50" fill="none" stroke={color} strokeWidth="0.25" />
          <path d="M 430 0 Q 360 0 360 70" fill="none" stroke={color} strokeWidth="0.15" />
          <path d="M 0 900 Q 50 900 50 850" fill="none" stroke={color} strokeWidth="0.15" />
          <path d="M 430 900 Q 380 900 380 850" fill="none" stroke={color} strokeWidth="0.15" />
        </>
      ) : (
        <>
          {[
            { cx: 0, cy: 0 },
            { cx: 430, cy: 0 },
            { cx: 0, cy: 900 },
            { cx: 430, cy: 900 },
          ].map((corner, ci) => {
            const angles =
              ci < 2 ? [0, 15, 30, 45, 60, 75, 90] : [270, 285, 300, 315, 330, 345, 360];
            return (
              <g key={ci}>
                {angles.map((a, ai) => {
                  const rad = (a * Math.PI) / 180;
                  return (
                    <line
                      key={ai}
                      x1={corner.cx + Math.cos(rad) * 20}
                      y1={corner.cy + Math.sin(rad) * 20}
                      x2={corner.cx + Math.cos(rad) * (100 + ai * 5)}
                      y2={corner.cy + Math.sin(rad) * (100 + ai * 5)}
                      stroke={color}
                      strokeWidth={ai === 3 ? '0.35' : '0.2'}
                    />
                  );
                })}
                {[40, 70, 100].map((r, ri) => (
                  <circle
                    key={ri}
                    cx={corner.cx}
                    cy={corner.cy}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={0.3 - ri * 0.07}
                  />
                ))}
              </g>
            );
          })}
          {Array.from({ length: 9 }).map((_, i) => {
            const cx = 45 + i * 45,
              s = 14;
            return (
              <path
                key={i}
                d={`M ${cx} ${50 - s} L ${cx + s} 50 L ${cx} ${50 + s} L ${cx - s} 50 Z`}
                fill="none"
                stroke={color}
                strokeWidth={i === 4 ? '0.35' : '0.2'}
              />
            );
          })}
        </>
      )}
    </svg>
  );
}

function CornerFrame({ color }: { color: string }) {
  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      preserveAspectRatio="none"
      viewBox="0 0 430 900"
    >
      <path d="M 0 80 Q 0 0 80 0" fill="none" stroke={color} strokeWidth="0.6" />
      <path d="M 0 120 Q 0 20 100 0" fill="none" stroke={color} strokeWidth="0.4" opacity="0.5" />
      <path d="M 430 80 Q 430 0 350 0" fill="none" stroke={color} strokeWidth="0.6" />
      <path d="M 430 120 Q 430 20 330 0" fill="none" stroke={color} strokeWidth="0.4" opacity="0.5" />
      <line x1="2" y1="80" x2="2" y2="820" stroke={color} strokeWidth="0.3" opacity="0.3" />
      <line x1="428" y1="80" x2="428" y2="820" stroke={color} strokeWidth="0.3" opacity="0.3" />
      <path d="M 0 820 Q 0 900 80 900" fill="none" stroke={color} strokeWidth="0.5" opacity="0.4" />
      <path d="M 430 820 Q 430 900 350 900" fill="none" stroke={color} strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
}

function Lotus({ color }: { color: string }) {
  return (
    <svg width="24" height="16" viewBox="0 0 24 16">
      <ellipse cx="12" cy="12" rx="3" ry="10" fill="none" stroke={color} strokeWidth="0.5" />
      <ellipse cx="12" cy="12" rx="3" ry="10" fill="none" stroke={color} strokeWidth="0.4" transform="rotate(-20 12 12)" />
      <ellipse cx="12" cy="12" rx="3" ry="10" fill="none" stroke={color} strokeWidth="0.3" transform="rotate(-40 12 12)" />
      <ellipse cx="12" cy="12" rx="3" ry="10" fill="none" stroke={color} strokeWidth="0.4" transform="rotate(20 12 12)" />
      <ellipse cx="12" cy="12" rx="3" ry="10" fill="none" stroke={color} strokeWidth="0.3" transform="rotate(40 12 12)" />
      <circle cx="12" cy="8" r="0.8" fill={color} />
    </svg>
  );
}

/** Decoration overlay. Renders absolute-positioned children inside its
 *  parent. Parent should be `position: relative; overflow: hidden`. */
export default function BedroomDecor({ variant }: { variant: BedroomDecorVariant }) {
  const struct = useMemo(() => buildStructure(), []);
  const t = BEDROOM_DECOR_TOKENS[variant];
  const isSennya = variant === 'sennya';
  // Single keyframe for all nodes — each node sets its own --drift via inline style.
  const kf = 'bedroomNodeDrift';

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: t.bgGrad,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <GeometricBg color={t.geoC} variant={variant} />

        {isSennya ? (
          <>
            <div
              style={{
                position: 'absolute',
                top: '-20%',
                right: '-10%',
                width: '45%',
                height: '90%',
                background:
                  'linear-gradient(210deg, rgba(140,130,210,0.06) 0%, transparent 60%)',
                transform: 'rotate(-5deg)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '-10%',
                right: '5%',
                width: '30%',
                height: '80%',
                background:
                  'linear-gradient(200deg, rgba(160,150,230,0.04) 0%, transparent 50%)',
                transform: 'rotate(-12deg)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '-5%',
                right: '20%',
                width: '20%',
                height: '70%',
                background:
                  'linear-gradient(195deg, rgba(180,170,240,0.03) 0%, transparent 45%)',
                transform: 'rotate(-18deg)',
              }}
            />
            {[12, 28, 45, 58, 72, 85].map((left, i) => (
              <div
                key={`veil${i}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${left}%`,
                  width: '1px',
                  height: '100%',
                  background: `linear-gradient(180deg, rgba(160,150,220,${0.03 + i * 0.005}) 0%, rgba(160,150,220,0.01) 60%, transparent 100%)`,
                }}
              />
            ))}
          </>
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                bottom: '-10%',
                left: '10%',
                width: '80%',
                height: '50%',
                background:
                  'radial-gradient(ellipse at 50% 90%, rgba(200,140,60,0.04) 0%, transparent 60%)',
              }}
            />
            {t.frameC && <CornerFrame color={t.frameC} />}
          </>
        )}

        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <line x1="3%" y1="5%" x2="97%" y2="5%" stroke={t.beam} strokeWidth="0.5" />
          {struct.threads.map((th, i) => (
            <line
              key={i}
              x1={`${th.x}%`}
              y1="5%"
              x2={`${th.x}%`}
              y2={`${th.endY}%`}
              stroke={t.threadC}
              strokeWidth="0.5"
            />
          ))}
          <line x1="6%" y1="83%" x2="94%" y2="83%" stroke={t.horizon} strokeWidth="0.5" />
        </svg>

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {struct.threads.map((th, ti) =>
            th.nodes.map((n, ni) => (
              <DecorNode
                key={`${ti}-${ni}`}
                x={th.x}
                y={n.y}
                r={n.r}
                alpha={n.alpha}
                drift={n.drift}
                dur={n.dur}
                delay={n.delay}
                nodeC={t.nodeC}
                symbol={n.symbol}
                isSennya={isSennya}
                keyframeName={kf}
              />
            )),
          )}
          <div
            style={{
              position: 'absolute',
              left: `${struct.focus.x}%`,
              top: `${struct.focus.y}%`,
              transform: 'translate(-50%,-50%)',
              pointerEvents: 'none',
            }}
          >
            {isSennya ? (
              <>
                <div
                  style={{
                    width: struct.focus.r,
                    height: struct.focus.r,
                    borderRadius: '50%',
                    background: `${t.focusC}0.35)`,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: 'auto',
                    width: struct.focus.r * 2.5,
                    height: struct.focus.r * 2.5,
                    borderRadius: '50%',
                    border: `0.5px solid ${t.focusC}0.06)`,
                  }}
                />
              </>
            ) : (
              <>
                <div
                  style={{
                    width: struct.focus.r,
                    height: struct.focus.r,
                    background: `${t.focusC}0.25)`,
                    transform: 'rotate(45deg)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: 'auto',
                    width: struct.focus.r * 2,
                    height: struct.focus.r * 2,
                    border: `0.5px solid ${t.focusC}0.05)`,
                    transform: 'rotate(45deg)',
                  }}
                />
              </>
            )}
          </div>
          {struct.strays.map((s, i) => (
            <DecorNode
              key={`s${i}`}
              x={s.x}
              y={s.y}
              r={s.r}
              alpha={s.alpha}
              drift={s.drift}
              dur={s.dur}
              delay={s.delay}
              nodeC={t.nodeC}
              symbol={s.symbol}
              isSennya={isSennya}
              keyframeName={kf}
            />
          ))}
        </div>

        {!isSennya && (
          <div
            style={{
              position: 'absolute',
              bottom: 68,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                flex: 1,
                height: '1px',
                margin: '0 20px',
                background: `linear-gradient(90deg, transparent, ${t.frameC ?? 'transparent'}, transparent)`,
              }}
            />
            <Lotus color="rgba(232,196,104,0.15)" />
            <div
              style={{
                flex: 1,
                height: '1px',
                margin: '0 20px',
                background: `linear-gradient(90deg, transparent, ${t.frameC ?? 'transparent'}, transparent)`,
              }}
            />
          </div>
        )}
      </div>
      <style>{`@keyframes ${kf}{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(var(--drift,3px))}}`}</style>
    </>
  );
}

/** Map the persisted BedroomTheme id to the decoration variant.
 *  Only midnight and pomegranate get the heavy mockup decoration;
 *  other themes (wisteria, moss) keep the original minimal styling. */
export function decorVariantForTheme(themeId: string | undefined): BedroomDecorVariant | null {
  if (themeId === 'midnight') return 'sennya';
  if (themeId === 'pomegranate') return 'pomegranate';
  return null;
}
