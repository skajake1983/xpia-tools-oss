import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileText, Image, Zap, Globe, Settings, LogOut, LayoutDashboard, BarChart3, ShieldCheck, Menu, X, HelpCircle, Scale, MessageSquarePlus, Sparkles } from 'lucide-react';
import FeedbackModal from './FeedbackModal';

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/documents', label: 'Documents', icon: FileText },
  { to: '/app/images', label: 'Images', icon: Image },
  { to: '/app/payloads', label: 'Payloads', icon: Zap },
  { to: '/app/pages', label: 'Web Pages', icon: Globe },
  { to: '/app/prompt-templates', label: 'Prompt Templates', icon: Sparkles },
];

const SECONDARY_ITEMS = [
  { to: '/app/usage', label: 'Usage', icon: BarChart3 },
  { to: '/app/help', label: 'Help', icon: HelpCircle },
  { to: '/app/roe', label: 'Rules of Engagement', icon: Scale },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

const ADMIN_ITEMS = [
  { to: '/app/admin', label: 'Admin Console', icon: ShieldCheck },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
        <NavLink to="/app" onClick={closeSidebar} className="flex items-center gap-3 group">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand-950 group-hover:bg-brand-900 transition-colors">
            <img src="/Xpia shield no background.png" alt="" className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-bold text-brand-950 dark:text-white tracking-tight">XPIA Tools</h1>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">Beta</span>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">Security Research</p>
          </div>
        </NavLink>
        <button
          onClick={closeSidebar}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={closeSidebar}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-950 dark:text-brand-300'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`
            }
          >
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </NavLink>
        ))}

        <div className="border-t border-gray-100 dark:border-gray-800 my-3" />
        {SECONDARY_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={closeSidebar}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-950 dark:text-brand-300'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`
            }
          >
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </NavLink>
        ))}

      </nav>

      {/* User */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">
        {user?.isAdmin && ADMIN_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={closeSidebar}
            className={({ isActive }) =>
              `flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 mb-1 ${
                isActive
                  ? 'bg-amber-50 text-amber-700 shadow-sm dark:bg-amber-950 dark:text-amber-400'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`
            }
          >
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setFeedbackOpen(true)}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-all duration-150 mb-1"
        >
          <MessageSquarePlus className="w-[18px] h-[18px]" />
          Send Feedback
        </button>
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-all duration-150 mb-3"
        >
          <FileText className="w-[18px] h-[18px]" />
          Terms of Use
        </a>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400">
              2FA {user?.totpEnabled ? '✓ Enabled' : '○ Disabled'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 text-center">&copy; 2026 XPIA Tools. All rights reserved.</p>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile topbar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200/60 dark:border-gray-800 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/Xpia shield no background.png" alt="" className="w-4 h-4" />
          <span className="text-sm font-bold text-brand-950 dark:text-white">XPIA Tools</span>
          <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">Beta</span>
        </div>
        <div className="w-8" /> {/* Spacer for centering */}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar — desktop: static, mobile: drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200/60 dark:border-gray-800 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:z-auto flex-shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 lg:pt-0" style={{ scrollbarGutter: 'stable' }}>
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} userEmail={user?.email} userFirstName={user?.firstName ?? undefined} userLastName={user?.lastName ?? undefined} />
    </div>
  );
}
