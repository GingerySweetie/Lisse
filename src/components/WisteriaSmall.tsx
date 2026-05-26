/** A smaller, simpler wisteria glyph used in the Home greeting area
 *  (between the elaborate empty-state mark and the inline icon).
 *  Two clusters, no animations. ~32x40 viewBox. */
export default function WisteriaSmall({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 32 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 0C15 4,14 7,13 10"
        stroke="#8aab7e"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse
        cx="10"
        cy="5"
        rx="3.5"
        ry="1.5"
        transform="rotate(-25 10 5)"
        fill="#8faa7e"
        opacity=".7"
      />
      <ellipse
        cx="21"
        cy="4"
        rx="3"
        ry="1.3"
        transform="rotate(20 21 4)"
        fill="#96ad85"
        opacity=".6"
      />
      {[
        [12, 11, 2.8, '#e4d0ee', 0.6],
        [15, 14, 2.6, '#d8bce5', 0.7],
        [12, 17, 2.4, '#ccaade', 0.75],
        [14, 20, 2.2, '#c098d6', 0.8],
        [13, 23, 2, '#b488cc', 0.85],
        [14, 26, 1.7, '#a878c2', 0.9],
      ].map(([cx, cy, r, f, o], i) => (
        <circle
          key={i}
          cx={cx as number}
          cy={cy as number}
          r={r as number}
          fill={f as string}
          opacity={o as number}
        />
      ))}
      {[
        [19, 12, 2.4, '#e0c8ea', 0.55],
        [20, 15, 2.3, '#d4b6e0', 0.65],
        [19, 18, 2, '#c8a4d8', 0.7],
        [20, 21, 1.7, '#bc92ce', 0.8],
      ].map(([cx, cy, r, f, o], i) => (
        <circle
          key={`r${i}`}
          cx={cx as number}
          cy={cy as number}
          r={r as number}
          fill={f as string}
          opacity={o as number}
        />
      ))}
    </svg>
  );
}
