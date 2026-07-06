import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PanelLeftOpen } from 'lucide-react';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';
import { bootstrapBehavior, recordVisibilityChange } from '../lib/behavior';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const location = useLocation();

  function toggleDesktopSidebar() {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    bootstrapBehavior();
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
        className={`fixed inset-y-0 left-0 z-40 w-[82%] max-w-[340px] transform shadow-[4px_0_24px_rgba(90,50,100,0.1)] transition-all duration-300 md:relative md:max-w-none md:overflow-hidden md:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'md:w-0' : 'md:w-72 md:translate-x-0'}`}
        style={{
          background:
            'linear-gradient(180deg, #f8f2fb 0%, #f3ecf6 40%, #f0e8f3 100%)',
        }}
      >
        <Sidebar
          onNavigate={() => setSidebarOpen(false)}
          onCollapse={toggleDesktopSidebar}
        />
      </aside>

      {/* Main */}
      <main className="relative flex h-full w-full flex-1 flex-col">
        {/* Mobile: invisible left-edge tap zone */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开侧边栏"
          className="absolute left-0 top-0 z-20 h-14 w-7 cursor-default opacity-0 md:hidden"
        />
        {/* Desktop: expand button shown only when sidebar is collapsed */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={toggleDesktopSidebar}
            aria-label="展开侧边栏"
            className="absolute left-2 top-3 z-20 hidden items-center justify-center rounded-lg p-1.5 text-[#7a5a88] transition hover:bg-[rgba(176,138,204,0.15)] hover:text-[#5a4060] md:flex"
          >
            <PanelLeftOpen size={18} strokeWidth={1.5} />
          </button>
        )}
        <ErrorBoundary key={location.pathname} label={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
