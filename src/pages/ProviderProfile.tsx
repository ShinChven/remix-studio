import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchProvider, fetchProviderModels, ProviderModelInfo } from '../api';
import { Provider, ProviderType } from '../types';
import {
  Key, Globe, CheckCircle, AlertCircle, Pencil, ArrowLeft,
  MessageSquare, Image, Video, Loader2, RefreshCw,
} from 'lucide-react';

const TYPE_COLORS: Record<ProviderType, { icon: string; badge: string }> = {
  GoogleAI:   { icon: 'bg-blue-500/10 text-blue-500',   badge: 'bg-blue-600/10 text-blue-400 border-blue-600/30' },
  VertexAI:   { icon: 'bg-purple-500/10 text-purple-500', badge: 'bg-purple-600/10 text-purple-400 border-purple-600/30' },
  RunningHub: { icon: 'bg-emerald-500/10 text-emerald-500', badge: 'bg-emerald-600/10 text-emerald-400 border-emerald-600/30' },
  OpenAI:     { icon: 'bg-orange-500/10 text-orange-500', badge: 'bg-orange-600/10 text-orange-400 border-orange-600/30' },
  Grok:       { icon: 'bg-rose-500/10 text-rose-500', badge: 'bg-rose-600/10 text-rose-400 border-rose-600/30' },
  Claude:     { icon: 'bg-amber-500/10 text-amber-500', badge: 'bg-amber-600/10 text-amber-400 border-amber-600/30' },
};

const CATEGORY_META: Record<string, { label: string; icon: typeof MessageSquare; color: string }> = {
  text:  { label: 'Text Generation',  icon: MessageSquare, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  image: { label: 'Image Generation', icon: Image,         color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
  video: { label: 'Video Generation', icon: Video,         color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
};

export function ProviderProfile() {
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
      setError('Failed to load provider.');
    } finally {
      setIsLoadingProvider(false);
    }
  }, [id]);

  const loadModels = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoadingModels(true);
      setModelsError(null);
      const result = await fetchProviderModels(id);
      setModels(result.models);
      if (result.error) setModelsError(result.error);
    } catch {
      setModelsError('Failed to fetch models from provider API.');
    } finally {
      setIsLoadingModels(false);
    }
  }, [id]);

  useEffect(() => { loadProvider(); }, [loadProvider]);
  // RunningHub uses static models (no API key required); others require a key
  useEffect(() => {
    if (!provider) return;
    if (provider.type === 'RunningHub' || provider.hasKey) loadModels();
  }, [provider, loadModels]);

  const grouped = {
    text:  models.filter(m => m.category === 'text'),
    image: models.filter(m => m.category === 'image'),
    video: models.filter(m => m.category === 'video'),
  };

  if (isLoadingProvider) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-neutral-400">{error || 'Provider not found'}</p>
        <button onClick={() => navigate('/providers')} className="text-sm text-amber-400 hover:underline">
          Back to Providers
        </button>
      </div>
    );
  }

  const colors = TYPE_COLORS[provider.type];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        {/* Header */}
        <header>
          <button
            onClick={() => navigate('/providers')}
            className="text-sm text-neutral-500 hover:text-neutral-300 flex items-center gap-1 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Providers
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${colors.icon}`}>
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white font-display">{provider.name}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${colors.badge}`}>
                    {provider.type}
                  </span>
                  {provider.apiUrl && (
                    <span className="flex items-center gap-1 text-xs text-neutral-500">
                      <Globe className="w-3.5 h-3.5" />{provider.apiUrl}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 text-xs font-medium ${provider.hasKey ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {provider.hasKey
                      ? <><CheckCircle className="w-3.5 h-3.5" /> Key stored</>
                      : <><AlertCircle className="w-3.5 h-3.5" /> No key</>}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate(`/provider/${id}/edit`)}
              className="text-xs md:text-sm bg-neutral-800 text-neutral-300 hover:bg-neutral-700 px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-neutral-700 font-medium"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          </div>
        </header>

        {/* Provider Info */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoCard label="Concurrency" value={String(provider.concurrency)} />
          <InfoCard label="Projects" value={String(provider.usage?.projectCount ?? 0)} />
          <InfoCard label="Active Jobs" value={String(provider.usage?.activeJobCount ?? 0)} />
          <InfoCard label="Supported Models" value={isLoadingModels ? '...' : String(models.length)} />
        </section>

        {/* Models */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-semibold text-white">
              {provider.type === 'RunningHub' ? 'Supported Models' : 'Available Models'}
            </h3>
            {provider.type !== 'RunningHub' && (
              <button
                onClick={loadModels}
                disabled={isLoadingModels}
                className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`} /> Refresh
              </button>
            )}
          </div>

          {!provider.hasKey && provider.type !== 'RunningHub' && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Add an API key to fetch available models from the provider.
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
              <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
            </div>
          ) : (provider.hasKey || provider.type === 'RunningHub') && models.length === 0 && !modelsError ? (
            <div className="py-12 text-center text-neutral-500 text-sm">
              No models returned by the provider API.
            </div>
          ) : (
            <div className="space-y-6">
              {(['text', 'image', 'video'] as const).map(cat => {
                const items = grouped[cat];
                if (items.length === 0) return null;
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border ${meta.color}`}>
                        <Icon className="w-4 h-4" />
                        {meta.label}
                      </span>
                      <span className="text-xs text-neutral-500">{items.length} model{items.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {items.map(m => (
                        <div
                          key={m.id}
                          className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl px-3.5 py-2.5 hover:border-neutral-700 transition-colors"
                        >
                          <p className="text-sm font-medium text-white truncate">{m.name}</p>
                          <p className="text-[11px] text-neutral-500 truncate font-mono mt-0.5">{m.id}</p>
                          {m.description && (
                            <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{m.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl px-3.5 py-3 text-center">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
