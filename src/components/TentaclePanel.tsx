import { useEffect, useRef, useState } from 'react';
import {
  afterkiss,
  parseHex,
  parseScore,
  useAfterKiss,
  type ScoreItem,
} from '../lib/afterkiss';
import type { BedroomTheme } from '../lib/bedroom-themes';

/**
 * Bedroom touch controller — slides up over the BedroomChat, drives the
 * AfterKiss device via Web Bluetooth. Three tabs: 控制 (sliders),
 * 八音盒 (paper-tape score player), 测试 (raw hex / log).
 *
 * Theme palette is inherited from the room so the panel feels of-a-piece
 * with the wall color. Channel colors (cyan/gold/pink) stay fixed for
 * identification.
 */

interface Props {
  theme: BedroomTheme;
  onClose: () => void;
}

const CHANNEL_COLORS = {
  thrust: '#82b4c4',
  vibe: '#c4a882',
  clit: '#c482a8',
} as const;

type Tab = 'control' | 'music' | 'test';

const SEND_INTERVAL = 50;

export default function TentaclePanel({ theme: t, onClose }: Props) {
  const state = useAfterKiss();
  const [tab, setTab] = useState<Tab>('control');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: t.bg,
        color: t.text,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px 10px',
          paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
          borderBottom: `1px solid ${t.bd}`,
          background: `${t.bg}dd`,
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: t.tm,
            padding: 4,
            fontSize: 12,
            fontFamily: "'Crimson Pro','Noto Serif SC',serif",
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3L5 8L10 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          回房间
        </button>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 15,
              letterSpacing: 4,
              color: t.ac,
              fontWeight: 400,
            }}
          >
            理理酱の触手
          </div>
          <div
            style={{
              fontSize: 10,
              color: t.tm,
              marginTop: 2,
              letterSpacing: 2,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: state.connected ? '#82c4a0' : '#c45858',
                marginRight: 6,
                boxShadow: state.connected ? '0 0 6px #82c4a0' : 'none',
                verticalAlign: 'middle',
              }}
            />
            {state.connected
              ? `已连接 ${state.deviceName ?? ''}`
              : state.connecting
                ? '搜索中…'
                : '未连接'}
          </div>
        </div>
        <div style={{ width: 56 }} />
      </div>

      {/* Connect button */}
      <button
        onClick={() => (state.connected ? afterkiss.disconnect() : afterkiss.connect())}
        disabled={state.connecting}
        style={{
          display: 'block',
          width: 'calc(100% - 32px)',
          margin: '14px auto 6px',
          padding: 12,
          background: t.sl,
          border: `1px solid ${state.connected ? '#82c4a0' : t.bd}`,
          color: state.connected ? '#82c4a0' : t.ac,
          fontFamily: 'inherit',
          fontSize: 13,
          letterSpacing: 2,
          cursor: state.connecting ? 'wait' : 'pointer',
          opacity: state.connecting ? 0.6 : 1,
        }}
      >
        {state.connecting
          ? '搜索中…'
          : state.connected
            ? '断开连接'
            : '连接 AfterKiss'}
      </button>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${t.bd}`,
          marginTop: 8,
        }}
      >
        {(['control', 'music', 'test'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: 12,
              textAlign: 'center',
              fontSize: 12,
              letterSpacing: 1,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: tab === id ? t.ac : t.tm,
              borderBottom: `2px solid ${tab === id ? t.ac : 'transparent'}`,
              fontFamily: 'inherit',
            }}
          >
            {id === 'control' ? '控制面板' : id === 'music' ? '八音盒' : '测试'}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px 100px',
        }}
      >
        {tab === 'control' && <ControlPanel theme={t} connected={state.connected} />}
        {tab === 'music' && <MusicBox theme={t} connected={state.connected} />}
        {tab === 'test' && <TestPanel theme={t} />}
      </div>

      {/* Floating emergency stop */}
      <button
        onClick={() => void afterkiss.emergencyStop()}
        style={{
          position: 'fixed',
          bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          right: 20,
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#c45858',
          border: '3px solid #ff6b6b',
          color: 'white',
          fontFamily: 'inherit',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 70,
          boxShadow: '0 0 20px rgba(196,88,88,0.4)',
        }}
        aria-label="急停"
      >
        急停
      </button>
    </div>
  );
}

// ─── Control panel (3 sliders) ────────────────────────────────────────

function ControlPanel({ theme: t, connected }: { theme: BedroomTheme; connected: boolean }) {
  const [thrust, setThrust] = useState(0);
  const [vibe, setVibe] = useState(0);
  const [clit, setClit] = useState(0);
  const [realtime, setRealtime] = useState(true);
  const lastSendRef = useRef(0);

  function maybeSendRealtime(t: number, v: number, c: number) {
    if (!realtime || !connected) return;
    const now = Date.now();
    if (now - lastSendRef.current < SEND_INTERVAL) return;
    lastSendRef.current = now;
    void afterkiss.setChannels(t, v, c);
  }

  function commitSend() {
    if (!connected) return;
    void afterkiss.setChannels(thrust, vibe, clit);
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: t.sl,
          border: `1px solid ${t.bd}`,
          marginBottom: 16,
        }}
      >
        <label style={{ fontSize: 12, color: t.tm }}>实时发送（拖动即生效）</label>
        <ToggleSwitch checked={realtime} onChange={setRealtime} theme={t} />
      </div>

      <ChannelSlider
        label="抽插"
        color={CHANNEL_COLORS.thrust}
        value={thrust}
        onChange={(v) => {
          setThrust(v);
          maybeSendRealtime(v, vibe, clit);
        }}
        onCommit={commitSend}
        theme={t}
      />
      <ChannelSlider
        label="棒身震动"
        color={CHANNEL_COLORS.vibe}
        value={vibe}
        onChange={(v) => {
          setVibe(v);
          maybeSendRealtime(thrust, v, clit);
        }}
        onCommit={commitSend}
        theme={t}
      />
      <ChannelSlider
        label="阴蒂"
        color={CHANNEL_COLORS.clit}
        value={clit}
        onChange={(v) => {
          setClit(v);
          maybeSendRealtime(thrust, vibe, v);
        }}
        onCommit={commitSend}
        theme={t}
      />

      <button
        onClick={commitSend}
        disabled={!connected}
        style={{
          width: '100%',
          padding: 14,
          background: t.sl,
          border: `1px solid ${t.ac}`,
          color: t.ac,
          fontFamily: 'inherit',
          fontSize: 13,
          letterSpacing: 2,
          cursor: connected ? 'pointer' : 'not-allowed',
          marginTop: 8,
          opacity: connected ? 1 : 0.3,
        }}
      >
        发送指令
      </button>
    </>
  );
}

function ChannelSlider({
  label,
  color,
  value,
  onChange,
  onCommit,
  theme: t,
}: {
  label: string;
  color: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  theme: BedroomTheme;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, letterSpacing: 1, color }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 300, minWidth: 36, textAlign: 'right', color }}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        style={{
          width: '100%',
          accentColor: color,
          background: t.sl,
        }}
      />
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  theme: t,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  theme: BedroomTheme;
}) {
  return (
    <label style={{ position: 'relative', width: 48, height: 24, display: 'inline-block' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: checked ? t.ac : t.sl,
          border: `1px solid ${checked ? t.ac : t.bd}`,
          transition: '0.3s',
          borderRadius: 24,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            position: 'absolute',
            height: 18,
            width: 18,
            left: checked ? 26 : 2,
            top: 2,
            background: checked ? t.bg : t.tm,
            transition: '0.3s',
            borderRadius: '50%',
          }}
        />
      </span>
    </label>
  );
}

// ─── Music box (paper tape player) ────────────────────────────────────

function MusicBox({ theme: t, connected }: { theme: BedroomTheme; connected: boolean }) {
  const [text, setText] = useState('');
  const [score, setScore] = useState<ScoreItem[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Persist last-sent channel values across partial updates.
  const channelsRef = useRef({ t: 0, v: 0, c: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const indexRef = useRef(0);
  const scoreRef = useRef<ScoreItem[]>([]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function play() {
    if (playingRef.current) return;
    if (indexRef.current === 0 || scoreRef.current.length === 0) {
      const parsed = parseScore(text);
      scoreRef.current = parsed;
      setScore(parsed);
      channelsRef.current = { t: 0, v: 0, c: 0 };
    }
    playingRef.current = true;
    setPlaying(true);
    void step();
  }

  function pause() {
    playingRef.current = false;
    setPlaying(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function stop() {
    pause();
    indexRef.current = 0;
    setIndex(0);
    channelsRef.current = { t: 0, v: 0, c: 0 };
    if (connected) void afterkiss.setChannels(0, 0, 0);
  }

  async function step() {
    if (!playingRef.current || indexRef.current >= scoreRef.current.length) {
      stop();
      return;
    }
    const item = scoreRef.current[indexRef.current];
    setIndex(indexRef.current);
    let delay = 500;
    switch (item.type) {
      case 'text':
        delay = 2000;
        break;
      case 'control': {
        const c = channelsRef.current;
        if (item.thrust !== null) c.t = item.thrust;
        if (item.vibe !== null) c.v = item.vibe;
        if (item.clit !== null) c.c = item.clit;
        if (connected) await afterkiss.setChannels(c.t, c.v, c.c);
        break;
      }
      case 'raw': {
        const bytes = parseHex(item.hex);
        if (bytes.length > 0 && connected) await afterkiss.writeMotor(bytes);
        break;
      }
      case 'command':
        if (item.action === 'stop') {
          channelsRef.current = { t: 0, v: 0, c: 0 };
          if (connected) await afterkiss.setChannels(0, 0, 0);
        } else if (item.action === 'off') {
          if (connected) await afterkiss.powerOff();
        }
        break;
      case 'wait':
        delay = item.seconds * 1000;
        break;
    }
    indexRef.current += 1;
    timeoutRef.current = setTimeout(() => void step(), delay);
  }

  const textLines = score
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.type === 'text');
  const currentTextIdx = score
    .slice(0, index + 1)
    .filter((s) => s.type === 'text').length - 1;

  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`乐谱格式：
