import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';
import { Menu } from 'lucide-react';
import { bootstrapBehavior, recordVisibilityChange } from '../lib/behavior';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Track visibility transitions so ambient-status inference has fresh
  // timestamps to look at. Bootstraps once on mount, then listens for
  // every show/hide of the tab/PWA.
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
        }}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </aside>

      {/* Main */}
      <main className="relative flex h-full w-full flex-1 flex-col">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="absolute left-3 top-3 z-20 rounded-full bg-white/70 p-2 text-ink-700 shadow-[0_1px_2px_rgba(124,105,160,0.1)] ring-1 ring-lavender-100 backdrop-blur transition hover:bg-white md:hidden"
          aria-label="打开侧边栏"
        >
          <Menu size={20} />
        </button>
        {/* key=pathname so a crash on /read/:id doesn't poison
            the same boundary instance on /home etc. */}
        <ErrorBoundary key={location.pathname} label={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
