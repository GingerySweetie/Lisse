import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConfessionEntry } from '../types';
import {
  RIRICHAN_ID,
  approachConfession,
  getYesterdayConfession,
  listConfessionArchives,
} from '../lib/confession';
import { setStatusBarColor, resetStatusBar } from '../lib/status-bar';

type Phase =
  | 'idle'
  | 'approaching'
  | 'sealed'
  | 'caught-flash'
  | 'confessing'
  | 'enacting'
  | 'aftermath';

type View = 'booth' | 'archive';

/** Natural article paragraphs — not poetry line breaks. */
function toParagraphs(text: string): string[] {
  const raw = text.replace(/\r/g, '').trim();
  if (!raw) return [];
  const byBreak = raw
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, '').trim())
    .filter(Boolean);
  if (byBreak.length > 1) return byBreak;

  const sentences = raw
    .replace(/\n+/g, '')
    .split(/(?<=[。！？…])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 2) return [raw.replace(/\n+/g, '')];

  const paras: string[] = [];
  let buf = '';
  for (const s of sentences) {
    buf += s;
    if (buf.length >= 72) {
      paras.push(buf);
      buf = '';
    }
  }
  if (buf) paras.push(buf);
  return paras;
}

function StarDivider() {
  return (
    <div className="cf-divider" aria-hidden>
      <i className="cf-divider-line" />
      <svg viewBox="0 0 20 20" width="10" height="10">
        <path
          d="M10 1.2 L11.8 8.2 L18.8 10 L11.8 11.8 L10 18.8 L8.2 11.8 L1.2 10 L8.2 8.2 Z"
          fill="none"
          stroke="rgba(255,255,255,0.78)"
          strokeWidth="1.15"
        />
      </svg>
      <i className="cf-divider-line" />
    </div>
  );
}

