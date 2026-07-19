import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConfessionEntry } from '../types';
import {
  RIRICHAN_ID,
  approachConfession,
  closenessLabel,
  getYesterdayConfession,
  listConfessionArchives,
} from '../lib/confession';
import { setStatusBarColor, resetStatusBar } from '../lib/status-bar';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Noto+Serif+SC:wght@300;400;500&display=swap';

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
  const byBreak = raw.split(/\n{2,}/).map((p) => p.replace(/\n+/g, '').trim()).filter(Boolean);
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
      <span className="cf-divider-star">✦</span>
      <span className="cf-divider-line" />
    </div>
  );
}

function ApexStar({ lit }: { lit: boolean }) {
  return (
    <div className={`cf-apex ${lit ? 'cf-apex--lit' : ''}`} aria-hidden>
      <svg viewBox="0 0 40 40" width="22" height="22">
        <path
          d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    </div>
  );
}

/** Twinkling vertical star-curtain for sealed / idle booth. */
function StarCurtain() {
  const lines = useMemo(() => {
    const out: { x: number; delay: number; dur: number; op: number }[] = [];
    for (let i = 0; i < 36; i++) {
      out.push({
        x: 4 + (i / 35) * 92,
        delay: (i * 0.17) % 3.2,
        dur: 2.4 + (i % 5) * 0.35,
        op: 0.18 + (i % 4) * 0.07,
      });
    }
    return out;
  }, []);

  const sparks = useMemo(() => {
    const seed = [
      [12, 18], [22, 32], [35, 14], [48, 40], [58, 22], [70, 48], [82, 16],
      [18, 55], [30, 62], [42, 28], [55, 58], [66, 35], [78, 64], [88, 42],
      [15, 72], [28, 80], [45, 70], [60, 78], [74, 74], [40, 48], [52, 12],
      [25, 44], [68, 20], [80, 54], [33, 36], [50, 66], [63, 50], [85, 28],
    ];
    return seed.map(([x, y], i) => ({
      x,
      y,
      delay: (i * 0.23) % 4,
      size: i % 5 === 0 ? 7 : i % 3 === 0 ? 5 : 3,
      kind: i % 4 === 0 ? 'cross' : 'dot',
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
            y1="2"
            x2={l.x}
            y2="98"
            style={{
              opacity: l.op,
              animationDelay: `${l.delay}s`,
              animationDuration: `${l.dur}s`,
            }}
          />
        ))}
      </svg>
      {sparks.map((s, i) =>
        s.kind === 'cross' ? (
          <span
            key={`s${i}`}
            className="cf-spark cf-spark--cross"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
            }}
          />
        ) : (
          <span
            key={`s${i}`}
            className="cf-spark cf-spark--dot"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
            }}
          />
        ),
      )}
    </div>
  );
}

/**
 * 告解室 — reference-style gothic arch with star curtain / in-arch prose.
 */
