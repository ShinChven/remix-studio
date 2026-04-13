import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProviders, deleteProvider } from '../api';
import { Provider, ProviderType } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProviderIcon } from '../components/ProviderIcon';
import { Plus, Key, Globe, Pencil, Trash2, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';

const TYPE_COLORS: Record<ProviderType, { icon: string; badge: string }> = {
  GoogleAI:   { icon: 'bg-blue-500/10 text-blue-500',   badge: 'bg-blue-600/10 text-blue-400 border-blue-600/30' },
  VertexAI:   { icon: 'bg-purple-500/10 text-purple-500', badge: 'bg-purple-600/10 text-purple-400 border-purple-600/30' },
  RunningHub: { icon: 'bg-emerald-500/10 text-emerald-500', badge: 'bg-emerald-600/10 text-emerald-400 border-emerald-600/30' },
  KlingAI:    { icon: 'bg-lime-500/10 text-lime-400', badge: 'bg-lime-600/10 text-lime-300 border-lime-600/30' },
  OpenAI:     { icon: 'bg-orange-500/10 text-orange-500', badge: 'bg-orange-600/10 text-orange-400 border-orange-600/30' },
  Grok:       { icon: 'bg-rose-500/10 text-rose-500', badge: 'bg-rose-600/10 text-rose-400 border-rose-600/30' },
  Claude:     { icon: 'bg-amber-500/10 text-amber-500', badge: 'bg-amber-600/10 text-amber-400 border-amber-600/30' },
  BytePlus:   { icon: 'bg-cyan-500/10 text-cyan-500', badge: 'bg-cyan-600/10 text-cyan-400 border-cyan-600/30' },
};

export function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchProviders();
      setProviders(data.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)));
    } catch {
      setError('Failed to load providers.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProvider(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch {
      setError('Failed to delete provider.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <header className="mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 font-display">Providers</h2>
          <p className="text-sm md:text-base text-neutral-400">Manage API credentials for image generation backends. Keys are encrypted at rest.</p>
        </header>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" />
              All Providers
            </h3>
            <button
              onClick={() => navigate('/provider/new')}
              className="text-xs md:text-sm bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-amber-600/30 font-medium"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Provider</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-xl bg-neutral-900/40 border border-neutral-800/60 animate-pulse" />
              ))
            ) : providers.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center justify-center gap-4 bg-neutral-900/20">
                <Key className="w-12 h-12 text-neutral-700" />
                <div>
                  <p className="text-lg font-medium text-neutral-400">No providers yet</p>
                  <p className="text-sm">Add your first API key to start generating images.</p>
                </div>
              </div>
            ) : (
              providers.map(provider => {
                const colors = TYPE_COLORS[provider.type];
                const hasCredentials = provider.type === 'KlingAI'
                  ? provider.hasKey && provider.hasSecret
                  : provider.hasKey;
                const projectCount = provider.usage?.projectCount ?? 0;
                const activeJobCount = provider.usage?.activeJobCount ?? 0;
                return (
                  <div
                    key={provider.id}
                    onClick={() => navigate(`/provider/${provider.id}`)}
                    className="w-full bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/60 hover:border-amber-500/30 hover:bg-neutral-900/60 px-3 py-2.5 md:px-3.5 md:py-2.5 rounded-xl text-left transition-all group flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 md:gap-3 overflow-hidden min-w-0">
                      <div className={`flex-shrink-0 p-1.5 md:p-2 rounded-lg ${colors.icon} group-hover:scale-110 transition-transform`}>
                        <ProviderIcon type={provider.type} className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <h4 className="font-semibold text-white text-sm truncate">{provider.name}</h4>
                        <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${colors.badge}`}>{provider.type}</span>
                          {provider.apiUrl && (
                            <span className="flex items-center gap-1 text-[10px] text-neutral-500 truncate max-w-[140px] md:max-w-[180px]">
                              <Globe className="w-3 h-3 flex-shrink-0" />{provider.apiUrl}
                            </span>
                          )}
                          <span className={`flex items-center gap-1 text-[10px] font-medium ${hasCredentials ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {hasCredentials
                              ? <><CheckCircle className="w-3 h-3" /> {provider.type === 'KlingAI' ? 'Credentials stored' : 'Key stored'}</>
                              : <><AlertCircle className="w-3 h-3" /> {provider.type === 'KlingAI' ? 'Missing credentials' : 'No key'}</>}
                          </span>
                          {(projectCount > 0 || activeJobCount > 0) && (
                            <span className="flex items-center gap-2 text-[10px] text-neutral-500">
                              {projectCount > 0 && <span>{projectCount} project{projectCount === 1 ? '' : 's'}</span>}
                              {activeJobCount > 0 && <span>{activeJobCount} active job{activeJobCount === 1 ? '' : 's'}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/provider/${provider.id}/edit`); }}
                        className="p-1.5 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 rounded-lg transition-colors opacity-100"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(provider); }}
                        className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-amber-500 transition-colors ml-0.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Provider"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This removes the stored API key. Existing project references will remain as warnings, and any pending or processing jobs using this provider may fail until you switch them to another provider.${deleteTarget.usage && (deleteTarget.usage.projectCount > 0 || deleteTarget.usage.activeJobCount > 0) ? ` Currently referenced by ${deleteTarget.usage.projectCount} project${deleteTarget.usage.projectCount === 1 ? '' : 's'} and ${deleteTarget.usage.activeJobCount} active job${deleteTarget.usage.activeJobCount === 1 ? '' : 's'}.` : ''}`
            : ''
        }
        confirmText={isDeleting ? 'Deleting…' : 'Delete'}
        type="danger"
      />
    </div>
  );
}
