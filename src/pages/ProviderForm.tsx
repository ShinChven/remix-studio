import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchProvider, createProvider, updateProvider } from '../api';
import { ProviderType, PROVIDER_MODELS_MAP } from '../types';
import { Save, Eye, EyeOff, Loader2, MessageSquare, Image as ImageIcon, Video, Music, Plus, Minus } from 'lucide-react';
import { ProviderIcon } from '../components/ProviderIcon';

const PROVIDER_TYPES: ProviderType[] = ['GoogleAI', 'VertexAI', 'OpenAI', 'Claude', 'Grok', 'Alibabacloud', 'RunningHub', 'KlingAI', 'BytePlus', 'Replicate', 'BlackForestLabs'];



const CATEGORY_ICONS: Record<string, any> = {
  text: MessageSquare,
  image: ImageIcon,
  video: Video,
  audio: Music,
};

const maskedCredentialStyle = {
  WebkitTextSecurity: 'disc',
} as React.CSSProperties;

export function ProviderForm() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>('GoogleAI');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
        return;
    }
    (async () => {
      try {
        const p = await fetchProvider(id!);
        setName(p.name);
        setType(p.type);
        setApiUrl(p.apiUrl || '');
        setConcurrency(p.concurrency || 1);
        setHasExistingKey(p.hasKey);
        setHasExistingSecret(Boolean(p.hasSecret));
      } catch {
      if (id) {
        navigate(`/provider/${id}`);
      } else {
        navigate('/providers');
      }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, isEditing, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isEditing && !apiKey.trim()) { setError(type === 'KlingAI' ? t('providerForm.errors.accessKeyRequired') : t('providerForm.errors.apiKeyRequired')); return; }
    if (isEditing && !apiKey.trim() && !hasExistingKey) { setError(type === 'KlingAI' ? t('providerForm.errors.accessKeyRequired') : t('providerForm.errors.apiKeyRequired')); return; }
    if (type === 'KlingAI' && !isEditing && !apiSecret.trim()) { setError(t('providerForm.errors.secretKeyRequired')); return; }
    if (type === 'KlingAI' && isEditing && !apiSecret.trim() && !hasExistingSecret) { setError(t('providerForm.errors.secretKeyRequired')); return; }

    setIsSubmitting(true);
    setError(null);
    try {
      const urlValue = apiUrl.trim() || undefined;
      const payload = {
        name: name.trim(),
        type,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(type === 'KlingAI' && apiSecret.trim() ? { apiSecret: apiSecret.trim() } : {}),
        apiUrl: urlValue ?? null,
        concurrency,
      };

      if (isEditing) {
        await updateProvider(id!, payload);
      if (isEditing) {
        navigate(`/provider/${id}`);
      } else {
        navigate('/providers');
      }
      } else {
        await createProvider(payload as any);
        navigate('/providers');
      }
    } catch (e: any) {
      setError(e?.message || t('providerForm.errors.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentModels = useMemo(() => {
    return PROVIDER_MODELS_MAP[type] || [];
  }, [type]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-white dark:bg-neutral-950">
      <div className="flex-1 w-full flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-6 border-b border-neutral-200/50 dark:border-white/5 bg-white/50 dark:bg-neutral-950/50 backdrop-blur-3xl sticky top-0 z-20">
          <div className="mx-auto w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
                    {isEditing ? t('providerForm.editTitle') : t('providerForm.newTitle')}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-500 font-medium">{t('providerForm.securityNote')}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => isEditing ? navigate(`/provider/${id}`) : navigate('/providers')}
                  className="px-6 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                >
                  {t('providerForm.cancel')}
                </button>
                <button
                  form="provider-form"
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-8 py-2.5 bg-amber-500 hover:bg-amber-600 text-white dark:text-black rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2 border border-amber-600"
                >
                   <Save className="w-4 h-4" />
                  {isSubmitting ? t('providerForm.saving') : isEditing ? t('providerForm.submitSave') : t('providerForm.submitCreate')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 md:px-8 py-10 space-y-10 max-w-screen-2xl mx-auto w-full">
          {/* Provider Type Selection Grid / Read-only Display during Edit */}
          <section className="space-y-6">
            {isEditing ? (
              <div className="flex">
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/50 bg-amber-600/10 text-amber-600 dark:text-amber-500 shadow-sm backdrop-blur-xl">
                  <ProviderIcon type={type} className="w-5 h-5" />
                  <span className="text-[11px] font-black uppercase tracking-wider">{type}</span>
                  <div className="ml-2 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {PROVIDER_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all relative group ${
                      type === t 
                        ? 'bg-amber-600 text-white border-amber-700 shadow-md shadow-amber-600/20 ring-2 ring-amber-500/20' 
                        : 'bg-white/50 dark:bg-neutral-900/40 border-neutral-200 dark:border-white/5 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-700 hover:bg-white dark:hover:bg-neutral-900 backdrop-blur-xl shadow-sm'
                    }`}
                  >
                    <ProviderIcon type={t} className={`w-5 h-5 transition-transform group-hover:scale-110 ${type === t ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'}`} />
                    <span className={`text-[11px] font-black uppercase tracking-wider ${type === t ? 'text-white' : 'text-neutral-900 dark:text-white'}`}>{t}</span>
                    {type === t && (
                      <div className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,1)]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Form Fields - Left Column */}
            <form id="provider-form" onSubmit={handleSubmit} autoComplete="off" className="lg:col-span-5 xl:col-span-4 space-y-8 h-fit">
              <div className="space-y-8 bg-neutral-200/20 dark:bg-black/20 p-8 rounded-card border border-neutral-200/50 dark:border-white/5 backdrop-blur-3xl shadow-xl">
                {/* Name */}
                <div className="space-y-2.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500 ml-1">
                    {t('providerForm.nameLabel')}
                  </label>
                  <input
                    type="text"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('providerForm.namePlaceholder')}
                    className="w-full bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3.5 text-sm font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 transition-all shadow-inner-sm"
                    required
                  />
                </div>

                {/* API Key / Access Key */}
                <div className="space-y-2.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500 ml-1">
                    {type === 'KlingAI' ? t('providerForm.accessKeyLabel') : t('providerForm.apiKeyLabel')}{' '}
                    {isEditing && hasExistingKey && (
                      <span className="normal-case font-medium tracking-normal text-[10px] italic opacity-40">({t('providerForm.leaveBlankToKeep')})</span>
                    )}
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      style={showKey ? undefined : maskedCredentialStyle}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={isEditing && hasExistingKey ? t('providerForm.stored') : type === 'KlingAI' ? t('providerForm.accessKeyPlaceholder') : t('providerForm.apiKeyPlaceholder')}
                      className="w-full bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3.5 pr-12 text-sm font-mono text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 transition-all shadow-inner-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(s => !s)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-amber-500 dark:text-neutral-500 dark:hover:text-amber-500 transition-colors"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {type === 'KlingAI' && (
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500 ml-1">
                      {t('providerForm.secretKeyLabel')}{' '}
                      {isEditing && hasExistingSecret && (
                        <span className="normal-case font-medium tracking-normal text-[10px] italic opacity-40">({t('providerForm.leaveBlankToKeep')})</span>
                      )}
                    </label>
                    <div className="relative group">
                      <input
                        type="text"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        style={showSecret ? undefined : maskedCredentialStyle}
                        value={apiSecret}
                        onChange={e => setApiSecret(e.target.value)}
                        placeholder={isEditing && hasExistingSecret ? t('providerForm.stored') : t('providerForm.secretKeyPlaceholder')}
                        className="w-full bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3.5 pr-12 text-sm font-mono text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 transition-all shadow-inner-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(s => !s)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-amber-500 dark:text-neutral-500 dark:hover:text-amber-500 transition-colors"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* API URL */}
                <div className="space-y-2.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500 ml-1 flex items-center justify-between">
                    <span>{t('providerForm.apiUrlLabel')}</span>
                    <span className="normal-case font-medium tracking-normal italic opacity-40 text-[9px]">{t('providerForm.apiUrlOptional')}</span>
                  </label>
                  <input
                    type="url"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    placeholder={t('providerForm.apiUrlPlaceholder')}
                    className="w-full bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3.5 text-sm font-mono text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 transition-all shadow-inner-sm"
                  />
                </div>

                {/* Concurrency Stepper */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500">
                      {t('providerForm.parallelTasksLabel')}
                    </label>
                    <div className="text-right">
                      <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">{t('providerForm.maxRequests')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 p-1 bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-inner-sm group-focus-within:border-amber-500/50 transition-all">
                    <button
                      type="button"
                      onClick={() => setConcurrency(Math.max(1, concurrency - 1))}
                      className="p-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all disabled:opacity-20"
                      disabled={concurrency <= 1}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    
                    <input
                      type="number"
                      autoComplete="off"
                      min="1"
                      max="1000"
                      value={concurrency}
                      onChange={e => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 bg-transparent border-none text-center text-lg font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-0"
                    />

                    <button
                      type="button"
                      onClick={() => setConcurrency(Math.min(1000, concurrency + 1))}
                      className="p-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all disabled:opacity-20"
                      disabled={concurrency >= 1000}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[9px] text-neutral-400 dark:text-neutral-600 font-medium italic ml-1">{t('providerForm.concurrencyLimit')}</p>
                </div>
              </div>

              {error && (
                <p className="text-sm font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-5 py-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                  {error}
                </p>
              )}
            </form>

            {/* Supported Models Display - Right Column */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
              <div className="flex-1 rounded-card bg-neutral-100/50 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl flex flex-col overflow-hidden">
                 <div className="px-8 py-6 border-b border-neutral-200 dark:border-white/5">
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                      {t('providerForm.supportedModels')}
                    </h3>
                 </div>

                 <div className="flex-1 overflow-auto">
                   <table className="w-full text-left border-collapse table-fixed">
                     <thead className="sticky top-0 bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-md z-10">
                       <tr className="border-b border-neutral-200 dark:border-white/5">
                         <th className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 w-1/3">{t('common.name') || 'Name'}</th>
                         <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 w-1/3">Model ID</th>
                         <th className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Type</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-neutral-200/50 dark:divide-white/5">
                       {currentModels.map(m => {
                         const Icon = CATEGORY_ICONS[m.category] || ImageIcon;
                         return (
                           <tr key={m.id} className="group hover:bg-neutral-50 dark:hover:bg-amber-500/5 transition-colors">
                             <td className="px-8 py-4">
                               <p className="text-sm font-bold text-neutral-900 dark:text-white group-hover:text-amber-500 transition-colors uppercase tracking-tight truncate">{m.name}</p>
                             </td>
                             <td className="px-4 py-4">
                               <p className="text-xs font-mono text-neutral-500 dark:text-neutral-600 truncate">{m.modelId}</p>
                             </td>
                             <td className="px-8 py-4">
                               <div className="flex items-center gap-2">
                                 <Icon className="w-3.5 h-3.5 text-neutral-400 group-hover:text-amber-500/70 transition-colors" />
                                 <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{m.category}</span>
                               </div>
                             </td>
                           </tr>
                         );
                       })}
                       {currentModels.length === 0 && (
                         <tr>
                           <td colSpan={3} className="px-8 py-12 text-center text-xs font-bold text-neutral-400 dark:text-neutral-600 italic">
                             No models listed for this provider yet.
                           </td>
                         </tr>
                       )}
                     </tbody>
                   </table>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
