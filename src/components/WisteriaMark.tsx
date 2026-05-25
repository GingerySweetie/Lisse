/**
 * The Wisteria emblem. Two presentations:
 *
 *   - `tone="soft"` (default): the full 3-cluster hanging logo with
 *     hand-drawn vines, leaves, and gently animated petals. Used as the
 *     empty-state centerpiece. ~120x168 viewBox so it reads as a hanging
 *     flower, not a sphere.
 *
 *   - `tone="inline"`: a compact glyph (24x24) for sidebar wordmarks and
 *     UI accents. One cluster, no animations.
 *
 * SMIL animations inside `<animate>` work on all modern Chromium browsers
 * (Android Chrome + Safari 14+). They idle when the tab is hidden so they
 * don't burn battery.
 */
export default function WisteriaMark({
  size = 120,
  tone = 'soft',
  className,
}: {
  size?: number;
  tone?: 'soft' | 'inline';
  className?: string;
}) {
  if (tone === 'inline') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M12 2 C11 6, 10 8, 9 11"
          stroke="#7d6b7d"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="8" cy="10" r="2.5" fill="#9d6ebd" opacity="0.5" />
        <circle cx="11" cy="12" r="2.5" fill="#9d6ebd" opacity="0.6" />
        <circle cx="9" cy="14.5" r="2.2" fill="#9d6ebd" opacity="0.7" />
        <circle cx="12" cy="16" r="2" fill="#9d6ebd" opacity="0.8" />
        <circle cx="10" cy="18.5" r="1.5" fill="#9d6ebd" opacity="0.85" />
        <circle cx="11" cy="20.5" r="1" fill="#9d6ebd" opacity="0.9" />
        <ellipse
          cx="7"
          cy="5"
          rx="3"
          ry="1.5"
          transform="rotate(-30 7 5)"
          fill="#8faa7e"
          opacity="0.7"
        />
        <ellipse
          cx="15"
          cy="7"
          rx="3"
          ry="1.5"
          transform="rotate(20 15 7)"
          fill="#96ad85"
          opacity="0.7"
        />
      </svg>
    );
  }

  // Full hanging logo: 120x168 viewBox keeps a 5:7 aspect ratio.
  const cluster1 = [
    { cx: 42, cy: 38, r: 5.5, fill: '#e8d5f0', opacity: 0.7 },
    { cx: 38, cy: 44, r: 5, fill: '#ddc4e8', opacity: 0.75 },
    { cx: 44, cy: 44, r: 4.5, fill: '#dfc8ea', opacity: 0.7 },
    { cx: 36, cy: 51, r: 5, fill: '#d4b5e0', opacity: 0.8 },
    { cx: 42, cy: 52, r: 5.5, fill: '#cfade0', opacity: 0.8 },
    { cx: 34, cy: 58, r: 4.5, fill: '#c49ed8', opacity: 0.85 },
    { cx: 40, cy: 60, r: 5, fill: '#c49ed8', opacity: 0.8 },
    { cx: 36, cy: 66, r: 4.5, fill: '#b88ed0', opacity: 0.85 },
    { cx: 42, cy: 67, r: 4, fill: '#b68cce', opacity: 0.85 },
    { cx: 38, cy: 73, r: 4, fill: '#a97cc6', opacity: 0.9 },
    { cx: 34, cy: 78, r: 3.5, fill: '#9d6ebd', opacity: 0.9 },
    { cx: 40, cy: 79, r: 3, fill: '#9b6cbb', opacity: 0.85 },
    { cx: 36, cy: 84, r: 3, fill: '#9060b5', opacity: 0.9 },
    { cx: 38, cy: 89, r: 2.5, fill: '#8555ad', opacity: 0.9 },
    { cx: 36, cy: 93, r: 2, fill: '#7a4aa5', opacity: 0.9 },
    { cx: 37, cy: 97, r: 1.5, fill: '#6f3f9d', opacity: 0.85 },
  ];
  const cluster2 = [
    { cx: 58, cy: 52, r: 5, fill: '#e4ceed', opacity: 0.7 },
    { cx: 62, cy: 52, r: 4.5, fill: '#e0c8ea', opacity: 0.65 },
    { cx: 56, cy: 58, r: 5.5, fill: '#d8bce5', opacity: 0.8 },
    { cx: 62, cy: 59, r: 5, fill: '#d5b7e2', opacity: 0.75 },
    { cx: 58, cy: 65, r: 5, fill: '#caa8dc', opacity: 0.85 },
    { cx: 54, cy: 70, r: 4.5, fill: '#c09ed6', opacity: 0.85 },
    { cx: 60, cy: 71, r: 5, fill: '#be9ad4', opacity: 0.85 },
    { cx: 56, cy: 77, r: 4.5, fill: '#b38ccc', opacity: 0.9 },
    { cx: 62, cy: 78, r: 4, fill: '#b08acc', opacity: 0.85 },
    { cx: 58, cy: 83, r: 4, fill: '#a57cc4', opacity: 0.9 },
    { cx: 56, cy: 88, r: 3.5, fill: '#9a6ebc', opacity: 0.9 },
    { cx: 60, cy: 90, r: 3, fill: '#976bba', opacity: 0.9 },
    { cx: 57, cy: 95, r: 2.5, fill: '#8c5eb2', opacity: 0.9 },
    { cx: 58, cy: 100, r: 2, fill: '#8254aa', opacity: 0.9 },
    { cx: 57, cy: 104, r: 1.5, fill: '#784ca2', opacity: 0.85 },
  ];
  const cluster3 = [
    { cx: 74, cy: 48, r: 5, fill: '#e6d0ee', opacity: 0.65 },
    { cx: 78, cy: 54, r: 5, fill: '#dcc2e7', opacity: 0.75 },
    { cx: 72, cy: 55, r: 4.5, fill: '#d9bde5', opacity: 0.7 },
    { cx: 76, cy: 61, r: 5, fill: '#ceaede', opacity: 0.8 },
    { cx: 74, cy: 67, r: 4.5, fill: '#c4a0d6', opacity: 0.85 },
    { cx: 78, cy: 68, r: 4, fill: '#c19dd4', opacity: 0.8 },
    { cx: 75, cy: 74, r: 4.5, fill: '#b790cc', opacity: 0.85 },
    { cx: 72, cy: 79, r: 4, fill: '#ac82c5', opacity: 0.9 },
    { cx: 76, cy: 81, r: 3.5, fill: '#a97fc2', opacity: 0.85 },
    { cx: 74, cy: 86, r: 3, fill: '#9e72bb', opacity: 0.9 },
    { cx: 75, cy: 91, r: 2.5, fill: '#9366b4', opacity: 0.9 },
    { cx: 74, cy: 95, r: 2, fill: '#885aac', opacity: 0.9 },
    { cx: 74, cy: 99, r: 1.5, fill: '#7e50a4', opacity: 0.85 },
  ];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size * 1.4}
      viewBox="0 0 120 168"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Main vine */}
      <path
        d="M60 0 C58 12, 55 20, 52 30 C48 42, 54 48, 56 56 C58 64, 55 72, 54 80"
        stroke="#7d6b7d"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Side branches */}
      <path
        d="M52 30 C44 34, 38 32, 32 28"
        stroke="#7d6b7d"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M56 56 C48 60, 40 58, 34 54"
        stroke="#7d6b7d"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M54 42 C62 46, 68 44, 74 40"
        stroke="#7d6b7d"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Leaves */}
      <ellipse cx="28" cy="26" rx="8" ry="4" transform="rotate(-30 28 26)" fill="#8faa7e" opacity="0.8" />
      <ellipse cx="24" cy="30" rx="7" ry="3.5" transform="rotate(-20 24 30)" fill="#a0b88e" opacity="0.7" />
      <ellipse cx="76" cy="38" rx="8" ry="4" transform="rotate(25 76 38)" fill="#8faa7e" opacity="0.8" />
      <ellipse cx="80" cy="42" rx="7" ry="3.5" transform="rotate(15 80 42)" fill="#a0b88e" opacity="0.7" />
      <ellipse cx="30" cy="52" rx="7" ry="3.5" transform="rotate(-15 30 52)" fill="#96ad85" opacity="0.7" />

      {/* Left cluster — gentle vertical drift */}
      <g>
        {cluster1.map((p, i) => (
          <circle key={`l${i}`} {...p}>
            <animate
              attributeName="cy"
              values={`${p.cy};${p.cy + 1.5};${p.cy}`}
              dur={`${3 + i * 0.2}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </g>

      {/* Center cluster */}
      <g>
        {cluster2.map((p, i) => (
          <circle key={`c${i}`} {...p}>
            <animate
              attributeName="cy"
              values={`${p.cy};${p.cy + 2};${p.cy}`}
              dur={`${3.5 + i * 0.15}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </g>

      {/* Right cluster */}
      <g>
        {cluster3.map((p, i) => (
          <circle key={`r${i}`} {...p}>
            <animate
              attributeName="cy"
              values={`${p.cy};${p.cy + 1.8};${p.cy}`}
              dur={`${3.2 + i * 0.18}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </g>

      {/* Falling petals */}
      <circle cx="30" cy="100" r="2" fill="#c49ed8" opacity="0.4">
        <animate attributeName="cy" values="100;108;100" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.15;0.4" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="65" cy="112" r="1.8" fill="#b88ed0" opacity="0.35">
        <animate attributeName="cy" values="112;118;112" dur="4.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0.1;0.35" dur="4.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="106" r="1.5" fill="#a97cc6" opacity="0.3">
        <animate attributeName="cy" values="106;114;106" dur="5s" repeatCount="indefinite" />
      </circle>
      <circle cx="80" cy="105" r="1.3" fill="#9d6ebd" opacity="0.25">
        <animate attributeName="cy" values="105;112;105" dur="3.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
