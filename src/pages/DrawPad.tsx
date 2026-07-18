/**
 * Hand-drawing pad for the Ripple lettering.
 * Draw → 「保存给 AI」writes PNG to artifacts for pixel readout.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './draw-pad.css';

const INK = '#8aa7c4';
const BG = '#f7f9fc';
const CANVAS_W = 900;
const CANVAS_H = 360;

type Pt = { x: number; y: number };

export default function DrawPadPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef<Pt[][]>([]);
  const current = useRef<Pt[]>([]);
  const [brush, setBrush] = useState(6);
  const [status, setStatus] = useState('在画板上写 Ripple · 画完点「保存给 AI」');
  const [busy, setBusy] = useState(false);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, c.width, c.height);

    // light guide baseline
    ctx.strokeStyle = 'rgba(138,167,196,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, c.height * 0.62);
    ctx.lineTo(c.width - 40, c.height * 0.62);
    ctx.stroke();

    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush;

    const all = [...strokes.current];
    if (current.current.length) all.push(current.current);
    for (const stroke of all) {
      if (stroke.length < 2) {
        if (stroke[0]) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, brush / 2, 0, Math.PI * 2);
          ctx.fillStyle = INK;
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }, [brush]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    redraw();
  }, [redraw]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>): Pt {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    return {
      x: (e.clientX - r.left) * sx,
      y: (e.clientY - r.top) * sy,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    current.current = [pos(e)];
    redraw();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    current.current.push(pos(e));
    redraw();
  }

  function onUp() {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current.length) {
      strokes.current.push(current.current);
      current.current = [];
    }
    redraw();
  }

  function undo() {
    strokes.current.pop();
    redraw();
    setStatus('撤销一笔');
  }

  function clear() {
    strokes.current = [];
    current.current = [];
    redraw();
    setStatus('已清空');
  }

  function toDataUrl(): string {
    const c = canvasRef.current!;
    // export on clean white-ish bg, no guide line
    const off = document.createElement('canvas');
    off.width = c.width;
    off.height = c.height;
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush;
    for (const stroke of strokes.current) {
      if (stroke.length < 2) {
        if (stroke[0]) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, brush / 2, 0, Math.PI * 2);
          ctx.fillStyle = INK;
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
    return off.toDataURL('image/png');
  }

  async function saveForAgent() {
    if (!strokes.current.length) {
      setStatus('先画几个字再保存');
      return;
    }
    setBusy(true);
    setStatus('保存中…');
    try {
      const dataUrl = toDataUrl();
      const res = await fetch('/api/save-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, name: 'ripple-hand' }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        written?: string[];
        error?: string;
      };
      if (!json.ok) throw new Error(json.error || 'save failed');
      setStatus(`已保存 · 告诉我「读画板」即可开始复刻`);
    } catch (e) {
      setStatus(
        `保存失败：${e instanceof Error ? e.message : String(e)}（可先下载 PNG 再上传）`,
      );
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!strokes.current.length) {
      setStatus('先画几个字再下载');
      return;
    }
    const a = document.createElement('a');
    a.href = toDataUrl();
    a.download = 'ripple-hand.png';
    a.click();
    setStatus('已下载 PNG');
  }

  return (
    <div className="drawpad">
      <header className="drawpad-head">
        <div>
          <h1 className="drawpad-title">Ripple 手写板</h1>
          <p className="drawpad-sub">
            把你的字母画在这里 → 保存 → 我按像素复刻。和穆恩字母是两件事。
          </p>
        </div>
        <Link to="/demo" className="drawpad-link">
          ← 回 Demo
        </Link>
      </header>

      <div className="drawpad-toolbar">
        <label className="drawpad-brush">
          笔粗
          <input
            type="range"
            min={3}
            max={14}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
          />
          <span>{brush}</span>
        </label>
        <button type="button" onClick={undo}>
          撤销
        </button>
        <button type="button" onClick={clear}>
          清空
        </button>
        <button type="button" onClick={download}>
          下载 PNG
        </button>
        <button
          type="button"
          className="drawpad-primary"
          onClick={() => void saveForAgent()}
          disabled={busy}
        >
          {busy ? '保存中…' : '保存给 AI'}
        </button>
      </div>

      <div className="drawpad-frame">
        <canvas
          ref={canvasRef}
          className="drawpad-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>

      <p className="drawpad-status" role="status">
        {status}
      </p>
    </div>
  );
}
