import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import ShareIntent, { type SharePayload } from '../lib/native/share-intent';
import { createBook } from '../lib/books';

/**
 * Listens for Android share-intent payloads and routes book-like files
 * (epub / txt / md) straight into the library + opens them. Mount once
 * inside <BrowserRouter> — it has no UI.
 *
 * Cold-start shares (app launched via "Share to Wisteria") and warm
 * shares (app already running) are both handled.
 */
export default function ShareReceiver() {
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    let handle: { remove: () => void } | undefined;

    async function handle_payload(p: SharePayload | null | undefined) {
      if (!p || cancelled) return;
      const file = p.files?.[0];
      if (!file) return;
      try {
        const bin = atob(file.data);
        const isEpub =
          file.mimeType === 'application/epub+zip' ||
          file.name.toLowerCase().endsWith('.epub');

        if (isEpub) {
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const f = new File([bytes], file.name, {
            type: 'application/epub+zip',
          });
          const { parseEpub } = await import('../lib/epub');
          const parsed = await parseEpub(f);
          const book = await createBook({
            title: parsed.title ?? file.name.replace(/\.epub$/i, ''),
            author: parsed.author,
            content: parsed.content,
            format: parsed.format,
            toc: parsed.toc,
          });
          if (!cancelled) navigate(`/read/${book.id}`);
          return;
        }

        // text / md: decode as UTF-8.
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const text = decoder.decode(arr);
        const isMd = /\.(md|markdown)$/i.test(file.name);
        const book = await createBook({
          title: file.name.replace(/\.(txt|md|markdown)$/i, '') || 'shared',
          content: text,
          format: isMd ? 'md' : 'txt',
        });
        if (!cancelled) navigate(`/read/${book.id}`);
      } catch {
        // Silently drop bad payloads — better than crashing.
      }
    }

    (async () => {
      try {
        const initial = await ShareIntent.getInitialShare();
        await handle_payload(initial.share);
        handle = await ShareIntent.addListener('shareReceived', (p) => {
          void handle_payload(p);
        });
      } catch {
        // Plugin not available — non-Android shim.
      }
    })();

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [navigate]);

  return null;
}
