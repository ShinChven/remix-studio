import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { disconnectDrive, disconnectStore, fetchReleaseConnections, type ReleaseConnection, type ReleaseProvider } from '../../api';
import { applyAvatarFallback, defaultAvatar } from '../../lib/avatar';
import { Button, Icon, Text, useSnackbar } from '../../m3';
import { platformMeta } from '../components/exports/releaseMeta';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatusPill } from '../ui/Stat';

export function Releases() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState<ReleaseConnection[]>([]);
  const [providers, setProviders] = useState<ReleaseProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseConnection | null>(null);

  const providerLabel = useMemo(() => {
    const byId = new Map(providers.map((p) => [p.id, p.label]));
    return (id: string) => byId.get(id) ?? id;
  }, [providers]);
  const displayName = (c: ReleaseConnection) => c.displayName || c.email || c.accountId || providerLabel(c.platform);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchReleaseConnections();
      setConnections(data.connections);
      setProviders(data.providers);
    } catch (error) {
      snackbar.show((error as Error)?.message || t('releases.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // OAuth callbacks report back through URL parameters.
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (!success && !error) return;
    const next = new URLSearchParams(searchParams);
    if (success) {
      snackbar.show(t('releases.connectSuccess'));
      next.delete('success');
      void load();
    } else if (error) {
      snackbar.show(decodeURIComponent(error.replace(/\+/g, ' ')));
      next.delete('error');
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, t]);

  const disconnect = async (c: ReleaseConnection) => {
    try {
      setDisconnectingId(c.id);
      if (c.kind === 'drive') await disconnectDrive(c.id);
      else await disconnectStore(c.platform, c.id);
      setConnections((prev) => prev.filter((item) => item.id !== c.id));
      snackbar.show(t('releases.disconnectSuccess'));
    } catch (error) {
      snackbar.show((error as Error)?.message || t('releases.disconnectError'));
    } finally {
      setDisconnectingId(null);
    }
  };

  const connectHref = (p: ReleaseProvider) => (p.kind === 'store' ? `/api/stores/${p.id}/connect` : `/api/releases/drives/${p.id}/connect`);
  const stores = connections.filter((c) => c.kind === 'store');
  const drives = connections.filter((c) => c.kind === 'drive');

  const connectionRows = (rows: ReleaseConnection[], empty: string) =>
    rows.length === 0 ? (
      <Text variant="body-medium" className="py-6 text-center text-on-surface-variant">
        {empty}
      </Text>
    ) : (
      <RowList>
        {rows.map((c) => {
          const meta = platformMeta(c.platform);
          const expired = c.status !== 'active';
          return (
            <Row
              key={c.id}
              lead={
                <img
                  src={c.avatarUrl || defaultAvatar(c.id, displayName(c))}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="v2-account-avatar"
                  onError={(e) => applyAvatarFallback(e.currentTarget, c.id, displayName(c))}
                />
              }
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {displayName(c)}
                  <StatusPill tone={expired ? 'warning' : 'success'} icon={expired ? 'warning' : 'check_circle'}>
                    {c.status}
                  </StatusPill>
                </span>
              }
              meta={
                <>
                  <span className="inline-flex items-center gap-1">
                    <Icon name={meta.icon} size={14} />
                    {providerLabel(c.platform)}
                  </span>
                  {c.email && <span>{c.email}</span>}
                </>
              }
              actions={
                <>
                  {c.kind === 'store' && (
                    <Button variant="text" size="xs" icon="open_in_new" href={`/api/stores/${c.platform}/connect`}>
                      {t('releases.reconnect')}
                    </Button>
                  )}
                  <Button variant="tonal" size="xs" icon="link_off" className="v2-button-danger" loading={disconnectingId === c.id} onClick={() => setDeleteTarget(c)}>
                    {t('releases.disconnect')}
                  </Button>
                </>
              }
            />
          );
        })}
      </RowList>
    );

  return (
    <Page width="default">
      <PageHeader title={t('releases.title')} description={t('releases.description')} backLink={{ to: '/exports', label: t('releases.backToExports') }} />
      <div className="flex flex-col gap-6">
        {loading ? (
          <LoadingState />
        ) : connections.length === 0 ? (
          <EmptyState icon="rocket_launch" shape="sunny" title={t('releases.empty.title')} description={t('releases.empty.description')} />
        ) : (
          <>
            <Section variant="card" icon={<Icon name="add_to_drive" />} title={t('releases.drives.title')} description={t('releases.drives.description')}>
              {connectionRows(drives, t('releases.drives.empty'))}
            </Section>
            <Section variant="card" icon={<Icon name="storefront" />} title={t('releases.storefronts.title')} description={t('releases.storefronts.description')}>
              {connectionRows(stores, t('releases.storefronts.empty'))}
            </Section>
          </>
        )}

        <Section variant="card" title={t('releases.availableTitle')} description={t('releases.availableDescription')}>
          <RowList>
            {providers.map((p) => {
              const meta = platformMeta(p.id);
              const count = connections.filter((c) => c.platform === p.id).length;
              return (
                <Row
                  key={`${p.kind}-${p.id}`}
                  lead={<Icon name={meta.icon} />}
                  title={p.label}
                  meta={
                    <span>
                      {t(`releases.providerHint.${p.id}`)}
                      {count > 0 ? ` · ${t('releases.connectedCount', { count })}` : ''}
                    </span>
                  }
                  actions={
                    p.configured ? (
                      <Button variant="tonal" size="xs" icon="add" href={connectHref(p)}>
                        {count > 0 ? t('releases.addAnother') : t('releases.connect')}
                      </Button>
                    ) : (
                      <StatusPill icon="lock" title={t('releases.notConfiguredHint')}>
                        {t('releases.notConfigured')}
                      </StatusPill>
                    )
                  }
                />
              );
            })}
          </RowList>
        </Section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('releases.confirmDisconnectTitle')}
        message={t('releases.confirmDisconnectMessage', { name: deleteTarget ? displayName(deleteTarget) : '' })}
        confirmLabel={t('releases.disconnect')}
        cancelLabel={t('releases.cancel')}
        onConfirm={() => (deleteTarget ? disconnect(deleteTarget) : undefined)}
        onClose={() => setDeleteTarget(null)}
      />
    </Page>
  );
}
