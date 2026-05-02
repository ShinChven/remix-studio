import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchProviders, deleteProvider } from '../api';
import { Provider, ProviderType } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProviderIcon } from '../components/ProviderIcon';
import { PageHeader } from '../components/PageHeader';
import { Plus, Key, Globe, Pencil, Trash2, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';

const TYPE_COLORS: Record<ProviderType, { icon: string; badge: string }> = {
  GoogleAI:   { icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-500',   badge: 'bg-blue-600/10 text-blue-700 dark:text-blue-400 border-blue-600/20 dark:border-blue-600/30' },
  VertexAI:   { icon: 'bg-purple-500/10 text-purple-600 dark:text-purple-500', badge: 'bg-purple-600/10 text-purple-700 dark:text-purple-400 border-purple-600/20 dark:border-purple-600/30' },
  RunningHub: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500', badge: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20 dark:border-emerald-600/30' },
  KlingAI:    { icon: 'bg-lime-500/15 text-lime-700 dark:text-lime-400', badge: 'bg-lime-600/10 text-lime-700 dark:text-lime-300 border-lime-600/20 dark:border-lime-600/30' },
  OpenAI:     { icon: 'bg-orange-500/10 text-orange-600 dark:text-orange-500', badge: 'bg-orange-600/10 text-orange-700 dark:text-orange-400 border-orange-600/20 dark:border-orange-600/30' },
  Grok:       { icon: 'bg-rose-500/10 text-rose-600 dark:text-rose-500', badge: 'bg-rose-600/10 text-rose-700 dark:text-rose-400 border-rose-600/20 dark:border-rose-600/30' },
  Claude:     { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-500', badge: 'bg-amber-600/10 text-amber-700 dark:text-amber-400 border-amber-600/20 dark:border-amber-600/30' },
  BytePlus:   { icon: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-500', badge: 'bg-cyan-600/10 text-cyan-700 dark:text-cyan-400 border-cyan-600/20 dark:border-cyan-600/30' },
  Replicate:  { icon: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400', badge: 'bg-fuchsia-600/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-600/20 dark:border-fuchsia-600/30' },
  BlackForestLabs: { icon: 'bg-stone-500/10 text-stone-800 dark:text-stone-200', badge: 'bg-stone-600/10 text-stone-800 dark:text-stone-200 border-stone-600/20 dark:border-stone-600/30' },
  Alibabacloud: { icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', badge: 'bg-violet-600/10 text-violet-700 dark:text-violet-400 border-violet-600/20 dark:border-violet-600/30' },
};

export function Providers() {
  const { t } = useTranslation();
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
      setError(t('providers.errors.load'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProvider(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch {
      setError(t('providers.errors.delete'));
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteMessage = deleteTarget
    ? `${t('providers.deleteDialog.message', { name: deleteTarget.name })}${
        deleteTarget.usage && (deleteTarget.usage.projectCount > 0 || deleteTarget.usage.activeJobCount > 0)
          ? t('providers.deleteDialog.usageWarning', {
              projectCount: deleteTarget.usage.projectCount,
              jobCount: deleteTarget.usage.activeJobCount,
            })
          : ''
      }`
    : '';

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <PageHeader
          title={t('providers.title')}
          description={t('providers.description')}
        />

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" />
              {t('providers.allProviders')}
            </h3>
            <button
              onClick={() => navigate('/provider/new')}
              className="p-2.5 bg-amber-600 text-neutral-900 dark:text-white hover:bg-amber-500 rounded-card transition-all flex items-center justify-center border border-amber-600/30 shadow-lg shadow-amber-600/10 active:scale-95"
              title={t('providers.newProvider')}
              aria-label={t('providers.newProvider')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-card text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-card bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/60 dark:border-neutral-800/60 animate-pulse" />
              ))
            ) : providers.length === 0 ? (
              <div className="py-20 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-card text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white/40 dark:bg-neutral-900/40 shadow-sm backdrop-blur-3xl">
                <div className="p-4 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm">
                  <Key className="w-8 h-8 text-neutral-700" />
                </div>
                <div>
                  <p className="text-lg font-bold text-neutral-600 dark:text-neutral-400 tracking-tight">{t('providers.noProviders.title')}</p>
                  <p className="text-sm mt-1">{t('providers.noProviders.description')}</p>
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
                    className="w-full bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl hover:bg-white/80 dark:hover:bg-neutral-800/80 px-4 py-4 rounded-card text-left transition-all group flex items-center justify-between gap-3 cursor-pointer shadow-sm hover:shadow-xl duration-300 hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-2.5 md:gap-3 overflow-hidden min-w-0">
                      <div className={`flex-shrink-0 p-1.5 md:p-2 rounded-lg ${colors.icon} group-hover:scale-110 transition-transform`}>
                        <ProviderIcon type={provider.type} className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <h4 className="font-semibold text-neutral-900 dark:text-white text-sm truncate">{provider.name}</h4>
                        <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${colors.badge}`}>{provider.type}</span>
                          {provider.apiUrl && (
                            <span className="flex items-center gap-1 text-[10px] text-neutral-600 dark:text-neutral-500 truncate max-w-[140px] md:max-w-[180px]">
                              <Globe className="w-3 h-3 flex-shrink-0" />{provider.apiUrl}
                            </span>
                          )}
                          <span className={`flex items-center gap-1 text-[10px] font-medium ${hasCredentials ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {hasCredentials
                              ? <><CheckCircle className="w-3 h-3" /> {provider.type === 'KlingAI' ? t('providers.providerCard.credentialsStored') : t('providers.providerCard.keyStored')}</>
                              : <><AlertCircle className="w-3 h-3" /> {provider.type === 'KlingAI' ? t('providers.providerCard.missingCredentials') : t('providers.providerCard.noKey')}</>}
                          </span>
                          {(projectCount > 0 || activeJobCount > 0) && (
                            <span className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-500 font-bold bg-neutral-100 dark:bg-neutral-800/50 px-2 py-0.5 rounded shadow-inner">
                              {projectCount > 0 && <span>{t('providers.providerCard.projects', { count: projectCount })}</span>}
                              {activeJobCount > 0 && <span>{t('providers.providerCard.activeJobs', { count: activeJobCount })}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                       <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/provider/${provider.id}/edit`); }}
                        className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-card transition-all active:scale-90 border border-transparent hover:border-blue-100"
                        title={t('providerCustomModels.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(provider); }}
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-card transition-all active:scale-90 border border-transparent hover:border-red-100"
                        title={t('providerCustomModels.delete')}
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
        title={t('providers.deleteDialog.title')}
        message={deleteMessage}
        confirmText={isDeleting ? t('providers.deleteDialog.deleting') : t('providers.deleteDialog.confirm')}
        type="danger"
      />
    </div>
  );
}
