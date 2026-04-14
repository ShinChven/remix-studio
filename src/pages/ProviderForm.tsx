import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchProvider, createProvider, updateProvider } from '../api';
import { ProviderType } from '../types';
import { Save, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import { ProviderIcon } from '../components/ProviderIcon';

const PROVIDER_TYPES: ProviderType[] = ['GoogleAI', 'VertexAI', 'RunningHub', 'KlingAI', 'OpenAI', 'Grok', 'Claude', 'BytePlus', 'Replicate'];

const TYPE_DESCRIPTIONS: Record<ProviderType, string> = {
  GoogleAI:   'Google AI Studio — x-goog-api-key header',
  VertexAI:   'Google Cloud Vertex AI — API key in URL',
  RunningHub: 'RunningHub OpenAPI v2 — Bearer token',
  KlingAI:    'Kling AI API — Access Key + Secret Key -> JWT Bearer',
  OpenAI:     'OpenAI GPT Image 1.5 — Bearer token',
  Grok:       'xAI Grok Imagine — Bearer token',
  Claude:     'Anthropic Claude — x-api-key header',
  BytePlus:   'BytePlus ModelArk Seedream — Bearer token',
  Replicate:  'Replicate official models — Bearer token',
};

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
        navigate('/providers');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, isEditing, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isEditing && !apiKey.trim()) { setError(type === 'KlingAI' ? t('providerForm.errors.accessKeyRequired') : t('providerForm.errors.apiKeyRequired')); return; }
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
        navigate('/providers');
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

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col py-12 md:py-16 px-4 md:px-8 bg-white dark:bg-neutral-950">
      <div className="w-full max-w-3xl mx-auto bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 rounded-3xl p-5 md:p-8 shadow-2xl backdrop-blur-3xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-amber-50 dark:bg-amber-600/10 rounded-2xl border border-amber-200 dark:border-amber-600/20">
            <ProviderIcon type={type} className="w-6 h-6 text-amber-600 dark:text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
              {isEditing ? t('providerForm.editTitle') : t('providerForm.newTitle')}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">{t('providerForm.securityNote')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">
                {t('providerForm.nameLabel')}
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('providerForm.namePlaceholder')}
                className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all placeholder:text-neutral-400 font-medium shadow-sm"
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">
                {t('providerForm.typeLabel')}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {PROVIDER_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left min-h-[68px] ${
                      type === t 
                        ? 'bg-amber-600 text-white border-amber-700 shadow-lg shadow-amber-600/20' 
                        : 'bg-white/70 dark:bg-neutral-900/70 border-neutral-200/50 dark:border-white/5 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 backdrop-blur-xl shadow-sm'
                    }`}
                  >
                    <div className="flex-1">
                      <span className={`text-sm font-black block leading-tight ${type === t ? 'text-white' : 'text-neutral-900 dark:text-white'}`}>{t}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-tighter opacity-70 ${type === t ? 'text-amber-100' : ''}`}>{TYPE_DESCRIPTIONS[t]}</span>
                    </div>
                    {type === t && <div className="w-2.5 h-2.5 rounded-full bg-white flex-shrink-0 shadow-sm" />}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key / Access Key */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">
                {type === 'KlingAI' ? t('providerForm.accessKeyLabel') : t('providerForm.apiKeyLabel')}{' '}
                {isEditing && hasExistingKey && (
                  <span className="normal-case font-normal tracking-normal">{t('providerForm.leaveBlankToKeep')}</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={isEditing && hasExistingKey ? t('providerForm.stored') : type === 'KlingAI' ? t('providerForm.accessKeyPlaceholder') : t('providerForm.apiKeyPlaceholder')}
                  className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 pr-11 text-sm text-neutral-900 dark:text-neutral-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all placeholder:text-neutral-400 placeholder:font-sans shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-300 transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {type === 'KlingAI' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">
                  {t('providerForm.secretKeyLabel')}{' '}
                  {isEditing && hasExistingSecret && (
                    <span className="normal-case font-normal tracking-normal">{t('providerForm.leaveBlankToKeep')}</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={apiSecret}
                    onChange={e => setApiSecret(e.target.value)}
                    placeholder={isEditing && hasExistingSecret ? t('providerForm.stored') : t('providerForm.secretKeyPlaceholder')}
                    className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 pr-11 text-sm text-neutral-900 dark:text-neutral-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all placeholder:text-neutral-400 placeholder:font-sans shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-300 transition-colors"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* API URL */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">
                {t('providerForm.apiUrlLabel')} <span className="normal-case font-normal tracking-normal">{t('providerForm.apiUrlOptional')}</span>
              </label>
              <input
                type="url"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder={t('providerForm.apiUrlPlaceholder')}
                className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all placeholder:text-neutral-400 placeholder:font-sans shadow-sm"
              />
            </div>

            {/* Concurrency */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">
                {t('providerForm.parallelTasksLabel')} <span className="normal-case font-normal tracking-normal">{t('providerForm.concurrencyLimit')}</span>
              </label>
              <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                max="1000"
                value={concurrency}
                onChange={e => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-200 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all shadow-sm"
              />
                <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
                  {t('providerForm.maxRequests')}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 shadow-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate('/providers')}
              className="w-full sm:flex-1 px-4 py-4 bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] backdrop-blur-xl shadow-sm"
            >
              {t('providerForm.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full sm:flex-1 px-4 py-4 bg-amber-500 hover:bg-amber-600 text-white dark:text-black rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2 border border-amber-600"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? t('providerForm.saving') : isEditing ? t('providerForm.submitSave') : t('providerForm.submitCreate')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
