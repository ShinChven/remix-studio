import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Copy, Key, Loader2, Plus, Shield, Trash2, Unplug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchOAuthClients, fetchPersonalAccessTokens, revokeOAuthClient, revokePersonalAccessToken, createPersonalAccessToken, type OAuthClientSummary, type PersonalAccessTokenSummary } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageHeader } from '../components/PageHeader';
import { toast } from 'sonner';

export function McpConnections() {
  const { t } = useTranslation();

  const formatDate = useCallback((ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }, []);

  const formatRelative = useCallback((ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return t('mcpConnections.justNow');
    if (diff < 3600_000) return t('mcpConnections.relativeTime.m', { count: Math.floor(diff / 60_000) });
    if (diff < 86400_000) return t('mcpConnections.relativeTime.h', { count: Math.floor(diff / 3600_000) });
    return formatDate(ts);
  }, [t, formatDate]);

  const EXPIRY_OPTIONS = useMemo(() => [
    { label: t('mcpConnections.expiryOptions.noExpiration'), value: 0 },
    { label: t('mcpConnections.expiryOptions.7days'), value: 7 },
    { label: t('mcpConnections.expiryOptions.30days'), value: 30 },
    { label: t('mcpConnections.expiryOptions.90days'), value: 90 },
    { label: t('mcpConnections.expiryOptions.1year'), value: 365 },
  ], [t]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const mcpUrl = origin ? `${origin}/mcp` : '/mcp';
  const oauthMetadataUrl = origin ? `${origin}/.well-known/oauth-authorization-server` : '/.well-known/oauth-authorization-server';
  const projectOAuthJson = JSON.stringify({
    mcpServers: {
      'remix-studio': {
        type: 'http',
        url: mcpUrl,
      },
    },
  }, null, 2);
  const projectTokenJson = JSON.stringify({
    mcpServers: {
      'remix-studio': {
        type: 'http',
        url: mcpUrl,
        headers: {
          Authorization: 'Bearer YOUR_MCP_TOKEN',
        },
      },
    },
  }, null, 2);

  const [clients, setClients] = useState<OAuthClientSummary[]>([]);
  const [tokens, setTokens] = useState<PersonalAccessTokenSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Revoke state
  const [revokeTarget, setRevokeTarget] = useState<{ type: 'client'; clientId: string; name: string } | { type: 'token'; id: string; name: string } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Create PAT state
  const [showCreatePat, setShowCreatePat] = useState(false);
  const [showJsonSetup, setShowJsonSetup] = useState(false);
  const [patName, setPatName] = useState('');
  const [patExpiry, setPatExpiry] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const patNameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [clientsData, tokensData] = await Promise.all([
        fetchOAuthClients(),
        fetchPersonalAccessTokens(),
      ]);
      setClients(clientsData);
      setTokens(tokensData);
    } catch {
      setError(t('mcpConnections.errorLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (showCreatePat && patNameRef.current) {
      patNameRef.current.focus();
    }
  }, [showCreatePat]);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      if (revokeTarget.type === 'client') {
        await revokeOAuthClient(revokeTarget.clientId);
        toast.success(t('mcpConnections.toasts.clientRevoked'));
      } else {
        await revokePersonalAccessToken(revokeTarget.id);
        toast.success(t('mcpConnections.toasts.tokenRevoked'));
      }
      setRevokeTarget(null);
      await load();
    } catch {
      toast.error(t('mcpConnections.toasts.revokeFailed'));
    } finally {
      setIsRevoking(false);
    }
  };

  const handleCreatePat = async () => {
    if (!patName.trim()) return;
    setIsCreating(true);
    try {
      const result = await createPersonalAccessToken(patName.trim(), patExpiry || undefined);
      setNewToken(result.token);
      setPatName('');
      setPatExpiry(0);
      await load();
    } catch {
      toast.error(t('mcpConnections.toasts.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    toast.success(t('mcpConnections.toasts.tokenCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseNewToken = () => {
    setNewToken(null);
    setShowCreatePat(false);
    setCopied(false);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('mcpConnections.toasts.copied', { label }));
    } catch {
      toast.error(t('mcpConnections.toasts.copyFailed', { label: label.toLowerCase() }));
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8 md:space-y-12">
        <PageHeader
          title={t('mcpConnections.title')}
          description={t('mcpConnections.description')}
        />

        <section className="rounded-xl border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl overflow-hidden relative group shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-amber-500/5 opacity-50" />
          <div className="relative p-5 md:p-8 flex flex-col md:flex-row items-start gap-4 md:gap-6">
            <div className="flex-shrink-0 rounded-2xl bg-sky-500/10 p-3 text-sky-400 border border-sky-500/20 shadow-lg shadow-sky-500/5">
              <AlertCircle className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <div className="flex-1 space-y-6 md:space-y-8">
              <div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{t('mcpConnections.connectSection.title')}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 max-w-3xl">
                  {t('mcpConnections.connectSection.description')}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 md:p-5 transition-transform hover:scale-[1.01] duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <p className="text-sm font-bold text-blue-300">{t('mcpConnections.connectSection.oauthMethod.title')}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {t('mcpConnections.connectSection.oauthMethod.description')}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 md:p-5 transition-transform hover:scale-[1.01] duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <p className="text-sm font-bold text-amber-300">{t('mcpConnections.connectSection.tokenMethod.title')}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {t('mcpConnections.connectSection.tokenMethod.description')}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950/60 p-4 md:p-5 shadow-inner">
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-3">{t('mcpConnections.connectSection.appAddress.label')}</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-xl bg-white dark:bg-neutral-900 px-4 py-3 text-xs md:text-sm text-sky-700 dark:text-sky-300 font-mono border border-neutral-200 dark:border-neutral-800 shadow-sm">{mcpUrl}</code>
                    <button
                      onClick={() => copyText(mcpUrl, 'MCP URL')}
                      className="flex-shrink-0 rounded-xl bg-neutral-200 dark:bg-neutral-800 p-3 text-neutral-700 dark:text-neutral-300 transition-all hover:bg-neutral-700 active:scale-95 border border-neutral-700 shadow-sm"
                      title={t('mcpConnections.connectSection.appAddress.copyTitle')}
                    >
                      <Copy className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500 italic">
                    {t('mcpConnections.connectSection.appAddress.instruction')}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950/60 p-4 md:p-5 shadow-inner">
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-3">{t('mcpConnections.connectSection.advancedUrl.label')}</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-xl bg-white dark:bg-neutral-900 px-4 py-3 text-xs md:text-sm text-blue-700 dark:text-blue-300 font-mono border border-neutral-200 dark:border-neutral-800 shadow-sm">{oauthMetadataUrl}</code>
                    <button
                      onClick={() => copyText(oauthMetadataUrl, 'OAuth metadata URL')}
                      className="flex-shrink-0 rounded-xl bg-neutral-200 dark:bg-neutral-800 p-3 text-neutral-700 dark:text-neutral-300 transition-all hover:bg-neutral-700 active:scale-95 border border-neutral-700 shadow-sm"
                      title={t('mcpConnections.connectSection.advancedUrl.copyTitle')}
                    >
                      <Copy className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500 italic">
                    {t('mcpConnections.connectSection.advancedUrl.instruction')}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { title: t('mcpConnections.connectSection.steps.1.title'), desc: t('mcpConnections.connectSection.steps.1.desc') },
                  { title: t('mcpConnections.connectSection.steps.2.title'), desc: t('mcpConnections.connectSection.steps.2.desc') },
                  { title: t('mcpConnections.connectSection.steps.3.title'), desc: t('mcpConnections.connectSection.steps.3.desc') }
                ].map((step, i) => (
                  <div key={i} className="rounded-2xl border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-md p-4 relative overflow-hidden group/step shadow-sm hover:shadow-md transition-shadow">
                    <div className="absolute -right-2 -bottom-2 text-6xl font-display font-black text-neutral-800/10 select-none group-hover/step:text-sky-500/5 transition-colors">{i + 1}</div>
                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-600 dark:text-neutral-400 mb-1 relative z-10">{step.title}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-500 relative z-10 leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden shadow-inner">
                <button
                  onClick={() => setShowJsonSetup(!showJsonSetup)}
                  className="w-full flex items-center justify-between p-4 md:p-5 text-left transition-colors hover:bg-neutral-900/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${showJsonSetup ? 'bg-sky-500/20 text-sky-400' : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-500'} transition-colors`}>
                      <Plus className={`h-4 w-4 transition-transform duration-300 ${showJsonSetup ? 'rotate-45' : ''}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-neutral-900 dark:text-white tracking-tight">{t('mcpConnections.connectSection.jsonSetup.title')}</h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-0.5">{t('mcpConnections.connectSection.jsonSetup.subtitle')}</p>
                    </div>
                  </div>
                  {showJsonSetup ? <ChevronUp className="h-5 w-5 text-neutral-600" /> : <ChevronDown className="h-5 w-5 text-neutral-600" />}
                </button>

                {showJsonSetup && (
                  <div className="p-4 md:p-6 pt-0 space-y-6 animate-in slide-in-from-top-4 duration-300">
                    <div className="h-px bg-neutral-200 dark:bg-neutral-800 mb-6" />
                    <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 italic mb-4">
                      {t('mcpConnections.connectSection.jsonSetup.instruction')}
                    </p>
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">{t('mcpConnections.connectSection.jsonSetup.oauthJson')}</p>
                          <button
                            onClick={() => copyText(projectOAuthJson, 'OAuth JSON')}
                            className="rounded-lg bg-neutral-200 dark:bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-all hover:bg-neutral-700 hover:text-white active:scale-95 border border-neutral-700"
                          >
                            {t('mcpConnections.connectSection.jsonSetup.copyJson')}
                          </button>
                        </div>
                        <div className="relative group/code">
                          <pre className="overflow-x-auto rounded-xl bg-white dark:bg-neutral-950 p-4 text-[11px] md:text-xs text-sky-800 dark:text-sky-300 border border-neutral-200 dark:border-neutral-800 font-mono leading-relaxed shadow-inner">
                            <code>{projectOAuthJson}</code>
                          </pre>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed">
                          {t('mcpConnections.connectSection.oauthMethod.description')}
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">{t('mcpConnections.connectSection.jsonSetup.tokenJson')}</p>
                          <button
                            onClick={() => copyText(projectTokenJson, 'Bearer token JSON')}
                            className="rounded-lg bg-neutral-200 dark:bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-all hover:bg-neutral-700 hover:text-white active:scale-95 border border-neutral-700"
                          >
                            {t('mcpConnections.connectSection.jsonSetup.copyJson')}
                          </button>
                        </div>
                        <div className="relative group/code">
                          <pre className="overflow-x-auto rounded-xl bg-white dark:bg-neutral-950 p-4 text-[11px] md:text-xs text-amber-800 dark:text-amber-300 border border-neutral-200 dark:border-neutral-800 font-mono leading-relaxed shadow-inner">
                            <code>{projectTokenJson}</code>
                          </pre>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed">
                          {t('mcpConnections.connectSection.jsonSetup.tokenInstruction')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ─── Personal Access Tokens ─── */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Key className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">{t('mcpConnections.tokens.title')}</h3>
            </div>
            <button
              onClick={() => { setShowCreatePat(true); setNewToken(null); }}
              className="text-xs md:text-sm bg-amber-600 text-neutral-900 dark:text-white hover:bg-amber-500 px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 font-bold shadow-lg shadow-amber-600/10 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>{t('mcpConnections.tokens.newToken')}</span>
            </button>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 relative overflow-hidden group/tip">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover/tip:opacity-20 transition-opacity">
              <Shield className="w-12 h-12 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-amber-300 mb-1">{t('mcpConnections.tokens.whenToUse')}</p>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 max-w-2xl">
              {t('mcpConnections.tokens.tip')}
            </p>
          </div>

          {/* Create PAT form */}
          {showCreatePat && (
            <div className="p-5 md:p-6 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl space-y-5 animate-in zoom-in-95 duration-200 shadow-xl relative z-10">
              {newToken ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5 text-emerald-400 text-sm font-bold bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl">
                    <CheckCircle className="w-4 h-4" />
                    {t('mcpConnections.toasts.tokenCreated')}
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 bg-neutral-50 dark:bg-neutral-950 text-amber-400 px-4 py-3 rounded-xl text-xs md:text-sm font-mono break-all select-all border border-neutral-200 dark:border-neutral-800 shadow-inner">
                      {newToken}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="flex-shrink-0 p-3 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all active:scale-95 border border-neutral-700 shadow-sm"
                      title={t('mcpConnections.tokens.card.revokeTitle')}
                    >
                      {copied ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />}
                    </button>
                  </div>
                  <button
                    onClick={handleCloseNewToken}
                    className="text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:text-white transition-colors"
                  >
                    {t('mcpConnections.tokens.form.done')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500 ml-1">{t('mcpConnections.tokens.form.tokenName')}</label>
                      <input
                        ref={patNameRef}
                        type="text"
                        value={patName}
                        onChange={(e) => setPatName(e.target.value)}
                        placeholder={t('mcpConnections.tokens.form.placeholder')}
                        className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-medium"
                        maxLength={128}
                        onKeyDown={(e) => { if (e.key === 'Enter' && patName.trim()) handleCreatePat(); }}
                      />
                    </div>
                    <div className="w-full sm:w-48 space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500 ml-1">{t('mcpConnections.tokens.form.expiration')}</label>
                      <select
                        value={patExpiry}
                        onChange={(e) => setPatExpiry(Number(e.target.value))}
                        className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-medium appearance-none cursor-pointer"
                      >
                        {EXPIRY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleCreatePat}
                      disabled={!patName.trim() || isCreating}
                      className="flex-1 sm:flex-none text-sm bg-amber-600 text-neutral-900 dark:text-white hover:bg-amber-500 px-6 py-2.5 rounded-xl transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-600/10 active:scale-95"
                    >
                      {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                      {t('mcpConnections.tokens.form.create')}
                    </button>
                    <button
                      onClick={() => { setShowCreatePat(false); setPatName(''); setPatExpiry(0); }}
                      className="flex-1 sm:flex-none text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:text-white px-6 py-2.5 rounded-xl transition-colors bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
                    >
                      {t('mcpConnections.tokens.form.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Token list */}
          <div className="grid gap-4">
            {isLoading ? (
              [1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 animate-pulse" />
              ))
            ) : tokens.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-900/10 shadow-sm">
                <div className="p-4 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <Key className="w-8 h-8 text-neutral-700" />
                </div>
                <div>
                  <p className="text-lg font-bold text-neutral-600 dark:text-neutral-400 tracking-tight">{t('mcpConnections.tokens.empty.title')}</p>
                  <p className="text-sm max-w-xs mx-auto text-neutral-500 dark:text-neutral-500 mt-1">{t('mcpConnections.tokens.empty.desc')}</p>
                </div>
              </div>
            ) : (
              tokens.map((token) => (
                <div
                  key={token.id}
                  className="w-full bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl hover:bg-white/80 dark:hover:bg-neutral-900/80 p-4 md:p-5 rounded-xl transition-all group/card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="flex-shrink-0 p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 group-hover/card:scale-110 transition-transform">
                      <Key className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden space-y-1">
                      <h4 className="font-bold text-neutral-900 dark:text-white text-base truncate tracking-tight">{token.name}</h4>
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3">
                        <code className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800">{token.tokenPrefix}...</code>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-500">
                          <div className="w-1 h-1 rounded-full bg-neutral-700" />
                          <span>{t('mcpConnections.tokens.card.created', { date: formatDate(token.createdAt) })}</span>
                        </div>
                        {token.lastUsedAt && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400">
                            <div className="w-1 h-1 rounded-full bg-sky-400" />
                            <span>{t('mcpConnections.tokens.card.used', { date: formatRelative(token.lastUsedAt) })}</span>
                          </div>
                        )}
                        {token.expiresAt && (
                          <div className={`flex items-center gap-1.5 text-[10px] font-bold ${token.expired ? 'text-red-400' : 'text-neutral-500 dark:text-neutral-500'}`}>
                            <div className={`w-1 h-1 rounded-full ${token.expired ? 'bg-red-400' : 'bg-neutral-600'}`} />
                            <span>{token.expired ? t('mcpConnections.tokens.card.expired') : t('mcpConnections.tokens.card.expires', { date: formatDate(token.expiresAt) })}</span>
                          </div>
                        )}
                        {!token.expiresAt && (
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-600">
                            <div className="w-1 h-1 rounded-full bg-neutral-700" />
                            <span>{t('mcpConnections.tokens.card.noExpiration')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRevokeTarget({ type: 'token', id: token.id, name: token.name })}
                    className="flex-shrink-0 self-end sm:self-center p-2.5 text-neutral-500 dark:text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all hover:rotate-12"
                    title={t('mcpConnections.tokens.card.revokeTitle')}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ─── OAuth Clients ─── */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">{t('mcpConnections.oauth.title')}</h3>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 relative overflow-hidden group/tip">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover/tip:opacity-20 transition-opacity">
              <CheckCircle className="w-12 h-12 text-blue-500" />
            </div>
            <p className="text-sm font-bold text-blue-300 mb-1">{t('mcpConnections.oauth.recommended')}</p>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 max-w-2xl">
              {t('mcpConnections.oauth.tip')}
            </p>
          </div>

          <div className="grid gap-4">
            {isLoading ? (
              [1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-white dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 animate-pulse" />
              ))
            ) : clients.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-900/10 shadow-sm">
                <div className="p-4 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <Shield className="w-8 h-8 text-neutral-700" />
                </div>
                <div>
                  <p className="text-lg font-bold text-neutral-600 dark:text-neutral-400 tracking-tight">{t('mcpConnections.oauth.empty.title')}</p>
                  <p className="text-sm max-w-xs mx-auto text-neutral-500 dark:text-neutral-500 mt-1">{t('mcpConnections.oauth.empty.desc')}</p>
                </div>
              </div>
            ) : (
              clients.map((client) => (
                <div
                  key={client.id}
                  className="w-full bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl hover:bg-white/80 dark:hover:bg-neutral-900/80 p-4 md:p-5 rounded-xl transition-all group/card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="flex-shrink-0 p-3 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 group-hover/card:scale-110 transition-transform">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden space-y-1">
                      <h4 className="font-bold text-neutral-900 dark:text-white text-base truncate tracking-tight">
                        {client.clientName || client.clientId}
                      </h4>
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3">
                        {client.clientName && (
                          <code className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800">{client.clientId.slice(0, 12)}...</code>
                        )}
                        <div className={`flex items-center gap-1.5 text-[10px] font-bold ${client.activeTokens > 0 ? 'text-emerald-400' : 'text-neutral-500 dark:text-neutral-500'}`}>
                          <div className={`w-1 h-1 rounded-full ${client.activeTokens > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
                          <span>
                            {client.activeTokens > 0
                              ? t('mcpConnections.oauth.card.activeToken', { count: client.activeTokens })
                              : t('mcpConnections.oauth.card.noTokens')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-500">
                          <div className="w-1 h-1 rounded-full bg-neutral-700" />
                          <span>{t('mcpConnections.oauth.card.registered', { date: formatDate(client.createdAt) })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRevokeTarget({ type: 'client', clientId: client.clientId, name: client.clientName || client.clientId })}
                    className="flex-shrink-0 self-end sm:self-center p-2.5 text-neutral-500 dark:text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all hover:-rotate-12"
                    title={t('mcpConnections.oauth.card.revokeTitle')}
                  >
                    <Unplug className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title={revokeTarget?.type === 'client' ? t('mcpConnections.confirm.revokeClientTitle') : t('mcpConnections.confirm.revokeTokenTitle')}
        message={
          revokeTarget?.type === 'client'
            ? t('mcpConnections.confirm.revokeClientMessage', { name: revokeTarget.name })
            : revokeTarget
              ? t('mcpConnections.confirm.revokeTokenMessage', { name: revokeTarget.name })
              : ''
        }
        confirmText={isRevoking ? t('mcpConnections.confirm.revoking') : t('mcpConnections.confirm.revoke')}
        type="danger"
      />
    </div>
  );
}
