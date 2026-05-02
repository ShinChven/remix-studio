import { useState, useEffect } from 'react';
import { useLocation, Outlet, Link } from 'react-router-dom';
import { Folder, Play, User as UserIcon, Shield, LayoutGrid, PanelLeftClose, PanelLeftOpen, Menu, X, Key, Trash2, FileArchive, Sparkles, Sun, Moon, Monitor, Send, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { fetchStorageAnalysis } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

type ThemeMode = 'light' | 'dark' | 'system';

function NavItem({ to, icon, label, isActive, isCollapsed, onClick }: {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`w-full px-3 py-2.5 rounded-xl flex items-center transition-all border ${isActive
          ? 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-600/10'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 border-transparent'
        } gap-3 ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
      title={label}
    >
      {icon}
      <span className={`font-medium text-sm overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[200px] opacity-100'}`}>
        {label}
      </span>
    </Link>
  );
}

function ThemeSwitcher({ isCollapsed }: { isCollapsed: boolean }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const options: Array<{ value: ThemeMode; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun className="h-4 w-4" />, label: t('account.preferences.light') },
    { value: 'dark', icon: <Moon className="h-4 w-4" />, label: t('account.preferences.dark') },
    { value: 'system', icon: <Monitor className="h-4 w-4" />, label: t('account.preferences.system') },
  ];

  return (
    <div
      className={`flex items-center rounded-xl bg-neutral-200/50 dark:bg-neutral-950/40 p-1 backdrop-blur-md border border-neutral-300/30 dark:border-white/5 shadow-inner ${
        isCollapsed ? 'flex-col gap-1' : 'w-full gap-1'
      }`}
    >
      {options.map((option) => {
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`group relative flex flex-1 items-center justify-center rounded-[8px] transition-all duration-300 ease-out border ${
              isCollapsed ? 'h-10 w-full' : 'h-9 w-full'
            } ${
              isActive
                ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 shadow-sm border-neutral-200/80 dark:border-neutral-700/80'
                : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 border-transparent'
            }`}
            aria-label={option.label}
            title={option.label}
          >
            <span className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'scale-100 group-hover:scale-110'}`}>
              {option.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
  const isAccountActive = location.pathname === '/account' || location.pathname.startsWith('/account/');

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
    : t('mainLayout.storageUnavailable');
  const storageUsagePercent = storageSize !== null && storageLimit
    ? Math.min(100, (storageSize / storageLimit) * 100)
    : 0;

  return (
    <div className="flex h-screen w-screen bg-transparent text-neutral-900 dark:text-neutral-200 font-sans overflow-hidden">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-black/40 backdrop-blur-3xl border-b border-neutral-200/50 dark:border-white/5 px-4 flex items-center gap-2 z-[100] shadow-sm">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-white transition-all active:scale-95"
          aria-label={t('mainLayout.toggleMenu')}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        {!location.pathname.startsWith('/assistant') && (
          <Link to="/" className="flex items-center px-2 gap-2" onClick={() => setIsMobileMenuOpen(false)}>
            <img src="/favicon.svg" alt="Remix Studio" className="w-6 h-6 flex-shrink-0" />
            <h1 className="text-lg font-bold text-neutral-900 dark:text-white whitespace-nowrap tracking-tight">Remix Studio</h1>
          </Link>
        )}
        <div id="mobile-header-assistant-title" className="flex-1 flex items-center px-2 gap-2 min-w-0"></div>
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
        bg-white/95 dark:bg-black/10 border-r border-neutral-200/50 dark:border-white/5 flex flex-col group backdrop-blur-3xl shadow-2xl shadow-black/10 dark:shadow-black/40
      `}>
        <div className="p-4 border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <Link
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex-1 transition-all duration-300 overflow-hidden ${isCollapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-full opacity-100'}`}
          >
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3 whitespace-nowrap">
              <img src="/favicon.svg" alt="Remix Studio" className="w-7 h-7 flex-shrink-0" />
              Remix Studio
            </h1>
          </Link>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`hidden lg:flex p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors ${isCollapsed ? 'w-full justify-center' : ''}`}
            title={isCollapsed ? t('mainLayout.expandSidebar') : t('mainLayout.collapseSidebar')}
          >
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-neutral-600 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <NavItem
            to="/"
            icon={<LayoutGrid className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.home', 'Home')}
            isActive={location.pathname === '/'}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <NavItem
            to="/assistant"
            icon={<Sparkles className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.assistant')}
            isActive={location.pathname === '/assistant' || location.pathname.startsWith('/assistant/')}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <NavItem
            to="/projects"
            icon={<Play className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.projects')}
            isActive={location.pathname === '/projects' || location.pathname.startsWith('/projects/') || location.pathname.startsWith('/project/')}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <NavItem
            to="/libraries"
            icon={<Folder className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.libraries')}
            isActive={location.pathname === '/libraries' || location.pathname.startsWith('/library/')}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <NavItem
            to="/campaigns"
            icon={<Send className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.campaigns')}
            isActive={location.pathname === '/campaigns' || location.pathname.startsWith('/campaigns/') || location.pathname.startsWith('/campaign/')}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <NavItem
            to="/providers"
            icon={<Key className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.providers')}
            isActive={location.pathname === '/providers' || location.pathname.startsWith('/provider/')}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <NavItem
            to="/exports"
            icon={<FileArchive className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.exports')}
            isActive={location.pathname === '/exports'}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <NavItem
            to="/trash"
            icon={<Trash2 className="w-5 h-5 flex-shrink-0" />}
            label={t('sidebar.recycleBin')}
            isActive={location.pathname === '/trash'}
            isCollapsed={isCollapsed}
            onClick={() => setIsMobileMenuOpen(false)}
          />
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-neutral-200/20 dark:border-white/5 bg-transparent flex-shrink-0">
          <div className="mb-3">
            <ThemeSwitcher isCollapsed={isCollapsed} />
          </div>
          <Link
            to="/account"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center overflow-hidden rounded-xl border p-3 transition-colors ${isAccountActive
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-600/10'
                : 'border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl hover:bg-white/60 dark:hover:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 shadow-sm'
              } ${isCollapsed ? 'lg:justify-center lg:gap-0' : 'w-full gap-3'
              }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isAccountActive
                ? 'bg-white/20 text-white'
                : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}>
              <UserIcon className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="ml-auto min-w-0 flex-1 text-right">
                <p className={`text-[10px] uppercase tracking-wider ${isAccountActive ? 'text-white/70' : 'text-neutral-500 dark:text-neutral-500'}`}>{t('sidebar.storage')}</p>
                <p className={`text-xs font-medium truncate ${isAccountActive ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'}`} title={storageText}>
                  {storageText}
                </p>
                <div className={`mt-1.5 h-2 w-full overflow-hidden rounded-full ${isAccountActive ? 'bg-white/20' : 'bg-neutral-200 dark:bg-neutral-800'} border border-neutral-200 dark:border-transparent`}>
                  <div
                    className={`h-full rounded-full transition-all ${isAccountActive ? 'bg-white' : (storageUsagePercent > 90 ? 'bg-red-500' : storageUsagePercent > 70 ? 'bg-amber-500' : 'bg-blue-500')
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
              className={`mt-3 flex items-center rounded-xl border transition-all ${location.pathname.startsWith('/admin/')
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-600/10'
                  : 'border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl text-neutral-700 dark:text-neutral-300 hover:bg-white/60 dark:hover:bg-neutral-800/60 shadow-sm'
                } p-3 text-sm ${isCollapsed ? 'lg:justify-center lg:gap-0' : 'w-full gap-3'
                }`}
              title={t('sidebar.userManagement')}
            >
              <Shield className={`w-5 h-5 flex-shrink-0 ${location.pathname === '/admin/users' ? 'text-white' : 'text-blue-700 dark:text-blue-400'}`} />
              <span className={`overflow-hidden whitespace-nowrap font-medium transition-all duration-300 ${isCollapsed ? 'lg:max-w-0 lg:hidden' : 'max-w-[200px] inline'}`}>{t('sidebar.userManagement')}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-transparent flex flex-col mt-16 lg:mt-0 min-w-0 relative">
        <div className="flex-1 overflow-y-auto min-w-0 custom-scrollbar">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
