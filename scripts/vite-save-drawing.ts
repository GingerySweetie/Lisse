/**
 * Dev-only middleware: POST /api/save-drawing { dataUrl }
 * writes PNG under /opt/cursor/artifacts/ and /workspace/artifacts/
 * so the agent can read pixel data.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const DESTINATIONS = [
  '/opt/cursor/artifacts/screenshots/ripple-hand.png',
  path.resolve(process.cwd(), 'artifacts/ripple-hand.png'),
];

export function saveDrawingPlugin(): Plugin {
  return {
    name: 'save-drawing',
    configureServer(server) {
      server.middlewares.use('/api/save-drawing', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            const body = JSON.parse(raw) as { dataUrl?: string; name?: string };
            const dataUrl = body.dataUrl ?? '';
            const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
            if (!m) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'need data:image/png;base64,...' }));
              return;
            }
            const buf = Buffer.from(m[1], 'base64');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const named = body.name?.replace(/[^\w.-]+/g, '_') || 'ripple-hand';
            const written: string[] = [];
            for (const dest of DESTINATIONS) {
              fs.mkdirSync(path.dirname(dest), { recursive: true });
              fs.writeFileSync(dest, buf);
              written.push(dest);
              // also keep a timestamped copy next to the latest
              const stamped = path.join(
                path.dirname(dest),
                `${named}-${stamp}.png`,
              );
              fs.writeFileSync(stamped, buf);
              written.push(stamped);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, written, bytes: buf.length }));
          } catch (e) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        });
      });
    },
  };
}
