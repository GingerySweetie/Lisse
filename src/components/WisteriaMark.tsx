/**
 * The wisteria emblem used across the app — empty state, sidebar wordmark,
 * loading states. Same silhouette as public/favicon.svg.
 *
 * `size` is the viewBox-pixel-equivalent rendered size; pass any number.
 * `tone` controls how saturated the cluster reads: 'soft' (default,
 * empty state / large surfaces) vs 'inline' (smaller, sidebar wordmark).
 */
export default function WisteriaMark({
  size = 64,
  tone = 'soft',
  className,
}: {
  size?: number;
  tone?: 'soft' | 'inline';
  className?: string;
}) {
  const opacity = tone === 'soft' ? 0.85 : 1;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{ opacity }}
    >
      <defs>
        <radialGradient id="wm-hl" cx="0.35" cy="0.3" r="0.6">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Two leaves at the top, splayed like a wisteria peduncle */}
      <ellipse
        cx="29"
        cy="9"
        rx="3"
        ry="1.6"
        fill="#9CCFBC"
        transform="rotate(-32 29 9)"
      />
      <ellipse
        cx="35"
        cy="9"
        rx="3"
        ry="1.6"
        fill="#7FB8A3"
        transform="rotate(32 35 9)"
      />

      {/* Stem curving down into the cluster */}
      <path
        d="M32 11 Q 31 16 32 20"
        stroke="#7FB8A3"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />

      {/* Cluster rows: light at top, deeper toward the tip */}
      <circle cx="26" cy="22" r="4.6" fill="#DDC9EA" />
      <circle cx="38" cy="22" r="4.6" fill="#D4BEE3" />
      <circle cx="32" cy="20" r="4.2" fill="#E5D4EE" />
      <circle cx="24" cy="29" r="4.2" fill="#C7AADC" />
      <circle cx="40" cy="29" r="4.2" fill="#BB9FD2" />
      <circle cx="32" cy="28" r="4.6" fill="#C0A4D6" />
      <circle cx="27" cy="37" r="3.8" fill="#A988C5" />
      <circle cx="37" cy="37" r="3.8" fill="#A07FBC" />
      <circle cx="32" cy="38" r="4" fill="#9F7EBA" />
      <circle cx="29" cy="45" r="3.2" fill="#8B6BA7" />
      <circle cx="35" cy="45" r="3.2" fill="#85659E" />
      <circle cx="31" cy="52" r="2.6" fill="#705690" />
      <circle cx="35" cy="53" r="2.2" fill="#65497F" />
      <circle cx="33" cy="58" r="1.7" fill="#523B6C" />

      <ellipse cx="29" cy="22" rx="6" ry="4" fill="url(#wm-hl)" />
    </svg>
  );
}
