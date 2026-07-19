import { useEffect, useRef } from 'react';

/**
 * Default consult wallpaper: fogged vertical white / pale-lavender folds
 * that breathe like closed daytime curtains — soft haze, not candy stripes.
 */

export default function ConsultCurtainBg() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    let t = 0;
    let running = true;

    // Offscreen buffer for the soft folds so we can blur once per frame
    // without stacking blur on the whole composite.
    const folds = document.createElement('canvas');
    const fctx = folds.getContext('2d');
    if (!fctx) return;

    function resize() {
      if (!canvas || !ctx || !fctx) return;
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Draw folds at half res — natural softness before the explicit blur.
      folds.width = Math.floor(w * dpr * 0.55);
      folds.height = Math.floor(h * dpr * 0.55);
      fctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function foldX(i: number, yNorm: number, time: number, fw: number): number {
      const spacing = fw / 7;
      const base = (i + 0.5) * spacing;
      const mid = Math.sin(yNorm * Math.PI);
      return (
        base +
        Math.sin(yNorm * 4.2 + time * 0.42 + i * 0.9) * (spacing * 0.11) * (0.7 + mid * 0.4) +
        Math.sin(yNorm * 1.6 + time * 0.18 + i * 1.7) * (spacing * 0.05)
      );
    }

    function drawFolds(time: number) {
      if (!fctx) return;
      const fw = folds.width;
      const fh = folds.height;
      fctx.clearRect(0, 0, fw, fh);

      // Warm-white veil base on the buffer.
      fctx.fillStyle = 'rgba(252, 250, 255, 0.0)';
      fctx.fillRect(0, 0, fw, fh);

      const foldsCount = 8;
      const steps = Math.max(18, Math.ceil(fh / 10));

      for (let i = 0; i < foldsCount; i++) {
        // Alternate: denser mist / emptier light — both very soft.
        const denser = i % 2 === 1;
        const bandHalf = denser ? fw * 0.07 : fw * 0.055;
        const alpha = denser ? 0.42 : 0.18;
        const hue = denser ? '168, 148, 198' : '190, 178, 210';

        // Build a soft vertical ribbon as stacked horizontal gradients.
        for (let s = 0; s <= steps; s++) {
          const y0 = (s / steps) * fh;
          const y1 = ((s + 1) / steps) * fh;
          const yMid = (y0 + y1) * 0.5;
          const yNorm = yMid / fh;
          const cx = foldX(i, yNorm, time, fw);
          const g = fctx.createLinearGradient(cx - bandHalf, 0, cx + bandHalf, 0);
          g.addColorStop(0, `rgba(${hue}, 0)`);
          g.addColorStop(0.35, `rgba(${hue}, ${alpha * 0.55})`);
          g.addColorStop(0.5, `rgba(${hue}, ${alpha})`);
          g.addColorStop(0.65, `rgba(${hue}, ${alpha * 0.55})`);
          g.addColorStop(1, `rgba(${hue}, 0)`);
          fctx.fillStyle = g;
          fctx.fillRect(cx - bandHalf, y0, bandHalf * 2, Math.ceil(y1 - y0) + 1);
        }
      }

      // Slow drifting fog patches (horizontal haze).
      for (let k = 0; k < 3; k++) {
        const cy = fh * (0.2 + k * 0.28) + Math.sin(time * 0.15 + k) * fh * 0.04;
        const cx = fw * (0.35 + 0.15 * k) + Math.cos(time * 0.12 + k * 1.3) * fw * 0.08;
        const rg = fctx.createRadialGradient(cx, cy, 0, cx, cy, fw * 0.45);
        rg.addColorStop(0, 'rgba(230, 220, 242, 0.28)');
        rg.addColorStop(0.5, 'rgba(245, 240, 252, 0.1)');
        rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        fctx.fillStyle = rg;
        fctx.fillRect(0, 0, fw, fh);
      }
    }

    function draw() {
      if (!ctx || !running) return;
      t += 0.016;

      // Milky white daylight base.
      const base = ctx.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, '#fbf8fd');
      base.addColorStop(0.45, '#f7f3fb');
      base.addColorStop(1, '#faf8fc');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      drawFolds(t);

      // Upscale + blur = fogged curtain folds.
      ctx.save();
      ctx.filter = `blur(${Math.max(14, w * 0.028)}px)`;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(folds, 0, 0, w, h);
      ctx.restore();

      // Second lighter pass, slightly offset in time → depth / breath.
      drawFolds(t + 1.4);
      ctx.save();
      ctx.filter = `blur(${Math.max(22, w * 0.045)}px)`;
      ctx.globalAlpha = 0.45;
      ctx.drawImage(folds, 0, 0, w, h);
      ctx.restore();

      // Veil: desaturate edges into white mist so nothing reads as hard candy.
      const veil = ctx.createRadialGradient(
        w * 0.5,
        h * 0.42,
        w * 0.15,
        w * 0.5,
        h * 0.5,
        w * 0.85,
      );
      veil.addColorStop(0, 'rgba(255, 255, 255, 0)');
      veil.addColorStop(0.55, 'rgba(252, 250, 255, 0.18)');
      veil.addColorStop(1, 'rgba(250, 248, 252, 0.55)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);

      // Daylight seep from above the closed curtains.
      const day = ctx.createRadialGradient(
        w * 0.5,
        -h * 0.02,
        0,
        w * 0.5,
        h * 0.05,
        h * 0.62,
      );
      day.addColorStop(0, 'rgba(255, 242, 225, 0.2)');
      day.addColorStop(0.4, 'rgba(236, 222, 245, 0.08)');
      day.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = day;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener('resize', resize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
