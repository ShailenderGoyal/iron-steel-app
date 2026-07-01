import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊', exact: true },
  { path: '/inventory/coils', label: 'Coils (माल)', icon: '🔩' },
  { path: '/inventory/sheets', label: 'Sheets (पत्र)', icon: '📄' },
  { path: '/orders', label: 'Orders (ऑर्डर)', icon: '📋' },
  { path: '/optimization', label: 'Optimization', icon: '⚡' },
  { path: '/production', label: 'Production', icon: '🏭' },
  { path: '/customers', label: 'Parties (पार्टी)', icon: '👥' },
  { path: '/suppliers', label: 'Suppliers', icon: '🏢' },
  { path: '/machines', label: 'Machines', icon: '⚙️' },
  { path: '/scrap', label: 'Scrap (रद्दी)', icon: '♻️' },
  { path: '/settings', label: 'Settings', icon: '🔧' },
];

export default function Layout() {
  const { user, logout, isOwner } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const closeNav = () => setSidebarOpen(false);

  const NavContent = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-steel-700">
        <div>
          <div className="font-bold text-sm leading-tight">Iron & Steel</div>
          <div className="text-steel-400 text-xs">Management System</div>
        </div>
        <button onClick={closeNav} className="p-1 rounded hover:bg-steel-700 text-steel-400 hover:text-white md:hidden">✕</button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.exact}
            onClick={closeNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-steel-300 hover:bg-steel-800 hover:text-white'
              }`
            }
          >
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-steel-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{user?.username}</div>
            <div className={`text-xs ${isOwner ? 'text-yellow-400' : 'text-steel-400'}`}>
              {isOwner ? '👑 Owner' : '🔧 Supervisor'}
            </div>
          </div>
          <button onClick={handleLogout} className="text-steel-400 hover:text-white text-xs underline">Logout</button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-steel-50">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeNav} />
      )}

      {/* Sidebar — desktop always visible, mobile as drawer */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-steel-900 text-white flex flex-col transition-transform duration-200 no-print
        md:static md:translate-x-0 md:z-auto md:w-56 md:flex-shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <NavContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden bg-steel-900 text-white flex items-center justify-between px-4 py-3 no-print sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="text-steel-300 hover:text-white text-xl">☰</button>
          <span className="font-semibold text-sm">Iron & Steel</span>
          <span className="text-xs text-steel-400">{user?.username}</span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
