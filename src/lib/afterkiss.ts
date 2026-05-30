import { useEffect, useState } from 'react';

/**
 * AfterKiss BLE manager. Singleton so connection state survives panel
 * open/close and route navigation within the bedroom. Subscribers
 * (React components) re-render via the `useAfterKiss` hook.
 *
 * Protocol (0x600A characteristic, 4 bytes):
 *   [0x00, thrust, vibe, clit]   (values 0–100)
 *
 * Power characteristic (separate service): write 0x00 to power off.
 */

const SERVICE_UUID = 0x6000;
const MOTOR_CHAR_UUID = 0x600a;
const POWER_SERVICE_UUID = '00010203-0405-0607-0809-0a0b0c0d1912';
const POWER_CHAR_UUID = '00010203-0405-0607-0809-0a0b0c0d2b12';

export interface LogLine {
  time: number;
  text: string;
}

export interface AfterKissState {
  connected: boolean;
  connecting: boolean;
  deviceName: string | null;
  lastError: string | null;
  log: LogLine[];
}

class AfterKissManager {
  private device: BluetoothDevice | null = null;
  private motorChar: BluetoothRemoteGATTCharacteristic | null = null;
  private powerChar: BluetoothRemoteGATTCharacteristic | null = null;
  private state: AfterKissState = {
    connected: false,
    connecting: false,
    deviceName: null,
    lastError: null,
    log: [],
  };
  private subscribers = new Set<(s: AfterKissState) => void>();

  getState(): AfterKissState {
    return this.state;
  }

