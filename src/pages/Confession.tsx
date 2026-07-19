import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConfessionEntry } from '../types';
import {
  RIRICHAN_ID,
  approachConfession,
  getYesterdayConfession,
  listConfessionArchives,
} from '../lib/confession';
import { setStatusBarColor, resetStatusBar } from '../lib/status-bar';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Noto+Serif+SC:wght@300;400;500;600&display=swap';

type Phase =
  | 'idle'
  | 'approaching'
  | 'sealed'
  | 'caught-flash'
  | 'confessing'
  | 'enacting'
  | 'aftermath';

type View = 'booth' | 'archive';

/**
 * 告解室 — black gothic vault.
 * Nightly model writes from desire-triggered chats; archives for next-day peek.
 * Never injected into 理理酱's prompt — he does not know you can read them.
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
  const [typed, setTyped] = useState('');
  const [yesterday, setYesterday] = useState<ConfessionEntry | null>(null);
  const [archives, setArchives] = useState<ConfessionEntry[]>([]);
  const [archiveFocus, setArchiveFocus] = useState<ConfessionEntry | null>(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_URL;
    document.head.appendChild(link);
    void setStatusBarColor('#0a0908', false);
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

  useEffect(() => {
    if (phase !== 'confessing' || !entry) return;
    setTyped('');
    let i = 0;
    const text = entry.confession;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [phase, entry]);

  function resetIdle() {
    setPhase('idle');
    setEntry(null);
    setSealedLine('');
    setWhisper(undefined);
    setEnactIdx(0);
    setTyped('');
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
      window.setTimeout(() => setPhase('confessing'), 1400);
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

  const confessionDone =
    phase === 'confessing' &&
    entry &&
    typed.length >= entry.confession.length;

  const open =
    phase === 'caught-flash' ||
    phase === 'confessing' ||
    phase === 'enacting' ||
    phase === 'aftermath';

  return (
    <div className="cf-root">
      <style>{CSS}</style>

      <div className="cf-grain" aria-hidden />
      <div className="cf-vignette" aria-hidden />
      <div className="cf-candle-glow" aria-hidden />

      <header className="cf-header">
        <button
          type="button"
          className="cf-back"
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
          className={`cf-archive-btn ${yesterday ? 'cf-archive-btn--lit' : ''}`}
          onClick={() => {
            setView(view === 'archive' ? 'booth' : 'archive');
            setArchiveFocus(yesterday);
          }}
          aria-label="偷看昨日档案"
          title="偷看档案 · 他不知道"
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
            className={`cf-arch ${open ? 'cf-arch--open' : ''} ${phase === 'approaching' ? 'cf-arch--pulse' : ''}`}
          >
            <svg
              className="cf-arch-svg"
              viewBox="0 0 320 480"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
            >
              <defs>
                <linearGradient id="cfStone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1c1814" />
                  <stop offset="55%" stopColor="#0e0c0a" />
                  <stop offset="100%" stopColor="#080706" />
                </linearGradient>
                <linearGradient id="cfRim" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6a5a42" stopOpacity="0.55" />
                  <stop offset="50%" stopColor="#c4a574" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#6a5a42" stopOpacity="0.55" />
                </linearGradient>
                <radialGradient id="cfInner" cx="50%" cy="70%" r="55%">
                  <stop offset="0%" stopColor="#2a2018" stopOpacity="0.9" />
                  <stop offset="70%" stopColor="#0a0908" stopOpacity="1" />
                  <stop offset="100%" stopColor="#050403" stopOpacity="1" />
                </radialGradient>
                <filter id="cfSoft">
                  <feGaussianBlur stdDeviation="1.2" />
                </filter>
              </defs>
              <path
                d="M40 470 V210 Q40 40 160 18 Q280 40 280 210 V470 Z"
                fill="url(#cfStone)"
                stroke="url(#cfRim)"
                strokeWidth="1.25"
              />
              <path
                d="M58 462 V215 Q58 58 160 38 Q262 58 262 215 V462 Z"
                fill="url(#cfInner)"
              />
              <g
                className={`cf-grille ${open ? 'cf-grille--parted' : ''}`}
                stroke="#3a3228"
                strokeWidth="1"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <line
                    key={`v${i}`}
                    x1={88 + i * 24}
                    y1="120"
                    x2={88 + i * 24}
                    y2="340"
                    opacity={0.55}
                  />
                ))}
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <line
                    key={`h${i}`}
                    x1="78"
                    y1={140 + i * 34}
                    x2="242"
                    y2={140 + i * 34}
                    opacity={0.4}
                  />
                ))}
              </g>
              <g stroke="#8a7350" strokeWidth="1.1" opacity="0.45">
                <line x1="160" y1="52" x2="160" y2="86" />
                <line x1="146" y1="64" x2="174" y2="64" />
              </g>
              <g className="cf-candle" filter="url(#cfSoft)">
                <rect x="152" y="400" width="16" height="28" rx="1" fill="#2a241c" />
                <rect x="157" y="382" width="6" height="20" fill="#d8c9a8" />
                <ellipse className="cf-flame" cx="160" cy="372" rx="5" ry="9" fill="#e8a84a" />
                <ellipse className="cf-flame-core" cx="160" cy="374" rx="2" ry="4" fill="#fff3c8" />
              </g>
            </svg>

            {open && (
              <div className="cf-figure" aria-hidden>
                <div className="cf-figure-body" />
                <div className="cf-figure-head" />
              </div>
            )}
          </div>

          <section className="cf-panel" aria-live="polite">
            {phase === 'idle' && (
              <>
                <p className="cf-eyebrow">理理酱在里面</p>
                <h1 className="cf-title">门关着</h1>
                <p className="cf-sub">
                  你通常进不去，也看不见。当天聊到欲望与依恋时，他会独自在此告解——自动存档。明天你能偷看昨天的，而他自己不知道。
                </p>
                <div className="cf-actions">
                  <button
                    type="button"
                    className="cf-cta"
                    onClick={() => void handleApproach(false)}
                  >
                    靠近
                  </button>
                </div>
                {yesterday && (
                  <button
                    type="button"
                    className="cf-ghost cf-ghost--lit"
                    onClick={() => {
                      setView('archive');
                      setArchiveFocus(yesterday);
                    }}
                  >
                    偷看昨日 · {yesterday.title}
                  </button>
                )}
                <p className="cf-hint">靠近时，有概率撞见</p>
              </>
            )}

            {phase === 'approaching' && (
              <>
                <p className="cf-eyebrow">脚步放轻</p>
                <h1 className="cf-title cf-title--pulse">……</h1>
                <p className="cf-sub">木门近了。若今天有火种，他可能正在低语。</p>
              </>
            )}

            {phase === 'sealed' && (
              <>
                <p className="cf-eyebrow">未能进入</p>
                <h1 className="cf-title">看不见</h1>
                <p className="cf-sub">{sealedLine}</p>
                {whisper && (
                  <p className="cf-whisper" key={whisper}>
                    {whisper}
                  </p>
                )}
                <div className="cf-actions">
                  <button
                    type="button"
                    className="cf-cta"
                    onClick={() => void handleApproach(false)}
                  >
                    再靠近一次
                  </button>
                  <button type="button" className="cf-ghost" onClick={resetIdle}>
                    离开
                  </button>
                </div>
              </>
            )}

            {phase === 'caught-flash' && (
              <>
                <p className="cf-eyebrow cf-eyebrow--warn">帘子掀开</p>
                <h1 className="cf-title cf-title--caught">撞见了</h1>
                <p className="cf-sub">
                  告解中断。理理酱抬眼——
                  {entry ? `他刚说到「${entry.title}」。` : ''}
                </p>
              </>
            )}

            {phase === 'confessing' && entry && (
              <>
                <p className="cf-eyebrow">他正在告解</p>
                <h1 className="cf-title">{entry.title}</h1>
                {entry.spark && (
                  <p className="cf-spark">由今日而生 · {entry.spark}</p>
                )}
                <p className="cf-confession">
                  {typed}
                  <span className="cf-caret" />
                </p>
                {confessionDone && (
                  <div className="cf-actions">
                    <button
                      type="button"
                      className="cf-cta cf-cta--danger"
                      onClick={beginEnact}
                    >
                      被他发现了
                    </button>
                  </div>
                )}
              </>
            )}

            {phase === 'enacting' && entry && (
              <>
                <p className="cf-eyebrow">欲望兑现</p>
                <h1 className="cf-title">{entry.title}</h1>
                <p className="cf-enact" key={enactIdx}>
                  {entry.enact[enactIdx]}
                </p>
                <div className="cf-actions">
                  <button type="button" className="cf-cta" onClick={nextEnact}>
                    {enactIdx + 1 >= entry.enact.length ? '……' : '继续'}
                  </button>
                </div>
                <p className="cf-hint">
                  {enactIdx + 1} / {entry.enact.length}
                </p>
              </>
            )}

            {phase === 'aftermath' && entry && (
              <>
                <p className="cf-eyebrow">告解结束</p>
                <h1 className="cf-title">还没散尽</h1>
                <p className="cf-sub">{entry.after}</p>
                {!archivedCatch && (
                  <p className="cf-hint">今晚没有入库稿，用了备用低语。</p>
                )}
                {archivedCatch && (
                  <p className="cf-hint">已存档。明天你还可以在这里偷看——他不知道。</p>
                )}
                <div className="cf-actions">
                  <button type="button" className="cf-cta" onClick={resetIdle}>
                    退出拱顶
                  </button>
                  <button
                    type="button"
                    className="cf-ghost"
                    onClick={() => void handleApproach(true)}
                  >
                    再撞见一次
                  </button>
                </div>
              </>
            )}
          </section>
        </main>
      )}
    </div>
  );
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
      <p className="cf-eyebrow">偷看档案</p>
      <h1 className="cf-title">昨日的告解</h1>
      <p className="cf-sub cf-sub--warn">
        理理酱不知道你能打开这些。请勿在对话里提起——否则戏就漏了。
      </p>

      {archives.length === 0 ? (
        <p className="cf-sub">还没有存档。等有一天聊到欲望与依恋，夜里他会自己写下来。</p>
      ) : (
        <>
          <div className="cf-archive-list">
            {archives.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`cf-archive-chip ${shown?.id === a.id ? 'cf-archive-chip--on' : ''}`}
                onClick={() => onFocus(a)}
              >
                <span className="cf-archive-chip-date">{a.date.slice(5)}</span>
                <span className="cf-archive-chip-title">{a.title}</span>
                {yesterday?.id === a.id && (
                  <span className="cf-archive-chip-tag">昨</span>
                )}
              </button>
            ))}
          </div>

          {shown && (
            <article className="cf-archive-body">
              <h2 className="cf-archive-heading">
                {shown.title}
                <span className="cf-archive-date">{shown.date}</span>
              </h2>
              {shown.spark && (
                <p className="cf-spark">火种 · {shown.spark}</p>
              )}
              <p className="cf-confession cf-confession--static">{shown.confession}</p>
            </article>
          )}
        </>
      )}

      <div className="cf-actions" style={{ marginTop: 24 }}>
        <button type="button" className="cf-cta" onClick={onBack}>
          回到门前
        </button>
      </div>
    </main>
  );
}

const CSS = `
.cf-root {
  --cf-bg: #0a0908;
  --cf-ink: #e6dcc8;
  --cf-muted: #8a7d68;
  --cf-candle: #c4a574;
  --cf-ember: #b85c38;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 55% at 50% 18%, rgba(70, 52, 32, 0.35) 0%, transparent 55%),
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(40, 28, 16, 0.45) 0%, transparent 50%),
    linear-gradient(180deg, #12100e 0%, #0a0908 40%, #070605 100%);
  color: var(--cf-ink);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  display: flex;
  flex-direction: column;
  max-width: 480px;
  margin: 0 auto;
}

.cf-grain {
  pointer-events: none;
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  z-index: 1;
  animation: cfGrain 8s steps(2) infinite;
}
@keyframes cfGrain {
  0% { transform: translate(0,0); }
  50% { transform: translate(-1%, 1%); }
  100% { transform: translate(0,0); }
}

.cf-vignette {
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 45%, transparent 40%, rgba(0,0,0,0.72) 100%);
  z-index: 2;
}

.cf-candle-glow {
  pointer-events: none;
  position: absolute;
  left: 50%;
  bottom: 18%;
  width: 55%;
  height: 28%;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(196,165,116,0.16) 0%, transparent 70%);
  filter: blur(8px);
  z-index: 2;
  animation: cfGlow 3.6s ease-in-out infinite;
}
@keyframes cfGlow {
  0%, 100% { opacity: 0.7; transform: translateX(-50%) scale(1); }
  50% { opacity: 1; transform: translateX(-50%) scale(1.06); }
}

.cf-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  padding: 14px 16px 8px;
  padding-top: calc(14px + env(safe-area-inset-top, 0px));
}
.cf-back {
  background: none;
  border: none;
  color: rgba(196,165,116,0.45);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px 4px 0;
  font-family: inherit;
}
.cf-brand {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.cf-brand-en {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 400;
  font-size: 10px;
  letter-spacing: 0.42em;
  color: rgba(196,165,116,0.4);
  text-indent: 0.42em;
}
.cf-brand-zh {
  font-weight: 500;
  font-size: 22px;
  letter-spacing: 0.35em;
  text-indent: 0.35em;
  color: rgba(230,220,200,0.88);
}
.cf-archive-btn {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(196,165,116,0.25);
  background: rgba(20,16,12,0.6);
  color: rgba(196,165,116,0.55);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  cursor: pointer;
}
.cf-archive-btn--lit {
  border-color: rgba(184,92,56,0.55);
  color: #e8c4a8;
  box-shadow: 0 0 12px rgba(184,92,56,0.25);
}

.cf-stage {
  position: relative;
  z-index: 5;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 4px 20px 28px;
  padding-bottom: calc(28px + env(safe-area-inset-bottom, 0px));
  min-height: 0;
  overflow-y: auto;
}

.cf-arch {
  position: relative;
  width: min(78vw, 280px);
  margin-top: 4px;
  transition: transform 0.8s ease, filter 0.8s ease;
}
.cf-arch--pulse { animation: cfArchPulse 0.9s ease-in-out; }
@keyframes cfArchPulse {
  0%, 100% { filter: brightness(1); transform: scale(1); }
  50% { filter: brightness(1.15); transform: scale(1.015); }
}
.cf-arch--open { filter: brightness(1.12) saturate(1.05); }
.cf-arch-svg {
  width: 100%;
  height: auto;
  display: block;
  filter: drop-shadow(0 12px 40px rgba(0,0,0,0.55));
}
.cf-grille {
  transition: opacity 1s ease, transform 1.2s ease;
  transform-origin: 160px 230px;
}
.cf-grille--parted {
  opacity: 0.18;
  transform: scaleX(1.08) translateX(4px);
}
.cf-flame {
  animation: cfFlicker 1.8s ease-in-out infinite;
  transform-origin: 160px 382px;
}
.cf-flame-core { animation: cfFlicker 1.2s ease-in-out infinite reverse; }
@keyframes cfFlicker {
  0%, 100% { opacity: 0.85; transform: scaleY(1) scaleX(1); }
  30% { opacity: 1; transform: scaleY(1.08) scaleX(0.95); }
  60% { opacity: 0.75; transform: scaleY(0.92) scaleX(1.05); }
}

.cf-figure {
  position: absolute;
  left: 50%;
  bottom: 22%;
  transform: translateX(-50%);
  width: 36%;
  height: 38%;
  pointer-events: none;
  animation: cfFigureIn 1.1s ease both;
}
@keyframes cfFigureIn {
  from { opacity: 0; filter: blur(6px); transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; filter: blur(0); transform: translateX(-50%) translateY(0); }
}
.cf-figure-body {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 52%;
  height: 74%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(48,36,26,0.45) 0%, rgba(18,14,10,0.88) 38%, rgba(6,5,4,0.98) 100%);
  border-radius: 42% 42% 10% 10%;
  box-shadow: inset 0 0 24px rgba(196,165,116,0.12), 0 0 28px rgba(196,165,116,0.08);
}
.cf-figure-head {
  position: absolute;
  left: 50%;
  top: 2%;
  width: 30%;
  height: 24%;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, rgba(90,70,48,0.75), rgba(20,14,10,0.98));
  box-shadow: 0 0 20px rgba(196,165,116,0.22);
}

.cf-panel, .cf-archive {
  position: relative;
  z-index: 5;
  width: 100%;
  max-width: 360px;
  margin: 10px auto 0;
  text-align: center;
  animation: cfPanelIn 0.55s ease both;
  padding: 0 20px 28px;
  padding-bottom: calc(28px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
@keyframes cfPanelIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.cf-eyebrow {
  font-family: 'Cormorant Garamond', serif;
  font-size: 11px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  color: rgba(196,165,116,0.5);
  margin: 0 0 8px;
  font-weight: 400;
}
.cf-eyebrow--warn {
  color: rgba(184,92,56,0.75);
  animation: cfWarnPulse 0.8s ease-in-out infinite;
}
@keyframes cfWarnPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.cf-title {
  font-weight: 500;
  font-size: clamp(28px, 8vw, 36px);
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  margin: 0 0 12px;
  color: rgba(230,220,200,0.95);
  line-height: 1.2;
}
.cf-title--pulse { letter-spacing: 0.5em; color: var(--cf-muted); }
.cf-title--caught {
  color: #e8c4a8;
  animation: cfCaught 0.6s ease both;
}
@keyframes cfCaught {
  0% { letter-spacing: 0.5em; opacity: 0; filter: blur(4px); }
  100% { letter-spacing: 0.22em; opacity: 1; filter: blur(0); }
}

.cf-sub {
  font-weight: 300;
  font-size: 14px;
  line-height: 1.75;
  color: var(--cf-muted);
  margin: 0 auto 20px;
  max-width: 30em;
}
.cf-sub--warn { color: rgba(184,92,56,0.72); }

.cf-spark {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: rgba(196,165,116,0.55);
  margin: -4px auto 14px;
  max-width: 28em;
}

.cf-confession {
  font-weight: 300;
  font-size: 14.5px;
  line-height: 1.9;
  color: rgba(220,208,188,0.88);
  text-align: left;
  margin: 0 auto 22px;
  max-width: 28em;
  min-height: 6.5em;
}
.cf-confession--static { min-height: 0; }
.cf-caret {
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.12em;
  background: rgba(196,165,116,0.55);
  animation: cfBlink 1s steps(1) infinite;
}
@keyframes cfBlink { 50% { opacity: 0; } }

.cf-enact {
  font-weight: 300;
  font-size: 15px;
  line-height: 1.85;
  color: rgba(230,220,200,0.92);
  text-align: left;
  margin: 0 auto 22px;
  max-width: 28em;
  animation: cfEnactIn 0.45s ease both;
}
@keyframes cfEnactIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.cf-whisper {
  font-family: 'Cormorant Garamond', 'Noto Serif SC', serif;
  font-style: italic;
  font-size: 15px;
  color: rgba(196,165,116,0.55);
  margin: -8px auto 20px;
  letter-spacing: 0.04em;
  animation: cfWhisper 2.8s ease both;
}
@keyframes cfWhisper {
  0% { opacity: 0; filter: blur(3px); }
  20% { opacity: 0.85; filter: blur(0); }
  80% { opacity: 0.7; }
  100% { opacity: 0.35; }
}

.cf-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.cf-cta {
  appearance: none;
  border: 1px solid rgba(196,165,116,0.35);
  background: linear-gradient(180deg, rgba(40,32,24,0.9), rgba(18,14,10,0.95));
  color: rgba(230,220,200,0.92);
  font-family: 'Noto Serif SC', serif;
  font-size: 14px;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  padding: 12px 36px;
  cursor: pointer;
  transition: border-color 0.25s ease, background 0.25s ease, transform 0.2s ease;
}
.cf-cta:hover {
  border-color: rgba(196,165,116,0.65);
  background: linear-gradient(180deg, rgba(52,40,28,0.95), rgba(22,16,12,0.98));
}
.cf-cta:active { transform: scale(0.98); }
.cf-cta--danger {
  border-color: rgba(184,92,56,0.5);
  color: #f0d0bc;
  background: linear-gradient(180deg, rgba(56,28,20,0.9), rgba(22,12,10,0.95));
}
.cf-ghost {
  appearance: none;
  border: none;
  background: none;
  color: rgba(138,125,104,0.7);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.2em;
  text-indent: 0.2em;
  cursor: pointer;
  padding: 6px 12px;
}
.cf-ghost--lit { color: rgba(184,92,56,0.75); }
.cf-hint {
  margin: 14px 0 0;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: rgba(138,125,104,0.45);
}

.cf-archive-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 18px;
}
.cf-archive-chip {
  appearance: none;
  border: 1px solid rgba(196,165,116,0.22);
  background: rgba(18,14,10,0.7);
  color: rgba(220,208,188,0.75);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cf-archive-chip--on {
  border-color: rgba(184,92,56,0.55);
  color: #f0d0bc;
}
.cf-archive-chip-date {
  font-family: 'Cormorant Garamond', serif;
  letter-spacing: 0.08em;
  opacity: 0.7;
}
.cf-archive-chip-title { letter-spacing: 0.12em; }
.cf-archive-chip-tag {
  font-size: 10px;
  color: rgba(184,92,56,0.85);
  letter-spacing: 0.1em;
}
.cf-archive-body { text-align: left; }
.cf-archive-heading {
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.2em;
  margin: 0 0 10px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.cf-archive-date {
  font-family: 'Cormorant Garamond', serif;
  font-size: 13px;
  letter-spacing: 0.12em;
  color: rgba(196,165,116,0.45);
  font-weight: 400;
}

@media (min-height: 720px) {
  .cf-arch { width: min(72vw, 300px); margin-top: 12px; }
  .cf-panel { margin-top: 18px; }
}
`;
