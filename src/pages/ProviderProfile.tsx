import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchProvider, fetchProviderModels, ProviderModelInfo } from '../api';
import { Provider, ProviderType } from '../types';
import { ProviderIcon } from '../components/ProviderIcon';
import { PageHeader } from '../components/PageHeader';
import {
  Globe, CheckCircle, AlertCircle, Pencil,
  MessageSquare, Loader2, RefreshCw, Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const TYPE_COLORS: Record<ProviderType, { icon: string; badge: string }> = {
  GoogleAI:   { icon: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-500',   badge: 'bg-blue-100 dark:bg-blue-600/10 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-600/30' },
  VertexAI:   { icon: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-500', badge: 'bg-purple-100 dark:bg-purple-600/10 text-purple-800 dark:text-purple-400 border-purple-200 dark:border-purple-600/30' },
  RunningHub: { icon: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500', badge: 'bg-emerald-100 dark:bg-emerald-600/10 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-600/30' },
  KlingAI:    { icon: 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-400', badge: 'bg-lime-100 dark:bg-lime-600/10 text-lime-800 dark:text-lime-300 border-lime-200 dark:border-lime-600/30' },
  OpenAI:     { icon: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-500', badge: 'bg-orange-100 dark:bg-orange-600/10 text-orange-800 dark:text-orange-400 border-orange-200 dark:border-orange-600/30' },
  Grok:       { icon: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-500', badge: 'bg-rose-100 dark:bg-rose-600/10 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-600/30' },
  Claude:     { icon: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500', badge: 'bg-amber-100 dark:bg-amber-600/10 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-600/30' },
  BytePlus:   { icon: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-500', badge: 'bg-cyan-100 dark:bg-cyan-600/10 text-cyan-800 dark:text-cyan-400 border-cyan-200 dark:border-cyan-600/30' },
  Replicate:  { icon: 'bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400', badge: 'bg-fuchsia-100 dark:bg-fuchsia-600/10 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-600/30' },
  BlackForestLabs: { icon: 'bg-stone-100 dark:bg-stone-500/10 text-stone-900 dark:text-stone-200', badge: 'bg-stone-200 dark:bg-stone-600/10 text-stone-900 dark:text-stone-200 border-stone-300 dark:border-stone-600/30' },
  Alibabacloud: { icon: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400', badge: 'bg-violet-100 dark:bg-violet-600/10 text-violet-800 dark:text-violet-400 border-violet-200 dark:border-violet-600/30' },
};

export function ProviderProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [models, setModels] = useState<ProviderModelInfo[]>([]);
  const [isLoadingProvider, setIsLoadingProvider] = useState(true);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const loadProvider = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoadingProvider(true);
      setError(null);
      const data = await fetchProvider(id);
      setProvider(data);
    } catch {
      setError(t('providerProfile.errorLoad'));
    } finally {
      setIsLoadingProvider(false);
    }
  }, [id, t]);

  const loadModels = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoadingModels(true);
      setModelsError(null);
      const result = await fetchProviderModels(id);
      setModels(result.models);
      if (result.error) setModelsError(result.error);
    } catch {
      setModelsError(t('providerProfile.errors.fetchModels'));
    } finally {
      setIsLoadingModels(false);
    }
  }, [id, t]);

  useEffect(() => { loadProvider(); }, [loadProvider]);
  // RunningHub/KlingAI/BytePlus/Replicate use static models; others require credentials.
  useEffect(() => {
    if (!provider) return;
    if (provider.type === 'RunningHub' || provider.type === 'KlingAI' || provider.type === 'BytePlus' || provider.type === 'Replicate' || provider.type === 'BlackForestLabs' || provider.hasKey) loadModels();
  }, [provider, loadModels]);

  if (isLoadingProvider) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-500 dark:text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-neutral-600 dark:text-neutral-400">{error || t('providerProfile.errorNotFound')}</p>
        <button onClick={() => navigate('/providers')} className="text-sm text-amber-400 hover:underline">
          {t('providerProfile.backToProviders')}
        </button>
      </div>
    );
  }

  const colors = TYPE_COLORS[provider.type];
  const hasCredentials = provider.type === 'KlingAI'
    ? provider.hasKey && provider.hasSecret
    : provider.hasKey;

  const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
    text:  { label: t('providerProfile.categories.text'),  icon: MessageSquare, color: 'text-sky-800 dark:text-sky-400 bg-sky-100 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/20 shadow-sm' },
    image: { label: t('providerProfile.categories.image'), icon: MessageSquare, color: 'text-pink-800 dark:text-pink-400 bg-pink-100 dark:bg-pink-500/10 border-pink-300 dark:border-pink-500/20 shadow-sm' },
    video: { label: t('providerProfile.categories.video'), icon: MessageSquare, color: 'text-violet-800 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/20 shadow-sm' },
    audio: { label: t('providerProfile.categories.audio'), icon: MessageSquare, color: 'text-cyan-800 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/10 border-cyan-300 dark:border-cyan-500/20 shadow-sm' },
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        {/* Header */}
        <PageHeader
          title={(
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-xl ${colors.icon} shrink-0`}>
                <ProviderIcon type={provider.type} className="w-6 h-6" />
              </div>
              <span className="truncate">{provider.name}</span>
            </div>
          )}
          description={(
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${colors.badge}`}>
                {provider.type}
              </span>
              {provider.apiUrl && (
                <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-500">
                  <Globe className="w-3.5 h-3.5" />{provider.apiUrl}
                </span>
              )}
              <span className={`flex items-center gap-1 text-xs font-black uppercase tracking-tight ${hasCredentials ? 'text-emerald-800 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400'}`}>
                {hasCredentials
                  ? <><CheckCircle className="w-3.5 h-3.5" /> {provider.type === 'KlingAI' ? t('providerProfile.credentialsStored') : t('providerProfile.keyStored')}</>
                  : <><AlertCircle className="w-3.5 h-3.5" /> {provider.type === 'KlingAI' ? t('providerProfile.missingCredentials') : t('providerProfile.noKey')}</>}
              </span>
            </div>
          )}
          backLink={{ to: '/providers', label: t('providers.title') }}
          actions={(
            <>
              {provider.type === 'BytePlus' && (
                <button
                  onClick={() => navigate(`/provider/${id}/custom-models`)}
                  className="text-xs md:text-sm bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20 px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-cyan-600/30 font-medium"
                >
                  <Layers className="w-4 h-4" /> {t('providerProfile.customModels')}
                </button>
              )}
              <button
                onClick={() => navigate(`/provider/${id}/edit`)}
                className="text-xs md:text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 border border-neutral-200 dark:border-neutral-700 font-black uppercase tracking-widest shadow-sm active:scale-95 shrink-0"
              >
                <Pencil className="w-4 h-4" /> {t('providerProfile.edit')}
              </button>
            </>
          )}
        />

        {/* Provider Info */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoCard label={t('providerProfile.concurrency')} value={String(provider.concurrency)} />
          <InfoCard label={t('providerProfile.projects')} value={String(provider.usage?.projectCount ?? 0)} />
          <InfoCard label={t('providerProfile.jobs')} value={String(provider.usage?.activeJobCount ?? 0)} />
          <InfoCard label={t('providerProfile.models')} value={isLoadingModels ? '...' : String(models.length)} />
        </section>

        {/* Models */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
              {t('providerProfile.supportedModels')}
            </h3>
            {provider.type !== 'RunningHub' && provider.type !== 'KlingAI' && provider.type !== 'BytePlus' && provider.type !== 'Replicate' && provider.type !== 'BlackForestLabs' && (
              <button
                onClick={loadModels}
                disabled={isLoadingModels}
                className="text-xs text-neutral-500 dark:text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`} /> {t('providerProfile.refresh')}
              </button>
            )}
          </div>

          {!provider.hasKey && provider.type !== 'RunningHub' && provider.type !== 'KlingAI' && provider.type !== 'BytePlus' && provider.type !== 'Replicate' && provider.type !== 'BlackForestLabs' && (
            <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-sm flex items-center gap-2 shadow-sm font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t('providerProfile.addKeyToFetch')}
            </div>
          )}

          {modelsError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {modelsError}
            </div>
          )}

           {isLoadingModels ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-neutral-500 dark:text-neutral-500 animate-spin" />
            </div>
          ) : (provider.hasKey || provider.type === 'RunningHub' || provider.type === 'KlingAI' || provider.type === 'BytePlus' || provider.type === 'Replicate' || provider.type === 'BlackForestLabs') && models.length === 0 && !modelsError ? (
            <div className="py-12 text-center text-neutral-500 dark:text-neutral-500 text-sm">
              {t('providerProfile.noModels')}
            </div>
          ) : (
            <div className="rounded-card bg-white/50 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl overflow-hidden shadow-xl">
               <table className="w-full text-left border-collapse table-fixed">
                 <thead className="sticky top-0 bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-md z-10">
                     <tr className="border-b border-neutral-200 dark:border-white/5">
                       <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 w-1/3">{t('common.name') || 'Name'}</th>
                       <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 w-1/3">Model ID</th>
                       <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Type</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-neutral-200/50 dark:divide-white/5">
                     {[...models].sort((a, b) => {
                       const order = ['text', 'image', 'video', 'audio'];
                       const catDiff = order.indexOf(a.category) - order.indexOf(b.category);
                       if (catDiff !== 0) return catDiff;
                       return a.name.localeCompare(b.name);
                     }).map(m => {
                       const meta = CATEGORY_META[m.category];
                       const Icon = meta?.icon || MessageSquare;
                       return (
                         <tr key={m.id} className="group hover:bg-neutral-50 dark:hover:bg-amber-500/5 transition-colors">
                           <td className="px-8 py-5">
                             <p className="text-sm font-bold text-neutral-900 dark:text-white group-hover:text-amber-500 transition-colors uppercase tracking-tight truncate">{m.name}</p>
                           </td>
                           <td className="px-4 py-5">
                             <p className="text-xs font-mono text-neutral-500 dark:text-neutral-600 truncate">{m.id}</p>
                           </td>
                           <td className="px-8 py-5">
                             <div className="flex items-center gap-2">
                               <Icon className="w-3.5 h-3.5 text-neutral-400 group-hover:text-amber-500/70 transition-colors" />
                               <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{meta?.label || m.category}</span>
                             </div>
                           </td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 rounded-card px-5 py-4 text-center shadow-sm backdrop-blur-md">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
}
