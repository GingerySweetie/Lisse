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
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-lavender-200 bg-white/85 backdrop-blur transition-transform duration-200 md:relative md:translate-x-0 ${
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
          className="absolute left-3 top-3 z-20 rounded-lg bg-white/80 p-2 text-ink-700 shadow-sm backdrop-blur transition hover:bg-white md:hidden"
          aria-label="打开侧边栏"
        >
          <Menu size={20} />
        </button>
        <Outlet />
      </main>
    </div>
  );
}