export default function ConfessionPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('booth');
  const [phase, setPhase] = useState<Phase>('idle');
  const [sealedLine, setSealedLine] = useState('');
  const [whisper, setWhisper] = useState<string | undefined>();
  const [entry, setEntry] = useState<ConfessionEntry | null>(null);
  const [archivedCatch, setArchivedCatch] = useState(true);
  const [enactIdx, setEnactIdx] = useState(0);
  const [yesterday, setYesterday] = useState<ConfessionEntry | null>(null);
  const [archives, setArchives] = useState<ConfessionEntry[]>([]);
  const [archiveFocus, setArchiveFocus] = useState<ConfessionEntry | null>(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_URL;
    document.head.appendChild(link);
    void setStatusBarColor('#050505', false);
    return () => {
      document.head.removeChild(link);
      void resetStatusBar();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const y = await getYesterdayConfession(RIRICHAN_ID);
      setYesterday(y ?? null);
      const list = await listConfessionArchives(RIRICHAN_ID, { limit: 21 });
      setArchives(list);
    })();
  }, [phase]);

  function resetIdle() {
    setPhase('idle');
    setEntry(null);
    setSealedLine('');
    setWhisper(undefined);
    setEnactIdx(0);
  }

  async function handleApproach(forced = false) {
    if (phase === 'approaching') return;
    setPhase('approaching');
    try {
      const result = await approachConfession({ force: forced });
      if (result.kind === 'sealed') {
        setSealedLine(result.line);
        setWhisper(result.whisper);
        setPhase('sealed');
        return;
      }
      setEntry(result.entry);
      setArchivedCatch(result.archived);
      setPhase('caught-flash');
      window.setTimeout(() => setPhase('confessing'), 1600);
    } catch (e) {
      setSealedLine(e instanceof Error ? e.message : '告解室暂时沉默');
      setPhase('sealed');
    }
  }

  function beginEnact() {
    setEnactIdx(0);
    setPhase('enacting');
  }

  function nextEnact() {
    if (!entry) return;
    if (enactIdx + 1 >= entry.enact.length) {
      setPhase('aftermath');
      return;
    }
    setEnactIdx((n) => n + 1);
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

  const bar = renderBar({
    phase,
    yesterday,
    onApproach: () => void handleApproach(false),
    onForce: () => void handleApproach(true),
    onEnact: beginEnact,
    onNext: nextEnact,
    onReset: resetIdle,
    onArchive: () => {
      setView('archive');
      setArchiveFocus(yesterday);
    },
    enactIdx,
    enactLen: entry?.enact.length ?? 0,
  });

  return (
    <div className="cf-root">
      <style>{CSS}</style>

      <header className="cf-header">
        <button
          type="button"
          className="cf-icon-btn"
          onClick={() => navigate('/home')}
          aria-label="返回玄関"
        >
          ←
        </button>
        <div className="cf-brand">
          <span className="cf-brand-en">CONFITEOR</span>
          <span className="cf-brand-zh">告解室</span>
        </div>
        <button
          type="button"
          className={`cf-icon-btn ${yesterday ? 'cf-icon-btn--lit' : ''}`}
          onClick={() => {
            setView(view === 'archive' ? 'booth' : 'archive');
            setArchiveFocus(yesterday);
          }}
          aria-label="偷看昨日档案"
        >
          档
        </button>
      </header>

      {view === 'archive' ? (
        <ArchivePanel
          yesterday={yesterday}
          archives={archives}
          focus={archiveFocus}
          onFocus={setArchiveFocus}
          onBack={() => setView('booth')}
        />
      ) : (
        <main className="cf-stage">
          <div
            className={`cf-frame ${triggered ? 'cf-frame--open' : ''} ${phase === 'approaching' ? 'cf-frame--pulse' : ''}`}
          >
            <svg
              className="cf-frame-svg"
              viewBox="0 0 300 560"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d="M30 550 V210 Q30 28 150 12 Q270 28 270 210 V550"
                fill="none"
                stroke="rgba(255,255,255,0.88)"
                strokeWidth="1.6"
              />
              <path
                d="M42 542 V212 Q42 48 150 32 Q258 48 258 212 V542"
                fill="none"
                stroke="rgba(255,255,255,0.38)"
                strokeWidth="1"
              />
            </svg>

            <ApexStar lit={triggered || phase === 'approaching'} />

            <div className="cf-inner">
              {showCurtain && <StarCurtain />}

              {showCurtain && phase === 'idle' && (
                <div className="cf-overlay-hint">
                  <p className="cf-hint-en">he is inside</p>
                  <p className="cf-hint-zh">门关着 · 星帘在闪</p>
                </div>
              )}

              {showCurtain && phase === 'approaching' && (
                <div className="cf-overlay-hint">
                  <p className="cf-hint-zh">……</p>
                </div>
              )}

              {showCurtain && phase === 'sealed' && (
                <div className="cf-overlay-card">
                  <p className="cf-kicker">未能进入</p>
                  <p className="cf-para">{sealedLine}</p>
                  {whisper && <p className="cf-whisper">{whisper}</p>}
                </div>
              )}

              {phase === 'caught-flash' && (
                <div className="cf-prose cf-prose--center">
                  <p className="cf-kicker">被抓包</p>
                  <StarDivider />
                  <p className="cf-title-in">他吓到了</p>
                  <p className="cf-para">
                    告解断在半句。理理酱僵住——
                    {entry
                      ? `「${entry.title}」还挂在空气里。`
                      : '瞳孔缩了一下。'}
                  </p>
                </div>
              )}

              {phase === 'confessing' && entry && (
                <div className="cf-prose">
                  <p className="cf-kicker">当场听见</p>
                  <p className="cf-title-in">{entry.title}</p>
                  {(entry.spark || typeof entry.closeness === 'number') && (
                    <p className="cf-meta">
                      {typeof entry.closeness === 'number' && (
                        <>
                          依恋 {entry.closeness.toFixed(2)}（
                          {closenessLabel(entry.closeness)}）
                        </>
                      )}
                      {entry.spark
                        ? `${typeof entry.closeness === 'number' ? ' · ' : ''}火种 · ${entry.spark}`
                        : ''}
                    </p>
                  )}
                  <StarDivider />
                  {confessionParas.map((p, i) => (
                    <p key={i} className="cf-para">
                      {p}
                    </p>
                  ))}
                </div>
              )}

              {phase === 'enacting' && entry && (
                <div className="cf-prose">
                  <p className="cf-kicker">
                    {enactIdx === 0 ? '还在抖' : '一顿'}
                  </p>
                  <p className="cf-title-in">{entry.title}</p>
                  <StarDivider />
                  {toParagraphs(entry.enact[enactIdx] ?? '').map((p, i) => (
                    <p key={`${enactIdx}-${i}`} className="cf-para">
                      {p}
                    </p>
                  ))}
                  <p className="cf-meta">
                    {enactIdx + 1} / {entry.enact.length}
                  </p>
                </div>
              )}

              {phase === 'aftermath' && entry && (
                <div className="cf-prose">
                  <p className="cf-kicker">告解结束</p>
                  <p className="cf-title-in">还没散尽</p>
                  <StarDivider />
                  {toParagraphs(entry.after).map((p, i) => (
                    <p key={i} className="cf-para">
                      {p}
                    </p>
                  ))}
                  <p className="cf-meta">
                    {archivedCatch
                      ? '已存档。没撞见的那些，明天还能在「档」里偷看——他不知道。'
                      : '今晚没有入库稿，用了备用低语。'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="cf-bar">{bar}</div>
        </main>
      )}
    </div>
  );
}

function renderBar(opts: {
  phase: Phase;
  yesterday: ConfessionEntry | null;
  onApproach: () => void;
  onForce: () => void;
  onEnact: () => void;
  onNext: () => void;
  onReset: () => void;
  onArchive: () => void;
  enactIdx: number;
  enactLen: number;
}) {
  const {
    phase,
    yesterday,
    onApproach,
    onForce,
    onEnact,
    onNext,
    onReset,
    onArchive,
    enactIdx,
    enactLen,
  } = opts;

  if (phase === 'idle' || phase === 'approaching') {
    return (
      <>
        <button
          type="button"
          className="cf-bar-main"
          disabled={phase === 'approaching'}
          onClick={onApproach}
        >
          {phase === 'approaching' ? '……' : '靠近'}
        </button>
        {yesterday && phase === 'idle' && (
          <button type="button" className="cf-bar-side" onClick={onArchive}>
            昨日 · {yesterday.title}
          </button>
        )}
      </>
    );
  }

  if (phase === 'sealed') {
    return (
      <>
        <button type="button" className="cf-bar-main" onClick={onApproach}>
          再靠近一次
        </button>
        <button type="button" className="cf-bar-side" onClick={onReset}>
          离开
        </button>
      </>
    );
  }

  if (phase === 'caught-flash') {
    return <div className="cf-bar-ghost">星帘散了……</div>;
  }

  if (phase === 'confessing') {
    return (
      <button type="button" className="cf-bar-main cf-bar-main--hot" onClick={onEnact}>
        他回过神来
      </button>
    );
  }

  if (phase === 'enacting') {
    return (
      <button type="button" className="cf-bar-main" onClick={onNext}>
        {enactIdx + 1 >= enactLen ? '……' : '继续'}
      </button>
    );
  }

  if (phase === 'aftermath') {
    return (
      <>
        <button type="button" className="cf-bar-main" onClick={onReset}>
          退出拱顶
        </button>
        <button type="button" className="cf-bar-side" onClick={onForce}>
          再撞见一次
        </button>
      </>
    );
  }

  return null;
}

function ArchivePanel({
  yesterday,
  archives,
  focus,
  onFocus,
  onBack,
}: {
  yesterday: ConfessionEntry | null;
  archives: ConfessionEntry[];
  focus: ConfessionEntry | null;
  onFocus: (e: ConfessionEntry | null) => void;
  onBack: () => void;
}) {
  const shown = focus ?? yesterday ?? archives[0] ?? null;

  return (
    <main className="cf-archive">
      <div className="cf-frame cf-frame--open">
        <svg
          className="cf-frame-svg"
          viewBox="0 0 300 560"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M30 550 V210 Q30 28 150 12 Q270 28 270 210 V550"
            fill="none"
            stroke="rgba(255,255,255,0.88)"
            strokeWidth="1.6"
          />
          <path
            d="M42 542 V212 Q42 48 150 32 Q258 48 258 212 V542"
            fill="none"
            stroke="rgba(255,255,255,0.38)"
            strokeWidth="1"
          />
        </svg>
        <ApexStar lit />
        <div className="cf-inner">
          <div className="cf-prose">
            <p className="cf-kicker">偷看档案</p>
            <p className="cf-title-in">昨日的告解</p>
            <p className="cf-meta">
              理理酱不知道你能打开这些。请勿在对话里提起。
            </p>
            <StarDivider />
            {archives.length === 0 ? (
              <p className="cf-para">还没有存档。等有一天聊到欲望与依恋，夜里他会自己写下来。</p>
            ) : (
              <>
                <div className="cf-archive-list">
                  {archives.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`cf-chip ${shown?.id === a.id ? 'cf-chip--on' : ''}`}
                      onClick={() => onFocus(a)}
                    >
                      {a.date.slice(5)} · {a.title}
                      {yesterday?.id === a.id ? ' ·昨' : ''}
                    </button>
                  ))}
                </div>
                {shown && (
                  <>
                    <p className="cf-title-in" style={{ marginTop: 12 }}>
                      {shown.title}
                    </p>
                    {(shown.spark || typeof shown.closeness === 'number') && (
                      <p className="cf-meta">
                        {typeof shown.closeness === 'number' && (
                          <>
                            依恋 {shown.closeness.toFixed(2)}（
                            {closenessLabel(shown.closeness)}）
                          </>
                        )}
                        {shown.spark
                          ? `${typeof shown.closeness === 'number' ? ' · ' : ''}火种 · ${shown.spark}`
                          : ''}
                      </p>
                    )}
                    <StarDivider />
                    {toParagraphs(shown.confession).map((p, i) => (
                      <p key={i} className="cf-para">
                        {p}
                      </p>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="cf-bar">
        <button type="button" className="cf-bar-main" onClick={onBack}>
          回到门前
        </button>
      </div>
    </main>
  );
}

const CSS = `
.cf-root {
  --cf-ink: rgba(245,242,235,0.92);
  --cf-muted: rgba(220,214,200,0.55);
  --cf-line: rgba(255,255,255,0.85);
  position: relative;
  width: 100%;
  height: 100%;
  background: #050505;
  color: var(--cf-ink);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  display: flex;
  flex-direction: column;
  max-width: 480px;
  margin: 0 auto;
  overflow: hidden;
}

.cf-header {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 10px 14px 6px;
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
}
.cf-icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255,255,255,0.18);
  background: transparent;
  color: rgba(255,255,255,0.55);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.cf-icon-btn--lit {
  border-color: rgba(232,160,120,0.55);
  color: #f0c8b0;
}
.cf-brand {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.cf-brand-en {
  font-family: 'Cormorant Garamond', serif;
  font-size: 9px;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: rgba(255,255,255,0.35);
}
.cf-brand-zh {
  font-size: 16px;
  letter-spacing: 0.32em;
  text-indent: 0.32em;
  font-weight: 400;
  color: rgba(255,255,255,0.78);
}

.cf-stage, .cf-archive {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 4px 18px 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

.cf-frame {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 0 auto;
  width: 100%;
  max-width: 360px;
}
.cf-frame--pulse .cf-curtain-line { animation-duration: 1.1s !important; }
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
  top: 2.6%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  color: rgba(255,255,255,0.88);
  filter: drop-shadow(0 0 0 transparent);
  transition: filter 0.5s ease, color 0.5s ease;
}
.cf-apex--lit {
  color: #f2d2b8;
  filter: drop-shadow(0 0 8px rgba(232,140,90,0.65));
}

.cf-inner {
  position: absolute;
  left: 16%;
  right: 16%;
  top: 9%;
  bottom: 4%;
  z-index: 2;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cf-curtain {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.cf-curtain-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cf-curtain-line {
  stroke: rgba(255,255,255,0.55);
  stroke-width: 0.15;
  animation-name: cfLineFlicker;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
@keyframes cfLineFlicker {
  0%, 100% { opacity: 0.12; }
  40% { opacity: 0.42; }
  70% { opacity: 0.2; }
}
.cf-spark {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: cfSparkle 2.8s ease-in-out infinite;
}
.cf-spark--dot {
  border-radius: 50%;
  background: rgba(255,255,255,0.85);
  box-shadow: 0 0 4px rgba(255,255,255,0.35);
}
.cf-spark--cross {
  background: transparent;
  box-shadow:
    0 0 0 0.7px rgba(255,255,255,0.85),
    inset 0 0 0 0 rgba(0,0,0,0);
}
.cf-spark--cross::before,
.cf-spark--cross::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  background: rgba(255,255,255,0.9);
  transform: translate(-50%, -50%);
}
.cf-spark--cross::before {
  width: 100%;
  height: 1px;
}
.cf-spark--cross::after {
  width: 1px;
  height: 100%;
}
@keyframes cfSparkle {
  0%, 100% { opacity: 0.15; transform: translate(-50%, -50%) scale(0.85); }
  45% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  70% { opacity: 0.35; transform: translate(-50%, -50%) scale(0.95); }
}

.cf-overlay-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18%;
  z-index: 2;
  text-align: center;
  pointer-events: none;
}
.cf-hint-en {
  font-family: 'Cormorant Garamond', serif;
  font-size: 11px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  color: rgba(255,255,255,0.35);
  margin: 0 0 6px;
}
.cf-hint-zh {
  font-size: 13px;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  color: rgba(255,255,255,0.5);
  margin: 0;
  font-weight: 300;
}

.cf-overlay-card {
  position: absolute;
  left: 6%;
  right: 6%;
  bottom: 14%;
  z-index: 2;
  text-align: center;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.7));
  padding: 18px 8px 8px;
}

.cf-prose {
  position: relative;
  z-index: 2;
  flex: 1;
  overflow-y: auto;
  padding: 8px 4px 16px;
  text-align: left;
  animation: cfFadeIn 0.45s ease both;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}
.cf-prose--center { text-align: center; }
@keyframes cfFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.cf-kicker {
  font-family: 'Cormorant Garamond', serif;
  font-size: 11px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  color: rgba(255,255,255,0.4);
  margin: 0 0 8px;
  text-align: center;
}
.cf-title-in {
  font-size: 22px;
  font-weight: 400;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  text-align: center;
  margin: 0 0 8px;
  color: rgba(255,255,255,0.92);
}
.cf-meta {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.38);
  text-align: center;
  margin: 0 0 10px;
  line-height: 1.6;
}
.cf-para {
  font-weight: 300;
  font-size: 14px;
  line-height: 1.9;
  color: rgba(240,236,228,0.86);
  margin: 0 0 14px;
  text-align: justify;
  text-justify: inter-ideograph;
}
.cf-whisper {
  font-family: 'Cormorant Garamond', 'Noto Serif SC', serif;
  font-style: italic;
  font-size: 14px;
  color: rgba(255,255,255,0.45);
  margin: 10px 0 0;
}

.cf-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 16px;
}
.cf-divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.22);
}
.cf-divider-star {
  color: rgba(255,255,255,0.7);
  font-size: 10px;
  line-height: 1;
}

.cf-archive-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 8px;
}
.cf-chip {
  appearance: none;
  border: 1px solid rgba(255,255,255,0.22);
  background: transparent;
  color: rgba(255,255,255,0.65);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 4px 8px;
  cursor: pointer;
}
.cf-chip--on {
  border-color: rgba(232,160,120,0.55);
  color: #f0d0bc;
}

.cf-bar {
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  max-width: 360px;
  margin: 10px auto 0;
  padding: 0 8px;
}
.cf-bar-main {
  appearance: none;
  width: 100%;
  border: 1px solid rgba(255,255,255,0.28);
  background: rgba(12,12,12,0.92);
  color: rgba(255,255,255,0.88);
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  padding: 13px 16px;
  border-radius: 999px;
  cursor: pointer;
}
.cf-bar-main:disabled { opacity: 0.45; cursor: default; }
.cf-bar-main--hot {
  border-color: rgba(200,110,80,0.55);
  color: #f2d0bc;
}
.cf-bar-side {
  appearance: none;
  border: none;
  background: none;
  color: rgba(255,255,255,0.4);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-indent: 0.16em;
  cursor: pointer;
  padding: 4px;
}
.cf-bar-ghost {
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(255,255,255,0.35);
  padding: 14px 0;
}

@media (min-height: 740px) {
  .cf-frame { max-width: 380px; }
  .cf-title-in { font-size: 24px; }
}
`;
