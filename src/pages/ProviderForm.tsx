import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProvider, createProvider, updateProvider } from '../api';
import { ProviderType } from '../types';
import { Save, Key, Eye, EyeOff } from 'lucide-react';

const PROVIDER_TYPES: ProviderType[] = ['GoogleAI', 'VertexAI', 'RunningHub', 'OpenAI', 'Grok', 'Claude', 'BytePlus'];

const TYPE_DESCRIPTIONS: Record<ProviderType, string> = {
  GoogleAI:   'Google AI Studio — x-goog-api-key header',
  VertexAI:   'Google Cloud Vertex AI — API key in URL',
  RunningHub: 'RunningHub OpenAPI v2 — Bearer token',
  OpenAI:     'OpenAI GPT Image 1.5 — Bearer token',
  Grok:       'xAI Grok Imagine — Bearer token',
  Claude:     'Anthropic Claude — x-api-key header',
  BytePlus:   'BytePlus ModelArk Seedream — Bearer token',
};

export function ProviderForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>('GoogleAI');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
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
    if (!isEditing && !apiKey.trim()) { setError('API Key is required.'); return; }

    setIsSubmitting(true);
    setError(null);
    try {
      const urlValue = apiUrl.trim() || undefined;
      const payload = {
        name: name.trim(),
        type,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        apiUrl: urlValue ?? null,
        concurrency
      };

      if (isEditing) {
        await updateProvider(id!, payload);
        navigate('/providers');
      } else {
        await createProvider(payload as any);
        navigate('/providers');
      }
    } catch (e: any) {
      setError(e?.message || 'Save failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-950">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col py-12 md:py-16 px-4 md:px-8 bg-neutral-950">
      <div className="w-full max-w-3xl mx-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-5 md:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-amber-600/10 rounded-2xl">
            <Key className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isEditing ? 'Edit Provider' : 'New Provider'}
            </h2>
            <p className="text-sm text-neutral-500">Keys encrypted with AES-256-GCM</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">
                Provider Name
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Work account, Personal key…"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all placeholder:text-neutral-700"
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">
                Provider Type
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {PROVIDER_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left min-h-[68px] ${
                      type === t ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-neutral-950 border-neutral-800 text-neutral-600 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex-1">
                      <span className="text-sm font-bold block leading-tight">{t}</span>
                      <span className="text-[11px] opacity-60 font-normal">{TYPE_DESCRIPTIONS[t]}</span>
                    </div>
                    {type === t && <div className="w-2 h-2 rounded-full bg-current flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">
                API Key{' '}
                {isEditing && hasExistingKey && (
                  <span className="normal-case font-normal tracking-normal">— leave blank to keep existing</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={isEditing && hasExistingKey ? '•••••••• (stored)' : 'Paste your API key…'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 pr-11 text-sm text-neutral-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all placeholder:text-neutral-700 placeholder:font-sans"
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

            {/* API URL */}
            <div className="space-y-2">
              <label className="text-[10px) font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">
                API URL <span className="normal-case font-normal tracking-normal">— optional override</span>
              </label>
              <input
                type="url"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="https://… (leave blank for default)"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all placeholder:text-neutral-700 placeholder:font-sans"
              />
            </div>

            {/* Concurrency */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">
                Parallel Tasks <span className="normal-case font-normal tracking-normal">— concurrency limit</span>
              </label>
              <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                max="1000"
                value={concurrency}
                onChange={e => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 transition-all"
              />
                <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
                  Max requests
                </span>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate('/providers')}
              className="w-full sm:flex-1 px-4 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full sm:flex-1 px-4 py-3.5 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
