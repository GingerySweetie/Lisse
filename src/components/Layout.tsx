import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';
import ClawdPet from './clawd/ClawdPet';
import { bootstrapBehavior, recordVisibilityChange } from '../lib/behavior';
import { bootstrapDiary } from '../lib/diary';
import { bootstrapWeeklyDiary } from '../lib/weekly-diary';
import { bootstrapProactiveNudge } from '../lib/proactive-nudge';
import { bootstrapTravelDaemon } from '../lib/travel';
import { resetStatusBar } from '../lib/status-bar';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  /** Consult room is fully immersive — no sidebar / clawd chrome. */
  const isConsult = location.pathname.startsWith('/consult');

  // Restore default lavender status bar whenever we land on any non-themed
  // room route. Consult / chat (skins) manage their own colour.
  useEffect(() => {
    if (
      !location.pathname.startsWith('/consult') &&
      !location.pathname.startsWith('/chat')
    ) {
      void resetStatusBar();
    }
  }, [location.pathname]);

  // Close sidebar if we navigate into consult.
  useEffect(() => {
    if (isConsult) setSidebarOpen(false);
  }, [isConsult]);

  useEffect(() => {
    bootstrapBehavior();
    bootstrapProactiveNudge();
    bootstrapTravelDaemon();
    bootstrapDiary();
    bootstrapWeeklyDiary();
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
  // Disabled inside consult (immersive room).
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (isConsult) return;
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
  }, [isConsult]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Mobile overlay */}
      {!isConsult && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden entirely on consult routes */}
      {!isConsult && (
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[82%] max-w-[340px] transform shadow-[4px_0_24px_rgba(90,50,100,0.1)] transition-transform duration-300 md:relative md:w-72 md:max-w-none md:translate-x-0 md:shadow-none ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{
            background:
              'linear-gradient(180deg, #f8f2fb 0%, #f3ecf6 40%, #f0e8f3 100%)',
          }}
        >
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </aside>
      )}

      {/* Main */}
      <main className="relative flex h-full w-full flex-1 flex-col">
        {!isConsult && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开侧边栏"
            className="absolute left-0 top-0 z-20 h-14 w-7 cursor-default opacity-0 md:hidden"
          />
        )}
        <ErrorBoundary key={location.pathname} label={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      {!isConsult && <ClawdPet />}
    </div>
  );
}
