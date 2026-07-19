import { useEffect, useRef } from 'react';

/**
 * Fogged curtain wash — pale lavender light pooling in soft vertical folds
 * behind a white mist. No hard candy stripes.
 */

export default function ConsultCurtainBg() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    let t = 0;
    let running = true;

    // Low-res field we upscale — this alone softens everything into fog.
    const field = document.createElement('canvas');
    const fctx = field.getContext('2d', { alpha: true });
    if (!fctx) return;

    function resize() {
      if (!canvas || !ctx || !fctx) return;
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Very low res → bilinear upscale = inherent fog.
      field.width = Math.max(48, Math.floor(w / 10));
      field.height = Math.max(64, Math.floor(h / 10));
    }

    function drawField(time: number) {
      if (!fctx) return;
      const fw = field.width;
      const fh = field.height;

      // Milk-white base.
      fctx.fillStyle = '#faf8fc';
      fctx.fillRect(0, 0, fw, fh);

      // Soft vertical luminance field: sine folds + slow phase drift.
      // Sample as wide overlapping Gaussians so no edge ever reads sharp.
      const image = fctx.createImageData(fw, fh);
      const data = image.data;
      const folds = 5.2;
      for (let y = 0; y < fh; y++) {
        const yn = y / fh;
        for (let x = 0; x < fw; x++) {
          const xn = x / fw;
          // Waving fold coordinate.
          const sway =
            Math.sin(yn * 3.4 + time * 0.35) * 0.045 +
            Math.sin(yn * 1.1 + time * 0.17) * 0.03;
          const u = (xn + sway) * folds;
          // Smooth 0..1 pulse per fold (raised cosine) — never a step.
          const pulse = 0.5 + 0.5 * Math.cos(u * Math.PI * 2);
          const soft = pulse * pulse; // bias toward mist, not stripes

          // Depth mist varies slowly across the room.
          const mist =
            0.55 +
            0.25 * Math.sin(xn * 2.2 + time * 0.08) +
            0.2 * Math.sin(yn * 1.4 - time * 0.11);

          // Target: mostly white, lavender only as a whisper in the folds.
          const lav = soft * mist;
          const r = Math.round(250 - lav * 28); // → ~222
          const g = Math.round(248 - lav * 36); // → ~212
          const b = Math.round(252 - lav * 18); // → ~234
          const i = (y * fw + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
      fctx.putImageData(image, 0, 0);

      // Extra fog blobs drifting — painted after so they bloom on upscale.
      for (let k = 0; k < 4; k++) {
        const cx = fw * (0.2 + k * 0.2) + Math.sin(time * 0.13 + k * 1.7) * fw * 0.08;
        const cy = fh * (0.25 + (k % 3) * 0.22) + Math.cos(time * 0.1 + k) * fh * 0.06;
        const rg = fctx.createRadialGradient(cx, cy, 0, cx, cy, fw * 0.35);
        rg.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        rg.addColorStop(0.55, 'rgba(245, 240, 252, 0.12)');
        rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        fctx.fillStyle = rg;
        fctx.beginPath();
        fctx.arc(cx, cy, fw * 0.35, 0, Math.PI * 2);
        fctx.fill();
      }
    }

    function draw() {
      if (!ctx || !running) return;
      t += 0.014;

      drawField(t);

      // Upscale with browser bilinear filtering = fog.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(field, 0, 0, w, h);

      // Optional extra blur pass when supported — doubles the mist.
      try {
        ctx.save();
        ctx.filter = `blur(${Math.max(8, w * 0.012)}px)`;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(field, 0, 0, w, h);
        ctx.restore();
      } catch {
        /* filter unsupported — low-res upscale already foggy */
      }

      // Daylight seep from above the closed curtains.
      const day = ctx.createRadialGradient(
        w * 0.5,
        -h * 0.04,
        0,
        w * 0.5,
        h * 0.1,
        h * 0.7,
      );
      day.addColorStop(0, 'rgba(255, 244, 228, 0.28)');
      day.addColorStop(0.35, 'rgba(240, 228, 248, 0.1)');
      day.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = day;
      ctx.fillRect(0, 0, w, h);

      // Soft vignette into white mist at the edges.
      const veil = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        w * 0.2,
        w * 0.5,
        h * 0.5,
        w * 0.9,
      );
      veil.addColorStop(0, 'rgba(255, 255, 255, 0)');
      veil.addColorStop(1, 'rgba(252, 250, 255, 0.35)');
      ctx.fillStyle = veil;
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
