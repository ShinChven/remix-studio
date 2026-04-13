import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Copy, Key, Loader2, Plus, Shield, Trash2, Unplug } from 'lucide-react';
import { fetchOAuthClients, fetchPersonalAccessTokens, revokeOAuthClient, revokePersonalAccessToken, createPersonalAccessToken, type OAuthClientSummary, type PersonalAccessTokenSummary } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from 'sonner';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return formatDate(ts);
}

const EXPIRY_OPTIONS = [
  { label: 'No expiration', value: 0 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];

export function McpConnections() {
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
      setError('Failed to load MCP connections.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        toast.success('Client access revoked');
      } else {
        await revokePersonalAccessToken(revokeTarget.id);
        toast.success('Token revoked');
      }
      setRevokeTarget(null);
      await load();
    } catch {
      toast.error('Failed to revoke');
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
      toast.error('Failed to create token');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    toast.success('Token copied to clipboard');
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
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto bg-neutral-950/20">
      <div className="w-full space-y-8 md:space-y-12">
        <header>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 font-display">MCP Connections</h2>
          <p className="text-sm md:text-base text-neutral-400 max-w-2xl leading-relaxed">
            Connect AI apps securely through MCP protocol
          </p>
        </header>

        <section className="rounded-2xl border border-neutral-800/70 bg-neutral-900/20 backdrop-blur-md overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-amber-500/5 opacity-50" />
          <div className="relative p-5 md:p-8 flex flex-col md:flex-row items-start gap-4 md:gap-6">
            <div className="flex-shrink-0 rounded-2xl bg-sky-500/10 p-3 text-sky-400 border border-sky-500/20 shadow-lg shadow-sky-500/5">
              <AlertCircle className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <div className="flex-1 space-y-6 md:space-y-8">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Connect an AI app to your account</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400 max-w-3xl">
                  This page helps you connect AI apps to your workspace. Start by copying the app address below into the app you want to connect. Then choose one of the two supported sign-in methods.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 md:p-5 transition-transform hover:scale-[1.01] duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <p className="text-sm font-bold text-blue-300">OAuth 2.1 connector</p>
                  </div>
                  <p className="text-sm leading-relaxed text-neutral-400">
                    Use this when the app can open a browser for sign-in. You sign in, approve access, and the app connects automatically. This is the best option for most users.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 md:p-5 transition-transform hover:scale-[1.01] duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <p className="text-sm font-bold text-amber-300">Access token</p>
                  </div>
                  <p className="text-sm leading-relaxed text-neutral-400">
                    Use this only when the app asks you to paste a token, API key, or secret. You create the token here and paste it into the app yourself.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/60 p-4 md:p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">App address</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-xl bg-neutral-900/80 px-4 py-3 text-xs md:text-sm text-sky-300 font-mono border border-neutral-800">{mcpUrl}</code>
                    <button
                      onClick={() => copyText(mcpUrl, 'MCP URL')}
                      className="flex-shrink-0 rounded-xl bg-neutral-800 p-3 text-neutral-300 transition-all hover:bg-neutral-700 active:scale-95 border border-neutral-700 shadow-sm"
                      title="Copy MCP URL"
                    >
                      <Copy className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-neutral-500 italic">
                    Copy this into the AI app when it asks where to connect.
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/60 p-4 md:p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Advanced sign-in URL</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-xl bg-neutral-900/80 px-4 py-3 text-xs md:text-sm text-blue-300 font-mono border border-neutral-800">{oauthMetadataUrl}</code>
                    <button
                      onClick={() => copyText(oauthMetadataUrl, 'OAuth metadata URL')}
                      className="flex-shrink-0 rounded-xl bg-neutral-800 p-3 text-neutral-300 transition-all hover:bg-neutral-700 active:scale-95 border border-neutral-700 shadow-sm"
                      title="Copy OAuth metadata URL"
                    >
                      <Copy className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-neutral-500 italic">
                    Only use this if the app specifically asks for a sign-in or discovery URL.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { title: '1. Copy Address', desc: 'Paste it into the AI app to start setup.' },
                  { title: '2. Choose Method', desc: 'Use OAuth if it opens a browser, otherwise use a token.' },
                  { title: '3. Manage Here', desc: 'View connections or revoke access anytime.' }
                ].map((step, i) => (
                  <div key={i} className="rounded-2xl border border-neutral-800/70 bg-neutral-950/40 p-4 relative overflow-hidden group/step">
                    <div className="absolute -right-2 -bottom-2 text-6xl font-display font-black text-neutral-800/10 select-none group-hover/step:text-sky-500/5 transition-colors">{i + 1}</div>
                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1 relative z-10">{step.title}</p>
                    <p className="text-sm text-neutral-500 relative z-10 leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/50 overflow-hidden">
                <button
                  onClick={() => setShowJsonSetup(!showJsonSetup)}
                  className="w-full flex items-center justify-between p-4 md:p-5 text-left transition-colors hover:bg-neutral-900/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${showJsonSetup ? 'bg-sky-500/20 text-sky-400' : 'bg-neutral-800 text-neutral-500'} transition-colors`}>
                      <Plus className={`h-4 w-4 transition-transform duration-300 ${showJsonSetup ? 'rotate-45' : ''}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white tracking-tight">Need to use a JSON configuration?</h4>
                      <p className="text-xs text-neutral-500 mt-0.5">Click to show or hide JSON setup blocks</p>
                    </div>
                  </div>
                  {showJsonSetup ? <ChevronUp className="h-5 w-5 text-neutral-600" /> : <ChevronDown className="h-5 w-5 text-neutral-600" />}
                </button>

                {showJsonSetup && (
                  <div className="p-4 md:p-6 pt-0 space-y-6 animate-in slide-in-from-top-4 duration-300">
                    <div className="h-px bg-neutral-800 mb-6" />
                    <p className="text-sm leading-relaxed text-neutral-400 italic mb-4">
                      Some apps ask you to paste a JSON setup block instead of filling out a form. Use the OAuth 2.1 version when the app supports browser sign-in. Use the access token version when the app asks for a token.
                    </p>
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">OAuth 2.1 JSON</p>
                          <button
                            onClick={() => copyText(projectOAuthJson, 'OAuth JSON')}
                            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-300 transition-all hover:bg-neutral-700 hover:text-white active:scale-95 border border-neutral-700"
                          >
                            Copy JSON
                          </button>
                        </div>
                        <div className="relative group/code">
                          <pre className="overflow-x-auto rounded-xl bg-neutral-950 p-4 text-[11px] md:text-xs text-sky-300 border border-neutral-800 font-mono leading-relaxed shadow-inner">
                            <code>{projectOAuthJson}</code>
                          </pre>
                        </div>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                          Use this when the app can open a browser and let you sign in.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Access token JSON</p>
                          <button
                            onClick={() => copyText(projectTokenJson, 'Bearer token JSON')}
                            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-300 transition-all hover:bg-neutral-700 hover:text-white active:scale-95 border border-neutral-700"
                          >
                            Copy JSON
                          </button>
                        </div>
                        <div className="relative group/code">
                          <pre className="overflow-x-auto rounded-xl bg-neutral-950 p-4 text-[11px] md:text-xs text-amber-300 border border-neutral-800 font-mono leading-relaxed shadow-inner">
                            <code>{projectTokenJson}</code>
                          </pre>
                        </div>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                          Replace <code className="text-amber-400">YOUR_MCP_TOKEN</code> with a token from this page, then paste the finished JSON into the app.
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
              <h3 className="text-xl font-bold text-white tracking-tight">Access Tokens</h3>
            </div>
            <button
              onClick={() => { setShowCreatePat(true); setNewToken(null); }}
              className="text-xs md:text-sm bg-amber-600 text-white hover:bg-amber-500 px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 font-bold shadow-lg shadow-amber-600/10 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Token</span>
            </button>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 relative overflow-hidden group/tip">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover/tip:opacity-20 transition-opacity">
              <Shield className="w-12 h-12 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-amber-300 mb-1">When to use Access Tokens</p>
            <p className="text-sm leading-relaxed text-neutral-400 max-w-2xl">
              Use an access token only if the app does not support the OAuth 2.1 connector. Keep tokens private, like a password. In most cases, you will paste the app address and this token into the app.
            </p>
          </div>

          {/* Create PAT form */}
          {showCreatePat && (
            <div className="p-5 md:p-6 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl space-y-5 animate-in zoom-in-95 duration-200">
              {newToken ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5 text-emerald-400 text-sm font-bold bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl">
                    <CheckCircle className="w-4 h-4" />
                    Token created — copy it now. You won't see it again.
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 bg-neutral-950 text-amber-400 px-4 py-3 rounded-xl text-xs md:text-sm font-mono break-all select-all border border-neutral-800 shadow-inner">
                      {newToken}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="flex-shrink-0 p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all active:scale-95 border border-neutral-700 shadow-sm"
                      title="Copy token"
                    >
                      {copied ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-neutral-300" />}
                    </button>
                  </div>
                  <button
                    onClick={handleCloseNewToken}
                    className="text-sm font-bold text-neutral-400 hover:text-white transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Token Name</label>
                      <input
                        ref={patNameRef}
                        type="text"
                        value={patName}
                        onChange={(e) => setPatName(e.target.value)}
                        placeholder="e.g. Claude Desktop"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-medium"
                        maxLength={128}
                        onKeyDown={(e) => { if (e.key === 'Enter' && patName.trim()) handleCreatePat(); }}
                      />
                    </div>
                    <div className="w-full sm:w-48 space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Expiration</label>
                      <select
                        value={patExpiry}
                        onChange={(e) => setPatExpiry(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-medium appearance-none cursor-pointer"
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
                      className="flex-1 sm:flex-none text-sm bg-amber-600 text-white hover:bg-amber-500 px-6 py-2.5 rounded-xl transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-600/10 active:scale-95"
                    >
                      {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create Token
                    </button>
                    <button
                      onClick={() => { setShowCreatePat(false); setPatName(''); setPatExpiry(0); }}
                      className="flex-1 sm:flex-none text-sm font-bold text-neutral-400 hover:text-white px-6 py-2.5 rounded-xl transition-colors bg-neutral-900 border border-neutral-800"
                    >
                      Cancel
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
                <div key={i} className="h-24 rounded-2xl bg-neutral-900/40 border border-neutral-800/60 animate-pulse" />
              ))
            ) : tokens.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-neutral-800/50 rounded-[2.5rem] text-center text-neutral-500 flex flex-col items-center justify-center gap-4 bg-neutral-900/10 backdrop-blur-sm">
                <div className="p-4 rounded-full bg-neutral-900 border border-neutral-800">
                  <Key className="w-8 h-8 text-neutral-700" />
                </div>
                <div>
                  <p className="text-lg font-bold text-neutral-400 tracking-tight">No access tokens</p>
                  <p className="text-sm max-w-xs mx-auto text-neutral-500 mt-1">Create a token to connect your first AI app manually.</p>
                </div>
              </div>
            ) : (
              tokens.map((token) => (
                <div
                  key={token.id}
                  className="w-full bg-neutral-900/20 backdrop-blur-md border border-neutral-800/60 hover:border-amber-500/30 hover:bg-neutral-900/40 p-4 md:p-5 rounded-2xl transition-all group/card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="flex-shrink-0 p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 group-hover/card:scale-110 transition-transform">
                      <Key className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden space-y-1">
                      <h4 className="font-bold text-white text-base truncate tracking-tight">{token.name}</h4>
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3">
                        <code className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">{token.tokenPrefix}...</code>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-500">
                          <div className="w-1 h-1 rounded-full bg-neutral-700" />
                          <span>Created {formatDate(token.createdAt)}</span>
                        </div>
                        {token.lastUsedAt && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400">
                            <div className="w-1 h-1 rounded-full bg-sky-400" />
                            <span>Used {formatRelative(token.lastUsedAt)}</span>
                          </div>
                        )}
                        {token.expiresAt && (
                          <div className={`flex items-center gap-1.5 text-[10px] font-bold ${token.expired ? 'text-red-400' : 'text-neutral-500'}`}>
                            <div className={`w-1 h-1 rounded-full ${token.expired ? 'bg-red-400' : 'bg-neutral-600'}`} />
                            <span>{token.expired ? 'Expired' : `Expires ${formatDate(token.expiresAt)}`}</span>
                          </div>
                        )}
                        {!token.expiresAt && (
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-600">
                            <div className="w-1 h-1 rounded-full bg-neutral-700" />
                            <span>No expiration</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRevokeTarget({ type: 'token', id: token.id, name: token.name })}
                    className="flex-shrink-0 self-end sm:self-center p-2.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all hover:rotate-12"
                    title="Revoke token"
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
              <h3 className="text-xl font-bold text-white tracking-tight">OAuth 2.1 Connections</h3>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 relative overflow-hidden group/tip">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover/tip:opacity-20 transition-opacity">
              <CheckCircle className="w-12 h-12 text-blue-500" />
            </div>
            <p className="text-sm font-bold text-blue-300 mb-1">Recommended for simple sign-in</p>
            <p className="text-sm leading-relaxed text-neutral-400 max-w-2xl">
              Apps that you connect with the OAuth 2.1 connector will appear here automatically. After you approve access in the browser, the app will show up here.
            </p>
          </div>

          <div className="grid gap-4">
            {isLoading ? (
              [1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-neutral-900/40 border border-neutral-800/60 animate-pulse" />
              ))
            ) : clients.length === 0 ? (
              <div className="py-16 border-2 border-dashed border-neutral-800/50 rounded-[2.5rem] text-center text-neutral-500 flex flex-col items-center justify-center gap-4 bg-neutral-900/10 backdrop-blur-sm">
                <div className="p-4 rounded-full bg-neutral-900 border border-neutral-800">
                  <Shield className="w-8 h-8 text-neutral-700" />
                </div>
                <div>
                  <p className="text-lg font-bold text-neutral-400 tracking-tight">No OAuth clients connected</p>
                  <p className="text-sm max-w-xs mx-auto text-neutral-500 mt-1">Apps will appear here after sign-in is completed in your AI app.</p>
                </div>
              </div>
            ) : (
              clients.map((client) => (
                <div
                  key={client.id}
                  className="w-full bg-neutral-900/20 backdrop-blur-md border border-neutral-800/60 hover:border-blue-500/30 hover:bg-neutral-900/40 p-4 md:p-5 rounded-2xl transition-all group/card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="flex-shrink-0 p-3 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 group-hover/card:scale-110 transition-transform">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden space-y-1">
                      <h4 className="font-bold text-white text-base truncate tracking-tight">
                        {client.clientName || client.clientId}
                      </h4>
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3">
                        {client.clientName && (
                          <code className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">{client.clientId.slice(0, 12)}...</code>
                        )}
                        <div className={`flex items-center gap-1.5 text-[10px] font-bold ${client.activeTokens > 0 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                          <div className={`w-1 h-1 rounded-full ${client.activeTokens > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
                          <span>
                            {client.activeTokens > 0
                              ? `${client.activeTokens} active token${client.activeTokens === 1 ? '' : 's'}`
                              : 'No active tokens'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-500">
                          <div className="w-1 h-1 rounded-full bg-neutral-700" />
                          <span>Registered {formatDate(client.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRevokeTarget({ type: 'client', clientId: client.clientId, name: client.clientName || client.clientId })}
                    className="flex-shrink-0 self-end sm:self-center p-2.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all hover:-rotate-12"
                    title="Revoke all tokens"
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
        title={revokeTarget?.type === 'client' ? 'Revoke Client Access' : 'Revoke Token'}
        message={
          revokeTarget?.type === 'client'
            ? `Revoke all access tokens for "${revokeTarget.name}"? The client will need to re-authenticate.`
            : revokeTarget
              ? `Revoke the token "${revokeTarget.name}"? Any MCP client using this token will lose access immediately.`
              : ''
        }
        confirmText={isRevoking ? 'Revoking...' : 'Revoke'}
        type="danger"
      />
    </div>
  );
}
