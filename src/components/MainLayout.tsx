import { useState, useEffect } from 'react';
import { useLocation, Outlet, Link } from 'react-router-dom';
import { Folder, Play, User as UserIcon, Shield, LayoutGrid, PanelLeftClose, PanelLeftOpen, Menu, X, Key, Trash2, FileArchive, Unplug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { fetchStorageAnalysis } from '../api';
import { useAuth } from '../contexts/AuthContext';

export function MainLayout() {
  const { t } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [storageSize, setStorageSize] = useState<number | null>(null);
  const [storageLimit, setStorageLimit] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setStorageSize(null);
      setStorageLimit(null);
      return;
    }

    const loadStorage = async () => {
      try {
        const analysis = await fetchStorageAnalysis({ includeProjects: false });
        setStorageSize(analysis.totalSize);
        setStorageLimit(analysis.limit);
      } catch (error) {
        console.error('Failed to load storage size:', error);
      }
    };

    void loadStorage();
    const interval = setInterval(() => void loadStorage(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const formatStorageSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, unitIndex)).toFixed(1))} ${units[unitIndex]}`;
  };

  const storageText = storageSize !== null && storageLimit !== null
    ? `${formatStorageSize(storageSize)} / ${formatStorageSize(storageLimit)}`
    : 'Storage unavailable';
  const storageUsagePercent = storageSize !== null && storageLimit
    ? Math.min(100, (storageSize / storageLimit) * 100)
    : 0;

  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-200 font-sans overflow-hidden">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center gap-2 z-[100]">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-neutral-400 hover:text-white transition-all active:scale-95"
          aria-label="Toggle Menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <Link to="/" className="flex items-center px-2 gap-2" onClick={() => setIsMobileMenuOpen(false)}>
          <img src="/favicon.svg" alt="Remix Studio" className="w-6 h-6 flex-shrink-0" />
          <h1 className="text-lg font-bold text-white whitespace-nowrap tracking-tight">Remix Studio</h1>
        </Link>
        <div id="mobile-header-actions" className="ml-auto flex items-center px-2"></div>
      </header>

      {/* Backdrop for Mobile Sidebar */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] transition-opacity duration-300 cursor-pointer"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-[120] transition-all duration-300 ease-in-out lg:relative
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'lg:w-20' : 'lg:w-64'} w-72
        bg-neutral-900 border-r border-neutral-800 flex flex-col group
      `}>
        <div className="p-4 border-neutral-800 flex items-center justify-between">
          <Link
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex-1 transition-all duration-300 overflow-hidden ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-full opacity-100'}`}
          >
            <h1 className="text-xl font-bold text-white flex items-center gap-3 whitespace-nowrap">
              <img src="/favicon.svg" alt="Remix Studio" className="w-7 h-7 flex-shrink-0" />
              Remix Studio
            </h1>
          </Link>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`hidden lg:flex p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors ${isCollapsed ? 'w-full justify-center' : ''}`}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <Link
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all border ${location.pathname === '/'
                ? 'bg-blue-600/10 text-blue-400 border-blue-600/20'
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-transparent'
              } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            title={t('sidebar.dashboard')}
          >
            <LayoutGrid className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>{t('sidebar.dashboard')}</span>
          </Link>

          <Link
            to="/projects"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all border ${location.pathname === '/projects' || location.pathname.startsWith('/project/')
                ? 'bg-green-600/10 text-green-400 border-green-600/20'
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-transparent'
              } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            title={t('sidebar.projects')}
          >
            <Play className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>{t('sidebar.projects')}</span>
          </Link>

          <Link
            to="/libraries"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all border ${location.pathname === '/libraries' || location.pathname.startsWith('/library/')
                ? 'bg-blue-600/10 text-blue-400 border-blue-600/20'
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-transparent'
              } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            title={t('sidebar.libraries')}
          >
            <Folder className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>{t('sidebar.libraries')}</span>
          </Link>

          <Link
            to="/providers"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all border ${location.pathname === '/providers' || location.pathname.startsWith('/provider/')
                ? 'bg-amber-600/10 text-amber-400 border-amber-600/20'
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-transparent'
              } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            title={t('sidebar.providers')}
          >
            <Key className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>{t('sidebar.providers')}</span>
          </Link>

          <Link
            to="/account/mcp"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all border ${location.pathname === '/account/mcp'
                ? 'bg-violet-600/10 text-violet-400 border-violet-600/20'
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-transparent'
              } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            title={t('sidebar.mcp')}
          >
            <Unplug className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>{t('sidebar.mcp')}</span>
          </Link>

          <Link
            to="/exports"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all border ${location.pathname === '/exports'
                ? 'bg-blue-600/10 text-blue-400 border-blue-600/20'
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-transparent'
              } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            title={t('sidebar.archive')}
          >
            <FileArchive className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>{t('sidebar.archive')}</span>
          </Link>

          <Link
            to="/trash"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all border ${location.pathname === '/trash'
                ? 'bg-red-600/10 text-red-400 border-red-600/20'
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-transparent'
              } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            title={t('sidebar.recycleBin')}
          >
            <Trash2 className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>{t('sidebar.recycleBin')}</span>
          </Link>
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex-shrink-0">
          <Link
            to="/account"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center overflow-hidden rounded-xl border p-3 transition-colors ${location.pathname === '/account'
                ? 'border-cyan-600/30 bg-cyan-600/10'
                : 'border-neutral-700/50 bg-neutral-800/40 hover:border-neutral-600 hover:bg-neutral-800/70'
              } ${isCollapsed ? 'lg:justify-center lg:gap-0' : 'w-full gap-3'
              }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${location.pathname === '/account'
                ? 'bg-cyan-500/15 text-cyan-300'
                : 'bg-neutral-800 text-neutral-400'
              }`}>
              <UserIcon className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="ml-auto min-w-0 flex-1 text-right">
                <p className={`text-[10px] uppercase tracking-wider ${location.pathname === '/account' ? 'text-cyan-200/70' : 'text-neutral-500'}`}>{t('sidebar.storage')}</p>
                <p className={`text-xs font-medium truncate ${location.pathname === '/account' ? 'text-cyan-50' : 'text-neutral-300'}`} title={storageText}>
                  {storageText}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full transition-all ${storageUsagePercent > 90 ? 'bg-red-500' : storageUsagePercent > 70 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                    style={{ width: `${storageUsagePercent}%` }}
                  />
                </div>
              </div>
            )}
          </Link>
          {user?.role === 'admin' && (
            <Link
              to="/admin/users"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`mt-3 flex items-center rounded-xl border border-neutral-700/50 bg-neutral-800/40 p-3 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800/70 ${isCollapsed ? 'lg:justify-center lg:gap-0' : 'w-full gap-3'
                }`}
              title={t('sidebar.userManagement')}
            >
              <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <span className={`overflow-hidden whitespace-nowrap font-medium transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:hidden' : 'max-w-[200px] inline'}`}>{t('sidebar.userManagement')}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-neutral-950 flex flex-col mt-16 lg:mt-0 min-w-0 relative">
        <div className="flex-1 overflow-y-auto min-w-0 custom-scrollbar">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
