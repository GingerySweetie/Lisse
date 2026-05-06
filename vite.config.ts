import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Lisse',
        short_name: 'Lisse',
        description: '一个能续聊老对话的多模型客户端',
        theme_color: '#D4C5E2',
        background_color: '#E8DFF0',
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
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
