import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPersonalAccessToken, fetchOAuthClients, fetchPersonalAccessTokens, registerOAuthClient, revokeOAuthClient, revokePersonalAccessToken, updateOAuthClientRedirectUris, type OAuthClientRegistrationResult, type OAuthClientSummary, type PersonalAccessTokenSummary } from '../../../api';
import { Button, Icon, IconButton, Select, Text, TextField } from '../../../m3';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CopyField } from '../../ui/CopyField';
import { EmptyState, Section } from '../../ui/Page';
import { Row, RowList } from '../../ui/Rows';
import { useToast } from '../../ui/useToast';

/** Personal access tokens, OAuth clients and setup snippets for connecting AI clients to the Remix Studio MCP server. */
export function McpConnections() {
  const toast = useToast();
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
  const claudeCodeOAuthCommand = `claude mcp add --transport http remix-studio ${mcpUrl}`;
  const claudeCodeTokenCommand = `claude mcp add --transport http remix-studio ${mcpUrl} --header "Authorization: Bearer YOUR_MCP_TOKEN"`;
  const codexOAuthCommand = `codex mcp add remix-studio --url ${mcpUrl}\ncodex mcp login remix-studio`;
  const codexTokenCommand = `codex mcp add remix-studio --url ${mcpUrl} --bearer-token-env-var REMIX_STUDIO_TOKEN`;

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
  const [showCliSetup, setShowCliSetup] = useState(false);
  const [patName, setPatName] = useState('');
  const [patExpiry, setPatExpiry] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const patNameRef = useRef<HTMLInputElement>(null);

  // Manual OAuth client registration state
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [clientName, setClientName] = useState('');
  const [redirectUrisText, setRedirectUrisText] = useState('');
  const [tokenEndpointAuthMethod, setTokenEndpointAuthMethod] = useState<'client_secret_basic' | 'client_secret_post' | 'none'>('client_secret_basic');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientCredentials, setNewClientCredentials] = useState<OAuthClientRegistrationResult | null>(null);
  const [copiedClientField, setCopiedClientField] = useState<'id' | 'secret' | null>(null);
  const clientNameRef = useRef<HTMLInputElement>(null);
  const [editingClient, setEditingClient] = useState<OAuthClientSummary | null>(null);
  const [editingRedirectUrisText, setEditingRedirectUrisText] = useState('');
  const [isSavingClient, setIsSavingClient] = useState(false);

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

  useEffect(() => {
    if (showCreateClient && clientNameRef.current) {
      clientNameRef.current.focus();
    }
  }, [showCreateClient]);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      let successMessage: string;
      if (revokeTarget.type === 'client') {
        await revokeOAuthClient(revokeTarget.clientId);
        successMessage = t('mcpConnections.toasts.clientRevoked');
      } else {
        await revokePersonalAccessToken(revokeTarget.id);
        successMessage = t('mcpConnections.toasts.tokenRevoked');
      }
      await load();
      toast.success(successMessage);
      setRevokeTarget(null);
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

  const handleCreateClient = async () => {
    const redirectUris = redirectUrisText
      .split('\n')
      .map((uri) => uri.trim())
      .filter(Boolean);

    if (redirectUris.length === 0) {
      toast.error(t('mcpConnections.toasts.clientRedirectRequired'));
      return;
    }

    setIsCreatingClient(true);
    try {
      const result = await registerOAuthClient({
        clientName,
        redirectUris,
        tokenEndpointAuthMethod,
      });
      setNewClientCredentials(result);
      setClientName('');
      setRedirectUrisText('');
      setTokenEndpointAuthMethod('client_secret_basic');
      toast.success(t('mcpConnections.toasts.clientCreated'));
      await load();
    } catch {
      toast.error(t('mcpConnections.toasts.clientCreateFailed'));
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleCopyClientField = async (value: string, field: 'id' | 'secret') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedClientField(field);
      toast.success(t(field === 'id' ? 'mcpConnections.toasts.clientIdCopied' : 'mcpConnections.toasts.clientSecretCopied'));
      setTimeout(() => setCopiedClientField((current) => (current === field ? null : current)), 2000);
    } catch {
      toast.error(t('mcpConnections.toasts.copyFailed', { label: field === 'id' ? 'client id' : 'client secret' }));
    }
  };

  const handleCloseNewClient = () => {
    setShowCreateClient(false);
    setNewClientCredentials(null);
    setCopiedClientField(null);
    setClientName('');
    setRedirectUrisText('');
    setTokenEndpointAuthMethod('client_secret_basic');
  };

  const handleStartEditClient = (client: OAuthClientSummary) => {
    setEditingClient(client);
    setEditingRedirectUrisText(client.redirectUris.join('\n'));
  };

  const handleSaveClientRedirectUris = async () => {
    if (!editingClient) return;
    const redirectUris = editingRedirectUrisText
      .split('\n')
      .map((uri) => uri.trim())
      .filter(Boolean);

    if (redirectUris.length === 0) {
      toast.error(t('mcpConnections.toasts.clientRedirectRequired'));
      return;
    }

    setIsSavingClient(true);
    try {
      const updated = await updateOAuthClientRedirectUris(editingClient.clientId, redirectUris);
      setClients((current) => current.map((client) => client.clientId === updated.clientId ? updated : client));
      setEditingClient(null);
      setEditingRedirectUrisText('');
      toast.success(t('mcpConnections.toasts.clientUpdated'));
    } catch {
      toast.error(t('mcpConnections.toasts.clientUpdateFailed'));
    } finally {
      setIsSavingClient(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('mcpConnections.toasts.copied', { label }));
    } catch {
      toast.error(t('mcpConnections.toasts.copyFailed', { label: label.toLowerCase() }));
    }
  };

  const snippet = (label: string, value: string, copyLabel: string, hint?: string) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Text variant="label-large" emphasized>
          {label}
        </Text>
        <Button variant="text" size="xs" icon="content_copy" onClick={() => void copyText(value, label)}>
          {copyLabel}
        </Button>
      </div>
      <pre className="v2-code-block font-mono">{value}</pre>
      {hint && (
        <Text variant="body-small" className="text-on-surface-variant">
          {hint}
        </Text>
      )}
    </div>
  );
  const metaDot = (text: string) => <span className="v2-info-chip">{text}</span>;

  return (
    <div className="flex flex-col gap-4">
      <Section variant="card" icon="hub" title={t('mcpConnections.connectSection.title')} description={t('mcpConnections.connectSection.description')}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="v2-kv">
              <Text variant="label-large" emphasized>
                {t('mcpConnections.connectSection.oauthMethod.title')}
              </Text>
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mcpConnections.connectSection.oauthMethod.description')}
              </Text>
            </div>
            <div className="v2-kv">
              <Text variant="label-large" emphasized>
                {t('mcpConnections.connectSection.tokenMethod.title')}
              </Text>
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mcpConnections.connectSection.tokenMethod.description')}
              </Text>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <CopyField label={t('mcpConnections.connectSection.appAddress.label')} value={mcpUrl} copiedMessage={t('mcpConnections.toasts.copied', { label: 'MCP URL' })} />
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mcpConnections.connectSection.appAddress.instruction')}
              </Text>
            </div>
            <div className="flex flex-col gap-1">
              <CopyField label={t('mcpConnections.connectSection.advancedUrl.label')} value={oauthMetadataUrl} copiedMessage={t('mcpConnections.toasts.copied', { label: 'OAuth metadata URL' })} />
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mcpConnections.connectSection.advancedUrl.instruction')}
              </Text>
            </div>
          </div>
          <ol className="v2-steps">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span className="v2-steps__n">{n}</span>
                <span className="flex flex-col">
                  <Text variant="label-large" emphasized>
                    {t(`mcpConnections.connectSection.steps.${n}.title`)}
                  </Text>
                  <Text variant="body-small" className="text-on-surface-variant">
                    {t(`mcpConnections.connectSection.steps.${n}.desc`)}
                  </Text>
                </span>
              </li>
            ))}
          </ol>
          <details className="v2-disclosure" open={showJsonSetup} onToggle={(e) => setShowJsonSetup((e.target as HTMLDetailsElement).open)}>
            <summary>
              <Icon name="data_object" />
              <span className="flex flex-col">
                <Text variant="title-small" emphasized>
                  {t('mcpConnections.connectSection.jsonSetup.title')}
                </Text>
                <Text variant="body-small" className="text-on-surface-variant">
                  {t('mcpConnections.connectSection.jsonSetup.subtitle')}
                </Text>
              </span>
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mcpConnections.connectSection.jsonSetup.instruction')}
              </Text>
              <div className="grid gap-3 lg:grid-cols-2">
                {snippet(t('mcpConnections.connectSection.jsonSetup.oauthJson'), projectOAuthJson, t('mcpConnections.connectSection.jsonSetup.copyJson'), t('mcpConnections.connectSection.oauthMethod.description'))}
                {snippet(t('mcpConnections.connectSection.jsonSetup.tokenJson'), projectTokenJson, t('mcpConnections.connectSection.jsonSetup.copyJson'), t('mcpConnections.connectSection.jsonSetup.tokenInstruction'))}
              </div>
            </div>
          </details>
          <details className="v2-disclosure" open={showCliSetup} onToggle={(e) => setShowCliSetup((e.target as HTMLDetailsElement).open)}>
            <summary>
              <Icon name="terminal" />
              <span className="flex flex-col">
                <Text variant="title-small" emphasized>
                  {t('mcpConnections.connectSection.cliSetup.title')}
                </Text>
                <Text variant="body-small" className="text-on-surface-variant">
                  {t('mcpConnections.connectSection.cliSetup.subtitle')}
                </Text>
              </span>
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mcpConnections.connectSection.cliSetup.instruction')}
              </Text>
              <Text variant="title-small" emphasized>
                {t('mcpConnections.connectSection.cliSetup.claudeCode.title')}
              </Text>
              <div className="grid gap-3 lg:grid-cols-2">
                {snippet(t('mcpConnections.connectSection.cliSetup.oauthCommand'), claudeCodeOAuthCommand, t('mcpConnections.connectSection.cliSetup.copyCommand'), t('mcpConnections.connectSection.cliSetup.claudeCode.oauthHint'))}
                {snippet(t('mcpConnections.connectSection.cliSetup.tokenCommand'), claudeCodeTokenCommand, t('mcpConnections.connectSection.cliSetup.copyCommand'), t('mcpConnections.connectSection.cliSetup.claudeCode.tokenHint'))}
              </div>
              <Text variant="title-small" emphasized>
                {t('mcpConnections.connectSection.cliSetup.codex.title')}
              </Text>
              <div className="grid gap-3 lg:grid-cols-2">
                {snippet(t('mcpConnections.connectSection.cliSetup.oauthCommand'), codexOAuthCommand, t('mcpConnections.connectSection.cliSetup.copyCommand'), t('mcpConnections.connectSection.cliSetup.codex.oauthHint'))}
                {snippet(t('mcpConnections.connectSection.cliSetup.tokenCommand'), codexTokenCommand, t('mcpConnections.connectSection.cliSetup.copyCommand'), t('mcpConnections.connectSection.cliSetup.codex.tokenHint'))}
              </div>
            </div>
          </details>
        </div>
      </Section>

      {error && (
        <div className="v2-notice" data-tone="error">
          <Icon name="error" />
          <Text variant="body-medium">{error}</Text>
        </div>
      )}

      <Section
        variant="card"
        icon="key"
        title={t('mcpConnections.tokens.title')}
        description={
          <>
            {t('mcpConnections.tokens.whenToUse')} {t('mcpConnections.tokens.tip')}
          </>
        }
        actions={
          <Button
            variant="tonal"
            size="sm"
            icon="add"
            onClick={() => {
              setShowCreatePat(true);
              setNewToken(null);
            }}
          >
            {t('mcpConnections.tokens.newToken')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {showCreatePat && (
            <div className="v2-inline-form">
              {newToken ? (
                <>
                  <div className="v2-notice" data-tone="success">
                    <Icon name="check_circle" />
                    <Text variant="body-medium">{t('mcpConnections.toasts.tokenCreated')}</Text>
                  </div>
                  <div className="v2-copy-field">
                    <code className="min-w-0 flex-1 select-all break-all font-mono">{newToken}</code>
                    <IconButton icon={copied ? 'check' : 'content_copy'} size="xs" label={t('mediaShare.common.copy', 'Copy')} onClick={handleCopy} />
                  </div>
                  <Button variant="filled" className="self-end" onClick={handleCloseNewToken}>
                    {t('mcpConnections.tokens.form.done')}
                  </Button>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                    <TextField
                      ref={patNameRef}
                      variant="outlined"
                      label={t('mcpConnections.tokens.form.tokenName')}
                      placeholder={t('mcpConnections.tokens.form.placeholder')}
                      value={patName}
                      onValueChange={setPatName}
                      maxLength={128}
                      fullWidth
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && patName.trim()) void handleCreatePat();
                      }}
                    />
                    <Select variant="outlined" label={t('mcpConnections.tokens.form.expiration')} value={String(patExpiry)} onChange={(v) => setPatExpiry(Number(v))} options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} fullWidth />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="text"
                      onClick={() => {
                        setShowCreatePat(false);
                        setPatName('');
                        setPatExpiry(0);
                      }}
                    >
                      {t('mcpConnections.tokens.form.cancel')}
                    </Button>
                    <Button variant="filled" loading={isCreating} disabled={!patName.trim()} onClick={() => void handleCreatePat()}>
                      {t('mcpConnections.tokens.form.create')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          {isLoading ? (
            [1, 2].map((i) => <div key={i} className="v2-skeleton" style={{ height: 56 }} />)
          ) : tokens.length === 0 ? (
            <EmptyState icon="key" size="inline" title={t('mcpConnections.tokens.empty.title')} description={t('mcpConnections.tokens.empty.desc')} />
          ) : (
            <RowList>
              {tokens.map((token) => (
                <Row
                  key={token.id}
                  lead={<Icon name="key" className="text-primary" />}
                  title={token.name}
                  meta={
                    <>
                      <code className="font-mono">{token.tokenPrefix}...</code>
                      {metaDot(t('mcpConnections.tokens.card.created', { date: formatDate(token.createdAt) }))}
                      {token.lastUsedAt && metaDot(t('mcpConnections.tokens.card.used', { date: formatRelative(token.lastUsedAt) }))}
                      {token.expiresAt ? metaDot(token.expired ? t('mcpConnections.tokens.card.expired') : t('mcpConnections.tokens.card.expires', { date: formatDate(token.expiresAt) })) : metaDot(t('mcpConnections.tokens.card.noExpiration'))}
                    </>
                  }
                  actions={<IconButton icon="delete" size="xs" className="v2-button-danger" label={t('mcpConnections.tokens.card.revokeTitle')} tooltip onClick={() => setRevokeTarget({ type: 'token', id: token.id, name: token.name })} />}
                />
              ))}
            </RowList>
          )}
        </div>
      </Section>

      <Section
        variant="card"
        icon="shield"
        title={t('mcpConnections.oauth.title')}
        description={
          <>
            {t('mcpConnections.oauth.recommended')} {t('mcpConnections.oauth.tip')}
          </>
        }
        actions={
          <Button
            variant="tonal"
            size="sm"
            icon="add"
            onClick={() => {
              setShowCreateClient(true);
              setNewClientCredentials(null);
            }}
          >
            {t('mcpConnections.oauth.newClient')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {editingClient && (
            <div className="v2-inline-form">
              <Text variant="title-small" emphasized>
                {t('mcpConnections.oauth.edit.title', { name: editingClient.clientName || editingClient.clientId })}
              </Text>
              <Text variant="body-small" className="text-on-surface-variant">
                {t('mcpConnections.oauth.edit.description')}
              </Text>
              <TextField variant="outlined" multiline rows={4} label={t('mcpConnections.oauth.form.redirectUris')} placeholder={t('mcpConnections.oauth.form.redirectUrisPlaceholder')} supportingText={t('mcpConnections.oauth.form.redirectUrisHint')} value={editingRedirectUrisText} onValueChange={setEditingRedirectUrisText} fullWidth />
              <div className="flex justify-end gap-2">
                <Button
                  variant="text"
                  onClick={() => {
                    setEditingClient(null);
                    setEditingRedirectUrisText('');
                  }}
                >
                  {t('mcpConnections.tokens.form.cancel')}
                </Button>
                <Button variant="filled" loading={isSavingClient} onClick={() => void handleSaveClientRedirectUris()}>
                  {t('mcpConnections.oauth.edit.save')}
                </Button>
              </div>
            </div>
          )}
          {showCreateClient && (
            <div className="v2-inline-form">
              {newClientCredentials ? (
                <>
                  <div className="v2-notice" data-tone="success">
                    <Icon name="check_circle" />
                    <div className="flex flex-col">
                      <Text variant="label-large">{t('mcpConnections.oauth.form.created')}</Text>
                      <Text variant="body-small">{t('mcpConnections.oauth.form.createdHint')}</Text>
                    </div>
                  </div>
                  <CopyField label={t('mcpConnections.oauth.form.clientId')} value={newClientCredentials.client_id} copiedMessage={t('mcpConnections.toasts.clientIdCopied')} />
                  {newClientCredentials.client_secret && <CopyField label={t('mcpConnections.oauth.form.clientSecret')} value={newClientCredentials.client_secret} copiedMessage={t('mcpConnections.toasts.clientSecretCopied')} />}
                  <div className="flex flex-wrap gap-2">
                    {metaDot(`${t('mcpConnections.oauth.form.authMethod')}: ${newClientCredentials.token_endpoint_auth_method}`)}
                    {metaDot(`${t('mcpConnections.oauth.form.scope')}: ${newClientCredentials.scope}`)}
                    {metaDot(`${t('mcpConnections.oauth.form.redirectUris')}: ${newClientCredentials.redirect_uris.length}`)}
                  </div>
                  <Button variant="filled" className="self-end" onClick={handleCloseNewClient}>
                    {t('mcpConnections.tokens.form.done')}
                  </Button>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                    <TextField ref={clientNameRef} variant="outlined" label={t('mcpConnections.oauth.form.clientName')} placeholder={t('mcpConnections.oauth.form.clientNamePlaceholder')} value={clientName} onValueChange={setClientName} maxLength={128} fullWidth />
                    <Select<'client_secret_basic' | 'client_secret_post' | 'none'>
                      variant="outlined"
                      label={t('mcpConnections.oauth.form.authMethod')}
                      value={tokenEndpointAuthMethod}
                      onChange={setTokenEndpointAuthMethod}
                      options={(['client_secret_basic', 'client_secret_post', 'none'] as const).map((v) => ({ value: v, label: v }))}
                      fullWidth
                    />
                  </div>
                  <TextField variant="outlined" multiline rows={4} label={t('mcpConnections.oauth.form.redirectUris')} placeholder={t('mcpConnections.oauth.form.redirectUrisPlaceholder')} supportingText={t('mcpConnections.oauth.form.redirectUrisHint')} value={redirectUrisText} onValueChange={setRedirectUrisText} fullWidth />
                  <div className="flex justify-end gap-2">
                    <Button variant="text" onClick={handleCloseNewClient}>
                      {t('mcpConnections.tokens.form.cancel')}
                    </Button>
                    <Button variant="filled" loading={isCreatingClient} onClick={() => void handleCreateClient()}>
                      {t('mcpConnections.oauth.form.create')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          {isLoading ? (
            [1, 2].map((i) => <div key={i} className="v2-skeleton" style={{ height: 56 }} />)
          ) : clients.length === 0 ? (
            <EmptyState icon="shield" size="inline" title={t('mcpConnections.oauth.empty.title')} description={t('mcpConnections.oauth.empty.desc')} />
          ) : (
            <RowList>
              {clients.map((client) => (
                <Row
                  key={client.id}
                  lead={<Icon name="shield" className="text-primary" />}
                  title={client.clientName || client.clientId}
                  meta={
                    <>
                      {client.clientName && <code className="font-mono">{client.clientId.slice(0, 12)}...</code>}
                      {client.isOwned && metaDot(t('mcpConnections.oauth.card.manualClient'))}
                      {metaDot(client.activeTokens > 0 ? t('mcpConnections.oauth.card.activeToken', { count: client.activeTokens }) : t('mcpConnections.oauth.card.noTokens'))}
                      {metaDot(t('mcpConnections.oauth.card.registered', { date: formatDate(client.createdAt) }))}
                    </>
                  }
                  actions={
                    <>
                      {client.isOwned && <IconButton icon="edit" size="xs" label={t('mcpConnections.oauth.card.editTitle')} tooltip onClick={() => handleStartEditClient(client)} />}
                      <IconButton icon="link_off" size="xs" className="v2-button-danger" label={t('mcpConnections.oauth.card.revokeTitle')} tooltip onClick={() => setRevokeTarget({ type: 'client', clientId: client.clientId, name: client.clientName || client.clientId })} />
                    </>
                  }
                />
              ))}
            </RowList>
          )}
        </div>
      </Section>

      <ConfirmDialog
        open={!!revokeTarget}
        tone="danger"
        title={revokeTarget?.type === 'client' ? t('mcpConnections.confirm.revokeClientTitle') : t('mcpConnections.confirm.revokeTokenTitle')}
        message={revokeTarget?.type === 'client' ? t('mcpConnections.confirm.revokeClientMessage', { name: revokeTarget.name }) : revokeTarget ? t('mcpConnections.confirm.revokeTokenMessage', { name: revokeTarget.name }) : ''}
        confirmLabel={isRevoking ? t('mcpConnections.confirm.revoking') : t('mcpConnections.confirm.revoke')}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
      />
    </div>
  );
}
