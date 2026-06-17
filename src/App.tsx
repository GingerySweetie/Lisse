import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateBanner from './components/UpdateBanner';
import ShareReceiver from './components/ShareReceiver';
import BillReceiver from './components/BillReceiver';
import HomePage from './pages/Home';

// Route-level lazy splitting. HomePage stays eager because it's the
// landing page; everything else loads on first navigation so the cold
// start bundle stays small (matters for APK launch + service-worker
// precache size).
const ChatPage = lazy(() => import('./pages/Chat'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const PersonasPage = lazy(() => import('./pages/Personas'));
const ImportExportPage = lazy(() => import('./pages/ImportExport'));
const MemoryPage = lazy(() => import('./pages/Memory'));
const StylesPage = lazy(() => import('./pages/Styles'));
const McpPage = lazy(() => import('./pages/Mcp'));
const ScreenTimePage = lazy(() => import('./pages/ScreenTime'));
const BillSourcesPage = lazy(() => import('./pages/BillSources'));
const BrowserPage = lazy(() => import('./pages/Browser'));
const BrowserScriptsPage = lazy(() => import('./pages/BrowserScripts'));
const BooksPage = lazy(() => import('./pages/Books'));
const ReadPage = lazy(() => import('./pages/Read'));
const BedroomPickerPage = lazy(() => import('./pages/Bedroom'));
const BedroomChatPage = lazy(() => import('./pages/BedroomChat'));
const BillingPage = lazy(() => import('./pages/Billing'));
const BodyPage = lazy(() => import('./pages/Body'));
const MusicPage = lazy(() => import('./pages/Music'));

export default function App() {
  // Capture window-level errors + unhandled promise rejections so async
  // failures (Dexie writes, fetch, etc) become visible instead of leaving
  // the user with a blank page. React's error boundaries only catch
  // render-phase errors; this catches everything else.
  const [globalError, setGlobalError] = useState<{
    msg: string;
    detail?: string;
  } | null>(null);
  useEffect(() => {
    function onErr(e: ErrorEvent) {
      setGlobalError({
        msg: e.message || 'Error',
        detail: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`,
      });
    }
    function onRej(e: PromiseRejectionEvent) {
      const r = e.reason;
      setGlobalError({
        msg: r instanceof Error ? r.message : String(r),
        detail: r instanceof Error ? r.stack : undefined,
      });
    }
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  return (
    <BrowserRouter>
      <ShareReceiver />
      <BillReceiver />
      <Suspense fallback={<RouteSpinner />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/bedroom" element={<BedroomPickerPage />} />
            <Route path="/bedroom/:personaId" element={<BedroomChatPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/bill-sources" element={<BillSourcesPage />} />
            <Route path="/browser" element={<BrowserPage />} />
            <Route path="/browser/scripts" element={<BrowserScriptsPage />} />
            <Route path="/body" element={<BodyPage />} />
            <Route path="/music" element={<MusicPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/personas" element={<PersonasPage />} />
            <Route path="/styles" element={<StylesPage />} />
            <Route path="/mcp" element={<McpPage />} />
            <Route path="/screen-time" element={<ScreenTimePage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route
              path="/read/:bookId"
              element={
                <ErrorBoundary label="读书 /read/:bookId">
                  <ReadPage />
                </ErrorBoundary>
              }
            />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/data" element={<ImportExportPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <UpdateBanner />
      {globalError && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 80,
            zIndex: 200,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(196,88,88,0.95)',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12,
            lineHeight: 1.5,
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                有个错误漏出来了
              </div>
              <div style={{ wordBreak: 'break-word' }}>{globalError.msg}</div>
              {globalError.detail && (
                <details style={{ marginTop: 6, opacity: 0.9 }}>
                  <summary style={{ cursor: 'pointer' }}>详情</summary>
                  <pre
                    style={{
                      marginTop: 4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: 10,
                      maxHeight: 160,
                      overflowY: 'auto',
                    }}
                  >
                    {globalError.detail}
                  </pre>
                </details>
              )}
            </div>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 0,
                borderRadius: 6,
                padding: '4px 10px',
                color: '#fff',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              关掉
            </button>
          </div>
        </div>
      )}
    </BrowserRouter>
  );
}

function RouteSpinner() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(120,100,155,0.4)',
        fontSize: 12,
        letterSpacing: '0.1em',
        fontFamily: "'Noto Sans SC', sans-serif",
        pointerEvents: 'none',
      }}
    >
      ·
    </div>
  );
}
