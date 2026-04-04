import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Outlet, Link } from 'react-router-dom';
import { AppData, Library, Project } from '../types';
import { loadData, saveData } from '../api';
import { Plus, Folder, Layers, Play, Search, ChevronDown, ChevronRight, LogOut, User as UserIcon, Shield, LayoutGrid, Loader2, PanelLeftClose, PanelLeftOpen, StickyNote } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from './ConfirmModal';

export function MainLayout() {
  const [data, setData] = useState<AppData>({ libraries: [], projects: [] });
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    loadData().then(fetchedData => {
      setData({
        libraries: (fetchedData.libraries || []).map(lib => ({
          ...lib,
          type: lib.type || 'text',
          items: (lib.items || []).map((item: any) => 
            typeof item === 'string' 
              ? { id: crypto.randomUUID(), content: item } 
              : item
          )
        })),
        // @ts-ignore - handle legacy data
        projects: fetchedData.projects || fetchedData.batches || []
      });
    }).catch(console.error);
  }, []);

  const handleSave = async (newData: AppData) => {
    setIsSaving(true);
    setData(newData);
    try {
      await saveData(newData);
    } finally {
      setTimeout(() => setIsSaving(false), 800);
    }
  };

  const addLibrary = () => {
    navigate('/library/new');
  };

  const addProject = () => {
    navigate('/project/new');
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-200 font-sans">
      {/* Sidebar */}
      <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-neutral-900 border-r border-neutral-800 flex flex-col transition-all duration-300 ease-in-out relative group`}>
        <div className="p-4 border-neutral-800 flex items-center justify-between">
          <Link 
            to="/"
            className={`flex-1 transition-all duration-300 overflow-hidden ${isCollapsed ? 'max-w-0 opacity-0' : 'max-w-full opacity-100'}`}
          >
            <h1 className="text-xl font-bold text-white flex items-center gap-2 whitespace-nowrap">
              <Layers className="w-6 h-6 text-blue-500 flex-shrink-0" />
              Remix Studio
            </h1>
          </Link>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors ${isCollapsed ? 'w-full flex justify-center' : ''}`}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>

        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <Link
            to="/"
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all ${
              location.pathname === '/' 
                ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' 
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            } ${isCollapsed ? 'justify-center' : 'gap-3'}`}
            title="Dashboard"
          >
            <LayoutGrid className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="font-medium text-sm">Dashboard</span>}
          </Link>

          <Link
            to="/projects"
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all ${
              location.pathname === '/projects' || location.pathname.startsWith('/project/')
                ? 'bg-green-600/10 text-green-400 border border-green-600/20' 
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            } ${isCollapsed ? 'justify-center' : 'gap-3'}`}
            title="Projects"
          >
            <Play className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="font-medium text-sm">Projects</span>}
          </Link>

          <Link
            to="/libraries"
            className={`w-full px-3 py-2 rounded-lg flex items-center transition-all ${
              location.pathname === '/libraries' || location.pathname.startsWith('/library/')
                ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' 
                : 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            } ${isCollapsed ? 'justify-center' : 'gap-3'}`}
            title="Libraries"
          >
            <Folder className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="font-medium text-sm">Libraries</span>}
          </Link>

        </div>


        {/* User Profile */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex-shrink-0">
          <div className={`flex items-center ${isCollapsed ? 'flex-col gap-4' : 'justify-between'}`}>
            <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0 text-neutral-400">
                <UserIcon className="w-4 h-4" />
              </div>
              {!isCollapsed && (
                <div className="truncate">
                  <p className="text-sm font-medium text-neutral-200 truncate">{user?.email}</p>
                  <p className="text-xs text-neutral-500 capitalize">{user?.role}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsLogoutModalOpen(true)}
              className={`p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ${isCollapsed ? 'w-full flex justify-center' : ''}`}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          {user?.role === 'admin' && (
            <Link
              to="/admin/users"
              className={`mt-3 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-lg transition-colors border border-neutral-700/50 ${isCollapsed ? 'p-2' : 'py-2 px-3 gap-2 w-full'}`}
              title="User Management"
            >
              <Shield className="w-4 h-4 text-blue-400" />
              {!isCollapsed && <span>User Management</span>}
            </Link>
          )}
        </div>

      </div>

      <div className="flex-1 overflow-hidden bg-neutral-950 flex flex-col">
        {isSaving && (
          <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-1.5 flex items-center justify-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving Changes
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <Outlet context={{ data, handleSave, addLibrary, addProject }} />
        </div>
      </div>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={logout}
        title="Log Out"
        message="Are you sure you want to log out? Any unsaved changes might be lost."
        confirmText="Log Out"
        type="danger"
      />
    </div>
  );
}
