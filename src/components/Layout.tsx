import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';
import { bootstrapBehavior, recordVisibilityChange } from '../lib/behavior';
import { bootstrapProactiveNudge } from '../lib/proactive-nudge';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    bootstrapBehavior();
    bootstrapProactiveNudge();
    function onVis() {
      recordVisibilityChange();
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    window.addEventListener('pageshow', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
      window.removeEventListener('pageshow', onVis);
    };
  }, []);

  // Edge-swipe to open sidebar — replaces the hamburger button.
  // Touch must start within EDGE_PX of the left screen edge and travel
  // right by SWIPE_PX. Vertical drift must stay smaller than the horizontal
  // distance so vertical scroll gestures don't trip the sidebar.
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const EDGE_PX = 24;
    const SWIPE_PX = 60;
    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= EDGE_PX) {
        swipeRef.current = { x: t.clientX, y: t.clientY };
      } else {
        swipeRef.current = null;
      }
    }
    function onEnd(e: TouchEvent) {
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dx >= SWIPE_PX && dy < dx) {
        setSidebarOpen(true);
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[82%] max-w-[340px] transform shadow-[4px_0_24px_rgba(90,50,100,0.1)] transition-transform duration-300 md:relative md:w-72 md:max-w-none md:translate-x-0 md:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background:
            'linear-gradient(180deg, #f8f2fb 0%, #f3ecf6 40%, #f0e8f3 100%)',
          // On edge-to-edge Android the aside extends to the very top of the
          // viewport (behind the transparent status bar). Shift its contents
          // down so they aren't hidden beneath the status bar icons.
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </aside>

      {/* Main */}
      <main className="relative flex h-full w-full flex-1 flex-col">
        {/* Invisible left-edge tap zone — keyboard / mouse users get a
            way to open the sidebar even though the hamburger button is
            gone. Hidden on md+ where the sidebar is permanent. */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开侧边栏"
          className="absolute left-0 top-0 z-20 h-14 w-7 cursor-default opacity-0 md:hidden"
        />
        <ErrorBoundary key={location.pathname} label={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