  subscribe(fn: (s: AfterKissState) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private setState(patch: Partial<AfterKissState>) {
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach((fn) => fn(this.state));
  }

  private pushLog(text: string) {
    const log = [...this.state.log, { time: Date.now(), text }].slice(-200);
    this.setState({ log });
  }

  /** Returns true if the browser exposes Web Bluetooth at all. */
  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connect(): Promise<void> {
    if (!AfterKissManager.supported()) {
      this.pushLog('此浏览器不支持 Web Bluetooth');
      this.setState({ lastError: '此浏览器不支持 Web Bluetooth' });
      return;
    }
    if (this.state.connecting || this.state.connected) return;
    this.setState({ connecting: true, lastError: null });
    try {
      this.pushLog('正在搜索…');
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID, POWER_SERVICE_UUID],
      });
      this.pushLog('已找到: ' + (this.device.name ?? '(unnamed)'));
      this.device.addEventListener('gattserverdisconnected', () => {
        this.pushLog('设备已断开');
        this.motorChar = null;
        this.powerChar = null;
        this.setState({ connected: false });
      });
      const server = await this.device.gatt!.connect();
      this.pushLog('GATT 已连接');
      try {
        const svc = await server.getPrimaryService(SERVICE_UUID);
        this.motorChar = await svc.getCharacteristic(MOTOR_CHAR_UUID);
        this.pushLog('马达控制就绪 (0x600A)');
      } catch (e) {
        this.pushLog(
          '警告: 马达特征获取失败 - ' +
            (e instanceof Error ? e.message : String(e)),
        );
      }
      try {
        const psvc = await server.getPrimaryService(POWER_SERVICE_UUID);
        this.powerChar = await psvc.getCharacteristic(POWER_CHAR_UUID);
        this.pushLog('电源控制就绪');
      } catch (e) {
        this.pushLog(
          '警告: 电源特征获取失败 - ' +
            (e instanceof Error ? e.message : String(e)),
        );
      }
      this.setState({
        connected: true,
        connecting: false,
        deviceName: this.device.name ?? '(unnamed)',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.pushLog('连接失败: ' + msg);
      this.setState({ connecting: false, connected: false, lastError: msg });
    }
  }

  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.motorChar = null;
    this.powerChar = null;
    this.setState({ connected: false });
    this.pushLog('已断开');
  }

  async writeMotor(bytes: number[]): Promise<void> {
    if (!this.motorChar) {
      this.pushLog('马达特征未就绪');
      return;
    }
    try {
      const data = new Uint8Array(bytes);
      await this.motorChar.writeValueWithoutResponse(data);
      this.pushLog(
        '发送: ' +
          Array.from(data)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' '),
      );
    } catch (e) {
      this.pushLog(
        '发送失败: ' + (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  setChannels(thrust: number, vibe: number, clit: number): Promise<void> {
    return this.writeMotor([0x00, clamp(thrust), clamp(vibe), clamp(clit)]);
  }

  async emergencyStop(): Promise<void> {
    this.pushLog('!!! 急停 !!!');
    await this.writeMotor([0x00, 0x00, 0x00, 0x00]);
  }

  async powerOff(): Promise<void> {
    if (!this.powerChar) {
      this.pushLog('电源特征未就绪');
      return;
    }
    try {
      await this.powerChar.writeValueWithoutResponse(new Uint8Array([0x00]));
      this.pushLog('已发送关机');
    } catch (e) {
      this.pushLog(
        '关机失败: ' + (e instanceof Error ? e.message : String(e)),
      );
    }
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const afterkiss = new AfterKissManager();

export function useAfterKiss(): AfterKissState {
  const [s, setS] = useState(afterkiss.getState());
  useEffect(() => afterkiss.subscribe(setS), []);
  return s;
}

// ─── Score parsing (music box) ────────────────────────────────────────

export type ScoreItem =
  | { type: 'text'; content: string }
  | { type: 'control'; thrust: number | null; vibe: number | null; clit: number | null }
  | { type: 'raw'; hex: string }
  | { type: 'wait'; seconds: number }
  | { type: 'command'; action: 'stop' | 'off' };

export function parseScore(text: string): ScoreItem[] {
  const lines = text.split('\n');
  const score: ScoreItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Whole-line command: [STOP], [wait:2], [T:50,V:30] alone on the line.
    const cmdMatch = trimmed.match(/^\[(.+)\]$/);
    if (cmdMatch) {
      pushCommandToken(cmdMatch[1], score);
      continue;
    }

    // Mixed line: text with inline [..] commands. Emit the bare text first,
    // then each inline command in order.
    const inlineRegex = /\[([^\]]+)\]/g;
    const textOnly = trimmed.replace(inlineRegex, '').trim();
    if (textOnly) score.push({ type: 'text', content: textOnly });

    let m;
    let sawInline = false;
    while ((m = inlineRegex.exec(trimmed)) !== null) {
      pushCommandToken(m[1], score);
      sawInline = true;
    }
    if (!sawInline && !textOnly) {
      score.push({ type: 'text', content: trimmed });
    }
  }
  return score;
}

function pushCommandToken(token: string, score: ScoreItem[]): void {
  if (token === 'STOP') {
    score.push({ type: 'command', action: 'stop' });
    return;
  }
  if (token === 'OFF') {
    score.push({ type: 'command', action: 'off' });
    return;
  }
  const wait = token.match(/^wait:(\d+\.?\d*)$/);
  if (wait) {
    score.push({ type: 'wait', seconds: parseFloat(wait[1]) });
    return;
  }
  const raw = token.match(/^raw:([0-9a-fA-F\s]+)$/);
  if (raw) {
    score.push({ type: 'raw', hex: raw[1] });
    return;
  }
  // Channels: [T:50,V:30,C:40] in any combination
  const channels: Record<string, number> = {};
  for (const part of token.split(',')) {
    const m = part.trim().match(/^([TVC]):(\d+)$/);
    if (m) channels[m[1]] = parseInt(m[2]);
  }
  if (Object.keys(channels).length > 0) {
    score.push({
      type: 'control',
      thrust: channels.T ?? null,
      vibe: channels.V ?? null,
      clit: channels.C ?? null,
    });
  }
}

export function parseHex(hex: string): number[] {
  const clean = hex.replace(/\s/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.substr(i, 2), 16);
    if (Number.isNaN(byte)) return [];
    out.push(byte);
  }
  return out;
}
