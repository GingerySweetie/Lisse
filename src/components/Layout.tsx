import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-lavender-100 bg-white/70 backdrop-blur-md transition-transform duration-200 md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
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
        <Outlet />
      </main>
    </div>
  );
}
