import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor — Android shell for Wisteria.
 *
 * webDir points at the Vite build output so `npx cap sync` copies the
 * compiled SPA into the native project. androidScheme = https makes the
 * webview treat localhost as a secure origin, which is needed so the
 * IndexedDB / Service Worker / Web Bluetooth surfaces all behave the
 * same as on Cloudflare Pages.
 */
const config: CapacitorConfig = {
  appId: 'com.gingery.wisteria',
  appName: 'Wisteria',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#F4ECF6',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
