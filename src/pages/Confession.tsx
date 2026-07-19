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

/** Split prose into natural article paragraphs (not poetry lines). */
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
    if (buf.length >= 70) {
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
      <span className="cf-divider-line" />
      <svg className="cf-divider-star" viewBox="0 0 20 20" width="11" height="11">
        <path
          d="M10 1 L12 8 L19 10 L12 12 L10 19 L8 12 L1 10 L8 8 Z"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="1.2"
        />
      </svg>
      <span className="cf-divider-line" />
    </div>
  );
}

function ApexStar({ lit }: { lit: boolean }) {
  return (
    <div className={`cf-apex ${lit ? 'cf-apex--lit' : ''}`} aria-hidden>
      <svg viewBox="0 0 40 40" width="20" height="20">
        <path
          d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
        />
      </svg>
    </div>
  );
}

/** Twinkling vertical star-curtain — idle / untriggered only. */
function StarCurtain() {
  const lines = useMemo(() => {
    const out: { x: number; delay: number; dur: number; op: number }[] = [];
    for (let i = 0; i < 40; i++) {
      out.push({
        x: 3 + (i / 39) * 94,
        delay: (i * 0.15) % 3.4,
        dur: 2.2 + (i % 6) * 0.32,
        op: 0.16 + (i % 5) * 0.06,
      });
    }
    return out;
  }, []);

  const sparks = useMemo(() => {
    const seed = [
      [14, 16], [26, 30], [38, 12], [50, 38], [62, 20], [74, 44], [86, 14],
      [20, 52], [34, 60], [46, 26], [58, 56], [70, 34], [82, 62], [10, 40],
      [16, 70], [30, 78], [44, 68], [56, 76], [72, 72], [40, 46], [52, 10],
      [24, 42], [66, 18], [78, 52], [36, 34], [48, 64], [64, 48], [88, 28],
      [12, 58], [28, 22], [54, 42], [80, 36],
    ];
    return seed.map(([x, y], i) => ({
      x,
      y,
      delay: (i * 0.21) % 4.2,
      size: i % 5 === 0 ? 7 : i % 3 === 0 ? 5 : 2.5,
      kind: (i % 5 === 0 ? 'cross' : 'dot') as 'cross' | 'dot',
    }));
  }, []);

  return (
    <div className="cf-curtain" aria-hidden>
      <svg className="cf-curtain-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lines.map((l, i) => (
          <line
            key={`l${i}`}
            className="cf-curtain-line"
            x1={l.x}
            y1="1"
            x2={l.x}
            y2="99"
            style={{
              opacity: l.op,
              animationDelay: `${l.delay}s`,
              animationDuration: `${l.dur}s`,
            }}
          />
        ))}
      </svg>
      {sparks.map((s, i) => (
        <span
          key={`s${i}`}
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

function ArchFrame({
  lit,
  pulse,
  children,
}: {
  lit: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`cf-frame ${lit ? 'cf-frame--open' : ''} ${pulse ? 'cf-frame--pulse' : ''}`}>
      <svg
        className="cf-frame-svg"
        viewBox="0 0 300 560"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M28 552 V208 Q28 26 150 10 Q272 26 272 208 V552"
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="1.55"
        />
        <path
          d="M40 544 V210 Q40 46 150 30 Q260 46 260 210 V544"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
      </svg>
      <ApexStar lit={lit || !!pulse} />
      <div className="cf-inner">{children}</div>
    </div>
  );
}

/**
 * 告解室 — visual clone of the reference:
 * untriggered = arch + flashing star curtain only;
 * triggered = in-arch prose + star dividers (no invented chrome copy).
 */
export default function ConfessionPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('booth');
  const [phase, setPhase] = useState<Phase>('idle');
  const [entry, setEntry] = useState<ConfessionEntry | null>(null);
  const [archivedCatch, setArchivedCatch] = useState(true);
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
        // Stay visual-silent: curtain keeps flashing, no invented copy.
        setPhase('sealed');
        return;
      }
      setEntry(result.entry);
      setArchivedCatch(result.archived);
      setPhase('caught-flash');
      window.setTimeout(() => setPhase('confessing'), 1200);
    } catch {
      setPhase('sealed');
    }
  }

  const triggered =
    phase === 'caught-flash' ||
    phase === 'confessing' ||
    phase === 'enacting' ||
    phase === 'aftermath';
  const showCurtain = !triggered;

  const confessionParas = useMemo(
    () => (entry ? toParagraphs(entry.confession) : []),
    [entry],
  );

  if (view === 'archive') {
    const shown = archiveFocus ?? yesterday ?? archives[0] ?? null;
    return (
      <div className="cf-root">
        <style>{CSS}</style>
        <div className="cf-top">
          <button type="button" className="cf-nav" onClick={() => setView('booth')}>
            ←
          </button>
          <button type="button" className="cf-nav" onClick={() => setView('booth')}>
            ×
          </button>
        </div>
        <main className="cf-stage">
          <ArchFrame lit>
            <div className="cf-prose">
              {archives.length === 0 ? null : (
                <>
                  <div className="cf-archive-list">
                    {archives.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`cf-chip ${shown?.id === a.id ? 'cf-chip--on' : ''}`}
                        onClick={() => setArchiveFocus(a)}
                      >
                        {a.date.slice(5)} {a.title}
                      </button>
                    ))}
                  </div>
                  {shown && (
                    <>
                      {toParagraphs(shown.confession).map((p, i) => (
                        <div key={i}>
                          {i > 0 && <StarDivider />}
                          <p className="cf-para">{p}</p>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </ArchFrame>
          <div className="cf-bar">
            <button type="button" className="cf-input" onClick={() => setView('booth')}>
              <span className="cf-input-ph" />
              <span className="cf-input-send" aria-hidden>
                ↑
              </span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="cf-root">
      <style>{CSS}</style>

      <div className="cf-top">
        <button
          type="button"
          className="cf-nav"
          onClick={() => navigate('/home')}
          aria-label="返回"
        >
          ←
        </button>
        <button
          type="button"
          className={`cf-nav ${yesterday ? 'cf-nav--dot' : ''}`}
          onClick={() => {
            setView('archive');
            setArchiveFocus(yesterday);
          }}
          aria-label="档案"
        >
          ·
        </button>
      </div>

      <main className="cf-stage">
        <ArchFrame
          lit={triggered}
          pulse={phase === 'approaching'}
        >
          {showCurtain && <StarCurtain />}

          {/* caught-flash: curtain off, apex lit — no invented chrome copy */}

          {phase === 'confessing' && entry && (
            <div className="cf-prose">
              {confessionParas.map((p, i) => (
                <div key={i}>
                  {i > 0 && <StarDivider />}
                  <p className="cf-para">{p}</p>
                </div>
              ))}
            </div>
          )}

          {phase === 'enacting' && entry && (
            <div className="cf-prose">
              {toParagraphs(entry.enact[enactIdx] ?? '').map((p, i) => (
                <div key={`${enactIdx}-${i}`}>
                  {i > 0 && <StarDivider />}
                  <p className="cf-para">{p}</p>
                </div>
              ))}
            </div>
          )}

          {phase === 'aftermath' && entry && (
            <div className="cf-prose">
              {toParagraphs(entry.after).map((p, i) => (
                <div key={i}>
                  {i > 0 && <StarDivider />}
                  <p className="cf-para">{p}</p>
                </div>
              ))}
            </div>
          )}
        </ArchFrame>

        <div className="cf-bar">
          {(phase === 'idle' || phase === 'approaching' || phase === 'sealed') && (
            <button
              type="button"
              className="cf-input"
              disabled={phase === 'approaching'}
              onClick={() => void handleApproach(false)}
              aria-label="靠近"
            >
              <span className="cf-input-plus" aria-hidden>
                +
              </span>
              <span className="cf-input-ph" />
              <span className="cf-input-send" aria-hidden>
                {phase === 'approaching' ? '…' : '↑'}
              </span>
            </button>
          )}

          {phase === 'caught-flash' && (
            <div className="cf-input cf-input--idle">
              <span className="cf-input-plus" aria-hidden>
                +
              </span>
              <span className="cf-input-ph" />
              <span className="cf-input-send" aria-hidden>
                ↑
              </span>
            </div>
          )}

          {phase === 'confessing' && (
            <button
              type="button"
              className="cf-input"
              onClick={() => {
                setEnactIdx(0);
                setPhase('enacting');
              }}
              aria-label="继续"
            >
              <span className="cf-input-plus" aria-hidden>
                +
              </span>
              <span className="cf-input-ph" />
              <span className="cf-input-send" aria-hidden>
                ↑
              </span>
            </button>
          )}

          {phase === 'enacting' && entry && (
            <button
              type="button"
              className="cf-input"
              onClick={() => {
                if (enactIdx + 1 >= entry.enact.length) setPhase('aftermath');
                else setEnactIdx((n) => n + 1);
              }}
              aria-label="继续"
            >
              <span className="cf-input-plus" aria-hidden>
                +
              </span>
              <span className="cf-input-ph" />
              <span className="cf-input-send" aria-hidden>
                ↑
              </span>
            </button>
          )}

          {phase === 'aftermath' && (
            <button
              type="button"
              className="cf-input"
              onClick={resetIdle}
              aria-label="离开"
            >
              <span className="cf-input-plus" aria-hidden>
                +
              </span>
              <span className="cf-input-ph" />
              <span className="cf-input-send" aria-hidden>
                ↑
              </span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

const CSS = `
.cf-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  color: rgba(245,242,235,0.92);
  font-family: 'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', serif;
  display: flex;
  flex-direction: column;
  max-width: 430px;
  margin: 0 auto;
  overflow: hidden;
}

.cf-top {
  display: flex;
  justify-content: space-between;
  padding: 8px 14px 0;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  z-index: 5;
}
.cf-nav {
  width: 36px;
  height: 32px;
  border: none;
  background: none;
  color: rgba(255,255,255,0.35);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.cf-nav--dot { color: rgba(232,160,120,0.7); }

.cf-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
}

.cf-frame {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
}
.cf-frame-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}
.cf-apex {
  position: absolute;
  top: 2.2%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  color: rgba(255,255,255,0.9);
}
.cf-apex--lit {
  color: #f0c8a8;
  filter: drop-shadow(0 0 10px rgba(220,120,70,0.7));
}

.cf-inner {
  position: absolute;
  left: 15%;
  right: 15%;
  top: 8.5%;
  bottom: 3.5%;
  z-index: 2;
  overflow: hidden;
}

.cf-curtain { position: absolute; inset: 0; }
.cf-curtain-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cf-curtain-line {
  stroke: rgba(255,255,255,0.55);
  stroke-width: 0.14;
  animation-name: cfLineFlicker;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
@keyframes cfLineFlicker {
  0%, 100% { opacity: 0.1; }
  35% { opacity: 0.48; }
  65% { opacity: 0.18; }
}
.cf-frame--pulse .cf-curtain-line { animation-duration: 1s !important; }

.cf-spark {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: cfSparkle 2.6s ease-in-out infinite;
}
.cf-spark--dot {
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  box-shadow: 0 0 3px rgba(255,255,255,0.4);
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
@keyframes cfSparkle {
  0%, 100% { opacity: 0.12; transform: translate(-50%, -50%) scale(0.8); }
  45% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  75% { opacity: 0.3; }
}

.cf-prose {
  height: 100%;
  overflow-y: auto;
  padding: 10px 2px 18px;
  animation: cfIn 0.4s ease both;
  scrollbar-width: none;
}
.cf-prose::-webkit-scrollbar { display: none; }
@keyframes cfIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.cf-para {
  font-weight: 300;
  font-size: 14px;
  line-height: 1.95;
  color: rgba(240,236,228,0.88);
  margin: 0;
  text-align: justify;
  text-justify: inter-ideograph;
}
.cf-meta {
  margin: 14px 0 0;
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  text-align: center;
}

.cf-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
}
.cf-divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.22);
}
.cf-divider-star { flex-shrink: 0; display: block; }

.cf-archive-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 4px;
}
.cf-chip {
  appearance: none;
  border: 1px solid rgba(255,255,255,0.2);
  background: transparent;
  color: rgba(255,255,255,0.55);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}
.cf-chip--on {
  border-color: rgba(232,160,120,0.5);
  color: #f0d0bc;
}

.cf-bar {
  width: 100%;
  max-width: 360px;
  margin: 12px auto 0;
  padding: 0 4px;
}
.cf-input {
  appearance: none;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255,255,255,0.22);
  background: rgba(10,10,10,0.95);
  border-radius: 999px;
  padding: 11px 12px 11px 18px;
  cursor: pointer;
  color: rgba(255,255,255,0.7);
}
.cf-input:disabled { opacity: 0.5; cursor: default; }
.cf-input--idle { cursor: default; opacity: 0.55; }
.cf-input-plus {
  color: rgba(255,255,255,0.45);
  font-size: 18px;
  line-height: 1;
  width: 18px;
  text-align: center;
}
.cf-input-ph { flex: 1; height: 1px; }
.cf-input-send {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.35);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  flex-shrink: 0;
}

@media (min-height: 740px) {
  .cf-frame { max-width: 380px; }
}
`;