[T:50,V:30,C:40] - 设置三通道
[T:50] - 只设置抽插
[wait:2] - 等待2秒
[STOP] - 全部停止
[OFF] - 关机

示例：
缓缓地... [T:20]
加速... [T:50,C:30]
[wait:3]
高潮 [T:80,V:60,C:70]
[wait:5]
[STOP]
余韵...`}
        style={{
          width: '100%',
          minHeight: 200,
          padding: 16,
          background: t.sl,
          border: `1px solid ${t.bd}`,
          color: t.text,
          fontFamily: 'inherit',
          fontSize: 14,
          lineHeight: 2,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          onClick={() => (playing ? pause() : play())}
          style={{
            flex: 1,
            padding: 12,
            background: t.sl,
            border: `1px solid ${playing ? '#82c4a0' : t.bd}`,
            color: playing ? '#82c4a0' : t.text,
            fontFamily: 'inherit',
            fontSize: 12,
            letterSpacing: 1,
            cursor: 'pointer',
          }}
        >
          {playing ? '⏸ 暂停' : index > 0 ? '▶ 继续' : '▶ 播放'}
        </button>
        <button
          onClick={stop}
          style={{
            flex: 1,
            padding: 12,
            background: t.sl,
            border: `1px solid ${t.bd}`,
            color: t.text,
            fontFamily: 'inherit',
            fontSize: 12,
            letterSpacing: 1,
            cursor: 'pointer',
          }}
        >
          ■ 停止
        </button>
      </div>
      {score.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 20,
            background: t.sl,
            border: `1px solid ${t.bd}`,
            minHeight: 120,
          }}
        >
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {textLines.map(({ s, i }, n) => (
              <div
                key={i}
                style={{
                  fontSize: 14,
                  lineHeight: 2,
                  color: n === currentTextIdx ? t.ac : t.tm,
                  opacity: n < currentTextIdx ? 0.5 : 1,
                  fontWeight: n === currentTextIdx ? 600 : 300,
                }}
              >
                {s.type === 'text' && s.content}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: t.tm,
              textAlign: 'center',
            }}
          >
            {Math.min(index + 1, score.length)} / {score.length}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Test / raw hex + log ─────────────────────────────────────────────

function TestPanel({ theme: t }: { theme: BedroomTheme }) {
  const state = useAfterKiss();
  const [hex, setHex] = useState('');

  function send() {
    const bytes = parseHex(hex);
    if (bytes.length === 0) return;
    void afterkiss.writeMotor(bytes);
  }

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: t.tm,
            marginBottom: 6,
            letterSpacing: 1,
          }}
        >
          原始 HEX 指令（四字节格式）
        </label>
        <input
          type="text"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          placeholder="00 32 32 32"
          style={{
            width: '100%',
            padding: 12,
            background: t.sl,
            border: `1px solid ${t.bd}`,
            color: t.text,
            fontFamily: 'monospace',
            fontSize: 16,
            letterSpacing: 2,
          }}
        />
      </div>
      <button
        onClick={send}
        disabled={!state.connected}
        style={{
          width: '100%',
          padding: 14,
          background: t.sl,
          border: `1px solid ${t.ac}`,
          color: t.ac,
          fontFamily: 'inherit',
          fontSize: 13,
          letterSpacing: 2,
          cursor: state.connected ? 'pointer' : 'not-allowed',
          opacity: state.connected ? 1 : 0.3,
        }}
      >
        发送原始指令
      </button>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: t.sl,
          border: `1px solid ${t.bd}`,
          fontSize: 11,
          color: t.tm,
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: t.text }}>AfterKiss 协议 (0x600A，四字节)：</strong>
        <br />
        <br />
        <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, color: t.ac }}>
          00
        </code>{' '}
        保留位（固定 00）
        <br />
        <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, color: t.ac }}>
          字节1
        </code>{' '}
        抽插速度 (0–100)
        <br />
        <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, color: t.ac }}>
          字节2
        </code>{' '}
        棒身震动 (0–100)
        <br />
        <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, color: t.ac }}>
          字节3
        </code>{' '}
        阴蒂震动 (0–100)
        <br />
        <br />
        停止：
        <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, color: t.ac }}>
          00 00 00 00
        </code>
        　　全开：
        <code style={{ background: t.bg, padding: '2px 6px', borderRadius: 3, color: t.ac }}>
          00 64 64 64
        </code>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: t.bg,
          border: `1px solid ${t.bd}`,
          fontFamily: 'monospace',
          fontSize: 11,
          color: t.tm,
          maxHeight: 200,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {state.log.length === 0 ? (
          <span style={{ opacity: 0.5 }}>（日志为空）</span>
        ) : (
          state.log
            .map((l) => {
              const time = new Date(l.time).toLocaleTimeString('zh-CN', { hour12: false });
              return `[${time}] ${l.text}`;
            })
            .join('\n')
        )}
      </div>
    </>
  );
}
