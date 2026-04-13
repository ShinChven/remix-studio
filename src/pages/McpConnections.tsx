import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, CheckCircle, Copy, Key, Loader2, Plus, Shield, Trash2, Unplug } from 'lucide-react';
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
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <header className="mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 font-display">MCP Connections</h2>
          <p className="text-sm md:text-base text-neutral-400">
            Connect AI apps securely through MCP protocol
          </p>
        </header>

        <section className="rounded-2xl border border-neutral-800/70 bg-neutral-900/30 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 rounded-lg bg-sky-500/10 p-2 text-sky-400">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Connect an AI app to your account</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  This page helps you connect AI apps to your workspace. Start by copying the app address below into the app you want to connect. Then choose one of the two supported sign-in methods.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <p className="text-sm font-medium text-blue-300">OAuth 2.1 connector</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    Use this when the app can open a browser for sign-in. You sign in, approve access, and the app connects automatically. This is the best option for most users.
                  </p>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-amber-300">Access token</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    Use this only when the app asks you to paste a token, API key, or secret. You create the token here and paste it into the app yourself.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">App address</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-neutral-900 px-3 py-2 text-xs text-sky-300">{mcpUrl}</code>
                    <button
                      onClick={() => copyText(mcpUrl, 'MCP URL')}
                      className="flex-shrink-0 rounded-lg bg-neutral-800 p-2 text-neutral-300 transition-colors hover:bg-neutral-700"
                      title="Copy MCP URL"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    Copy this into the AI app when it asks where to connect.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Advanced sign-in URL</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-neutral-900 px-3 py-2 text-xs text-blue-300">{oauthMetadataUrl}</code>
                    <button
                      onClick={() => copyText(oauthMetadataUrl, 'OAuth metadata URL')}
                      className="flex-shrink-0 rounded-lg bg-neutral-800 p-2 text-neutral-300 transition-colors hover:bg-neutral-700"
                      title="Copy OAuth metadata URL"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    Only use this if the app specifically asks for a sign-in or discovery URL.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">1. Copy the app address</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Paste it into the AI app to start setup.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">2. Choose the right sign-in method</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    If the app opens a browser, use the OAuth 2.1 connector. If it asks for a token instead, use an access token.
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">3. Come back here anytime</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    You can see connected apps, create new tokens, or remove access later.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">If the app asks for JSON setup</h4>
                  <p className="mt-1 text-sm text-neutral-400">
                    Some apps ask you to paste a JSON setup block instead of filling out a form. Use the OAuth 2.1 version when the app supports browser sign-in. Use the access token version when the app asks for a token.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">OAuth 2.1 JSON</p>
                      <button
                        onClick={() => copyText(projectOAuthJson, 'OAuth JSON')}
                        className="flex-shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl bg-neutral-900 p-3 text-xs text-sky-300"><code>{projectOAuthJson}</code></pre>
                    <p className="text-sm text-neutral-500">
                      Use this when the app can open a browser and let you sign in.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Access token JSON</p>
                      <button
                        onClick={() => copyText(projectTokenJson, 'Bearer token JSON')}
                        className="flex-shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl bg-neutral-900 p-3 text-xs text-amber-300"><code>{projectTokenJson}</code></pre>
                    <p className="text-sm text-neutral-500">
                      Replace <code>YOUR_MCP_TOKEN</code> with a token from this page, then paste the finished JSON into the app.
                    </p>
                  </div>
                </div>
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
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" />
              Access Tokens
            </h3>
            <button
              onClick={() => { setShowCreatePat(true); setNewToken(null); }}
              className="text-xs md:text-sm bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-amber-600/30 font-medium"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Token</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>

          <p className="text-sm text-neutral-500 mb-4">
            Use an access token only if the app does not support the OAuth 2.1 connector. Keep tokens private, like a password.
          </p>

          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-amber-300">Best for manual setup</p>
            <p className="mt-1 text-sm text-neutral-400">
              Use this if the app asks for a token, API key, or secret. In most cases you will paste in two things: the app address above and the token you create here. If the app supports browser sign-in, use the OAuth 2.1 connector instead.
            </p>
          </div>

          {/* Create PAT form */}
          {showCreatePat && (
            <div className="mb-4 p-4 bg-neutral-900/60 border border-neutral-800/60 rounded-xl space-y-4">
              {newToken ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Token created — copy it now. You won't see it again.
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-neutral-800 text-amber-300 px-3 py-2 rounded-lg text-sm font-mono break-all select-all">
                      {newToken}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="flex-shrink-0 p-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
                      title="Copy token"
                    >
                      {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-neutral-300" />}
                    </button>
                  </div>
                  <button
                    onClick={handleCloseNewToken}
                    className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      ref={patNameRef}
                      type="text"
                      value={patName}
                      onChange={(e) => setPatName(e.target.value)}
                      placeholder="Token name (e.g. Claude Desktop)"
                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
                      maxLength={128}
                      onKeyDown={(e) => { if (e.key === 'Enter' && patName.trim()) handleCreatePat(); }}
                    />
                    <select
                      value={patExpiry}
                      onChange={(e) => setPatExpiry(Number(e.target.value))}
                      className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    >
                      {EXPIRY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreatePat}
                      disabled={!patName.trim() || isCreating}
                      className="text-sm bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 px-4 py-2 rounded-lg transition-all border border-amber-600/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCreating && <Loader2 className="w-3 h-3 animate-spin" />}
                      Create Token
                    </button>
                    <button
                      onClick={() => { setShowCreatePat(false); setPatName(''); setPatExpiry(0); }}
                      className="text-sm text-neutral-400 hover:text-neutral-200 px-4 py-2 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Token list */}
          <div className="space-y-3">
            {isLoading ? (
              [1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-neutral-900/40 border border-neutral-800/60 animate-pulse" />
              ))
            ) : tokens.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center justify-center gap-3 bg-neutral-900/20">
                <Key className="w-10 h-10 text-neutral-700" />
                <div>
                  <p className="text-base font-medium text-neutral-400">No access tokens</p>
                  <p className="text-sm">Create a token to connect an app manually.</p>
                </div>
              </div>
            ) : (
              tokens.map((token) => (
                <div
                  key={token.id}
                  className="w-full bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/60 hover:border-amber-500/30 hover:bg-neutral-900/60 p-3 md:p-4 rounded-xl transition-all group flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                    <div className="flex-shrink-0 p-2 md:p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
                      <Key className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="font-semibold text-white text-sm md:text-base truncate">{token.name}</h4>
                      <div className="flex items-center gap-2 md:gap-3 mt-0.5 flex-wrap">
                        <code className="text-[10px] font-mono text-neutral-500">{token.tokenPrefix}...</code>
                        {token.lastUsedAt && (
                          <span className="text-[10px] text-neutral-500">
                            Used {formatRelative(token.lastUsedAt)}
                          </span>
                        )}
                        {token.expiresAt && (
                          <span className={`text-[10px] font-medium ${token.expired ? 'text-red-400' : 'text-neutral-500'}`}>
                            {token.expired ? 'Expired' : `Expires ${formatDate(token.expiresAt)}`}
                          </span>
                        )}
                        {!token.expiresAt && (
                          <span className="text-[10px] text-neutral-500">No expiration</span>
                        )}
                        <span className="text-[10px] text-neutral-600">Created {formatDate(token.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRevokeTarget({ type: 'token', id: token.id, name: token.name })}
                    className="flex-shrink-0 p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Revoke token"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ─── OAuth Clients ─── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              OAuth 2.1 Connections
            </h3>
          </div>

          <p className="text-sm text-neutral-500 mb-4">
            Apps that you connect with the OAuth 2.1 connector will appear here automatically.
          </p>

          <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm font-medium text-blue-300">Best for simple sign-in</p>
            <p className="mt-1 text-sm text-neutral-400">
              Use this when the app lets you sign in in a browser. After you approve access, the app will show up here automatically. This is the recommended option when the app supports it.
            </p>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              [1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-neutral-900/40 border border-neutral-800/60 animate-pulse" />
              ))
            ) : clients.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center justify-center gap-3 bg-neutral-900/20">
                <Shield className="w-10 h-10 text-neutral-700" />
                <div>
                  <p className="text-base font-medium text-neutral-400">No OAuth clients connected</p>
                  <p className="text-sm">Apps will appear here after sign-in is completed.</p>
                </div>
              </div>
            ) : (
              clients.map((client) => (
                <div
                  key={client.id}
                  className="w-full bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/60 hover:border-blue-500/30 hover:bg-neutral-900/60 p-3 md:p-4 rounded-xl transition-all group flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                    <div className="flex-shrink-0 p-2 md:p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="font-semibold text-white text-sm md:text-base truncate">
                        {client.clientName || client.clientId}
                      </h4>
                      <div className="flex items-center gap-2 md:gap-3 mt-0.5 flex-wrap">
                        {client.clientName && (
                          <code className="text-[10px] font-mono text-neutral-500">{client.clientId.slice(0, 12)}...</code>
                        )}
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${client.activeTokens > 0 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                          {client.activeTokens > 0
                            ? <><CheckCircle className="w-3 h-3" /> {client.activeTokens} active token{client.activeTokens === 1 ? '' : 's'}</>
                            : 'No active tokens'}
                        </span>
                        <span className="text-[10px] text-neutral-600">Registered {formatDate(client.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRevokeTarget({ type: 'client', clientId: client.clientId, name: client.clientName || client.clientId })}
                    className="flex-shrink-0 p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1"
                    title="Revoke all tokens"
                  >
                    <Unplug className="w-4 h-4" />
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