function StarCurtain() {
  const lines = useMemo(() => {
    const out: { x: number; delay: number; dur: number }[] = [];
    for (let i = 0; i < 42; i++) {
      out.push({
        x: 2.5 + (i / 41) * 95,
        delay: (i * 0.14) % 3.5,
        dur: 2.1 + (i % 7) * 0.28,
      });
    }
    return out;
  }, []);

  const sparks = useMemo(() => {
    const seed: Array<[number, number, number, 'dot' | 'cross']> = [
      [12, 14, 2.5, 'dot'], [28, 22, 6, 'cross'], [44, 11, 2, 'dot'],
      [58, 30, 5, 'cross'], [72, 16, 2.5, 'dot'], [86, 26, 3, 'dot'],
      [18, 40, 5, 'cross'], [36, 48, 2, 'dot'], [52, 36, 2.5, 'dot'],
      [66, 52, 6, 'cross'], [80, 42, 2, 'dot'], [10, 58, 3, 'dot'],
      [24, 66, 5, 'cross'], [40, 60, 2, 'dot'], [56, 70, 2.5, 'dot'],
      [70, 64, 5, 'cross'], [84, 74, 2, 'dot'], [14, 78, 2.5, 'dot'],
      [32, 82, 3, 'dot'], [48, 20, 5, 'cross'], [62, 78, 2, 'dot'],
      [76, 56, 2.5, 'dot'], [90, 48, 5, 'cross'], [22, 32, 2, 'dot'],
      [46, 54, 3, 'dot'], [68, 24, 2.5, 'dot'], [38, 74, 5, 'cross'],
      [54, 44, 2, 'dot'], [78, 18, 3, 'dot'], [30, 56, 2.5, 'dot'],
    ];
    return seed.map(([x, y, size, kind], i) => ({
      x,
      y,
      size,
      kind,
      delay: (i * 0.19) % 4,
    }));
  }, []);

  return (
    <div className="cf-curtain" aria-hidden>
      <svg className="cf-curtain-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lines.map((l, i) => (
          <line
            key={i}
            className="cf-curtain-line"
            x1={l.x}
            y1="0"
            x2={l.x}
            y2="100"
            style={{
              animationDelay: `${l.delay}s`,
              animationDuration: `${l.dur}s`,
            }}
          />
        ))}
      </svg>
      {sparks.map((s, i) => (
        <span
          key={i}
          className={s.kind === 'cross' ? 'cf-spark cf-spark--cross' : 'cf-spark cf-spark--dot'}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * 1:1 reference booth:
 * - enter: grounded arch + flashing star curtain only (no input bar, no copy)
 * - triggered: natural paragraphs inside the arch with star dividers
 */
export default function ConfessionPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('booth');
  const [phase, setPhase] = useState<Phase>('idle');
  const [entry, setEntry] = useState<ConfessionEntry | null>(null);
  const [enactIdx, setEnactIdx] = useState(0);
  const [yesterday, setYesterday] = useState<ConfessionEntry | null>(null);
  const [archives, setArchives] = useState<ConfessionEntry[]>([]);
  const [archiveFocus, setArchiveFocus] = useState<ConfessionEntry | null>(null);

  useEffect(() => {
    void setStatusBarColor('#000000', false);
    return () => {
      void resetStatusBar();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const y = await getYesterdayConfession(RIRICHAN_ID);
      setYesterday(y ?? null);
      setArchives(await listConfessionArchives(RIRICHAN_ID, { limit: 21 }));
    })();
  }, [phase]);

  function resetIdle() {
    setPhase('idle');
    setEntry(null);
    setEnactIdx(0);
  }

  async function handleApproach(forced = false) {
    if (phase === 'approaching') return;
    setPhase('approaching');
    try {
      const result = await approachConfession({ force: forced });
      if (result.kind === 'sealed') {
        setPhase('sealed');
        return;
      }
      setEntry(result.entry);
      setPhase('caught-flash');
      window.setTimeout(() => setPhase('confessing'), 900);
    } catch {
      setPhase('sealed');
    }
  }

  function onBoothActivate() {
    if (phase === 'idle' || phase === 'sealed') {
      void handleApproach(false);
      return;
    }
    if (phase === 'approaching' || phase === 'caught-flash') return;
    if (phase === 'confessing') {
      setEnactIdx(0);
      setPhase('enacting');
      return;
    }
    if (phase === 'enacting' && entry) {
      if (enactIdx + 1 >= entry.enact.length) setPhase('aftermath');
      else setEnactIdx((n) => n + 1);
      return;
    }
    if (phase === 'aftermath') resetIdle();
  }

  const triggered =
    phase === 'caught-flash' ||
    phase === 'confessing' ||
    phase === 'enacting' ||
    phase === 'aftermath';

  const prose = useMemo(() => {
    if (phase === 'confessing' && entry) return toParagraphs(entry.confession);
    if (phase === 'enacting' && entry) {
      return toParagraphs(entry.enact[enactIdx] ?? '');
    }
    if (phase === 'aftermath' && entry) return toParagraphs(entry.after);
    return [] as string[];
  }, [phase, entry, enactIdx]);

  // Long-press / triple-tap corner opens archive without chrome.
  function onCornerArchive() {
    setView('archive');
    setArchiveFocus(yesterday);
  }

  if (view === 'archive') {
    const shown = archiveFocus ?? yesterday ?? archives[0] ?? null;
    return (
      <div className="cf-root">
        <style>{CSS}</style>
        <button type="button" className="cf-hit-back" onClick={() => setView('booth')} />
        <button
          type="button"
          className="cf-booth"
          onClick={() => setView('booth')}
        >
          <ArchSvg lit />
          <div className="cf-well">
            <div className="cf-prose">
              {archives.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`cf-chip ${shown?.id === a.id ? 'cf-chip--on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setArchiveFocus(a);
                  }}
                >
                  {a.date.slice(5)}
                </button>
              ))}
              {shown &&
                toParagraphs(shown.confession).map((p, i) => (
                  <div key={i}>
                    {i > 0 && <StarDivider />}
                    <p className="cf-para">{p}</p>
                  </div>
                ))}
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="cf-root">
      <style>{CSS}</style>

      {/* invisible app exits — not part of the visual design */}
      <button
        type="button"
        className="cf-hit-back"
        aria-label="返回"
        onClick={() => navigate('/home')}
      />
      <button
        type="button"
        className="cf-hit-archive"
        aria-label="档案"
        onClick={onCornerArchive}
      />

      <button
        type="button"
        className={`cf-booth ${phase === 'approaching' ? 'cf-booth--pulse' : ''}`}
        onClick={onBoothActivate}
        aria-label="告解室"
      >
        <ArchSvg lit={triggered || phase === 'approaching'} />

        <div className="cf-well">
          {!triggered && <StarCurtain />}

          {triggered && prose.length > 0 && (
            <div className="cf-prose">
              {prose.map((p, i) => (
                <div key={`${phase}-${enactIdx}-${i}`}>
                  {i > 0 && <StarDivider />}
                  <p className="cf-para">{p}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

function ArchSvg({ lit }: { lit: boolean }) {
  return (
    <>
      <svg
        className="cf-arch"
        viewBox="0 0 300 640"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* outer — legs run to the ground (y=640) */}
        <path
          d="M26 640 V220 Q26 22 150 8 Q274 22 274 220 V640"
          fill="none"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="1.5"
        />
        {/* inner */}
        <path
          d="M40 640 V222 Q40 44 150 28 Q260 44 260 222 V640"
          fill="none"
          stroke="rgba(255,255,255,0.42)"
          strokeWidth="1"
        />
      </svg>
      <div className={`cf-apex ${lit ? 'cf-apex--lit' : ''}`} aria-hidden>
        <svg viewBox="0 0 40 40" width="18" height="18">
          <path
            d="M20 2 L23.8 16.2 L38 20 L23.8 23.8 L20 38 L16.2 23.8 L2 20 L16.2 16.2 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
          />
        </svg>
      </div>
    </>
  );
}

const CSS = `
.cf-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  color: rgba(245,242,235,0.9);
  font-family: 'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', serif;
  max-width: 430px;
  margin: 0 auto;
  overflow: hidden;
}

/* invisible hit targets — zero visual chrome */
.cf-hit-back,
.cf-hit-archive {
  position: absolute;
  top: 0;
  width: 48px;
  height: 48px;
  z-index: 10;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
}
.cf-hit-back { left: 0; padding-top: env(safe-area-inset-top, 0px); }
.cf-hit-archive { right: 0; padding-top: env(safe-area-inset-top, 0px); }

.cf-booth {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
  padding: 0;
  margin: 0;
  cursor: pointer;
  display: block;
  color: inherit;
  font: inherit;
  text-align: left;
}
.cf-booth--pulse .cf-curtain-line {
  animation-duration: 0.9s !important;
}

.cf-arch {
  position: absolute;
  left: 10%;
  right: 10%;
  top: 0;
  bottom: 0;
  width: 80%;
  height: 100%;
  z-index: 3;
  pointer-events: none;
}

.cf-apex {
  position: absolute;
  top: 1.6%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  color: rgba(255,255,255,0.92);
  pointer-events: none;
}
.cf-apex--lit {
  color: #efc4a4;
  filter: drop-shadow(0 0 9px rgba(220,120,70,0.72));
}

/* content well sits inside the arch legs, grounded with the arch */
.cf-well {
  position: absolute;
  left: 18%;
  right: 18%;
  top: 7.5%;
  bottom: 0;
  z-index: 2;
  overflow: hidden;
}

.cf-curtain {
  position: absolute;
  inset: 0;
}
.cf-curtain-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cf-curtain-line {
  stroke: rgba(255,255,255,0.55);
  stroke-width: 0.13;
  opacity: 0.22;
  animation-name: cfFlicker;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
@keyframes cfFlicker {
  0%, 100% { opacity: 0.08; }
  40% { opacity: 0.5; }
  70% { opacity: 0.16; }
}

.cf-spark {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: cfSpark 2.7s ease-in-out infinite;
}
.cf-spark--dot {
  border-radius: 50%;
  background: rgba(255,255,255,0.92);
  box-shadow: 0 0 3px rgba(255,255,255,0.35);
}
.cf-spark--cross { background: transparent; }
.cf-spark--cross::before,
.cf-spark--cross::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  background: rgba(255,255,255,0.92);
  transform: translate(-50%, -50%);
}
.cf-spark--cross::before { width: 100%; height: 1px; }
.cf-spark--cross::after { width: 1px; height: 100%; }
@keyframes cfSpark {
  0%, 100% { opacity: 0.1; transform: translate(-50%, -50%) scale(0.82); }
  45% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
  75% { opacity: 0.28; }
}

.cf-prose {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 8% 2% 18%;
  scrollbar-width: none;
  animation: cfIn 0.45s ease both;
  box-sizing: border-box;
}
.cf-prose::-webkit-scrollbar { display: none; }
@keyframes cfIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.cf-para {
  margin: 0;
  font-weight: 300;
  font-size: 14px;
  line-height: 2;
  letter-spacing: 0.02em;
  color: rgba(242,238,230,0.9);
  text-align: justify;
  text-justify: inter-ideograph;
}

.cf-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0;
}
.cf-divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.22);
  display: block;
}

.cf-chip {
  appearance: none;
  border: 1px solid rgba(255,255,255,0.2);
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-family: inherit;
  font-size: 11px;
  padding: 2px 8px;
  margin: 0 4px 10px 0;
  cursor: pointer;
}
.cf-chip--on {
  border-color: rgba(232,160,120,0.5);
  color: #f0d0bc;
}

@media (min-width: 400px) {
  .cf-arch { left: 12%; width: 76%; }
  .cf-well { left: 20%; right: 20%; }
}
`;
