import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { saveDrawingPlugin } from './scripts/vite-save-drawing'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    saveDrawingPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Wisteria',
        short_name: 'Wisteria',
        description: '一个能续聊老对话的多模型客户端',
        theme_color: '#F5F0FA',
        background_color: '#F4ECF6',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/api/],
        // Take over from old SW the moment a new one is installed, instead of
        // waiting for every tab to close. Combined with autoUpdate this means
        // a new deploy is picked up on the next page load.
        skipWaiting: true,
        clientsClaim: true,
        // Cache the bundled web font (霞鹜文楷 from jsDelivr) on first
        // request so it's available offline thereafter.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'cdn.jsdelivr.net' &&
              /\.(?:woff2?|ttf|otf)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'web-fonts',
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
