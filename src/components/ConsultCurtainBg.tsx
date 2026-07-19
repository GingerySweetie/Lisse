import { useEffect, useRef } from 'react';

/**
 * Default consult wallpaper: vertical alternating white / pale-lavender
 * stripes that gently undulate like closed daytime curtains.
 */

const WHITE = '#ffffff';
/** Pale purple — clearly readable against white, still soft like closed curtains. */
const LAVENDER = '#ddd0eb';
const LAVENDER_SOFT = '#e9dff4';

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

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function stripeX(i: number, y: number, time: number): number {
      // Base column + soft fabric sway: amplitude grows slightly mid-height
      // so the curtains breathe, not just slide rigidly.
      const stripeW = w / 12;
      const base = i * stripeW;
      const mid = Math.sin((y / h) * Math.PI);
      const wave =
        Math.sin(y * 0.018 + time * 0.55 + i * 0.7) * (5.5 + mid * 3.5) +
        Math.sin(y * 0.007 + time * 0.28 + i * 1.3) * 2.2;
      return base + wave;
    }

    function draw() {
      if (!ctx || !running) return;
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Soft white base so gaps never flash dark.
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, w, h);

      const cols = 13; // one extra so the right edge stays covered while waving
      for (let i = 0; i < cols; i++) {
        const isLav = i % 2 === 1;
        ctx.beginPath();
        // Left edge top → bottom
        ctx.moveTo(stripeX(i, 0, t), 0);
        const steps = Math.max(24, Math.ceil(h / 8));
        for (let s = 1; s <= steps; s++) {
          const y = (s / steps) * h;
          ctx.lineTo(stripeX(i, y, t), y);
        }
        // Right edge bottom → top
        for (let s = steps; s >= 0; s--) {
          const y = (s / steps) * h;
          ctx.lineTo(stripeX(i + 1, y, t), y);
        }
        ctx.closePath();

        if (isLav) {
          // Mild vertical wash so stripes feel lit from above (daylight).
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, LAVENDER_SOFT);
          g.addColorStop(0.45, LAVENDER);
          g.addColorStop(1, LAVENDER_SOFT);
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = WHITE;
        }
        ctx.fill();
      }

      // Warm daylight seep near the top — curtains closed, sun outside.
      const day = ctx.createRadialGradient(w * 0.5, -h * 0.05, 0, w * 0.5, 0, h * 0.55);
      day.addColorStop(0, 'rgba(255, 236, 214, 0.22)');
      day.addColorStop(0.45, 'rgba(230, 210, 245, 0.08)');
      day.addColorStop(1, 'rgba(255,255,255,0)');
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
