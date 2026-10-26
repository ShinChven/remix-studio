import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteProvider, fetchProviders } from '../../api';
import { IconButton, Icon } from '../../m3';
import type { Provider } from '../../types';
import { ProviderLogo } from '../components/ProviderLogo';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatusPill } from '../ui/Stat';
import { ListToolbar, MobileFab } from '../ui/Toolbar';

export function providerHasCredentials(provider: Provider) {
  return provider.type === 'KlingAI' ? provider.hasKey && provider.hasSecret : provider.hasKey;
}

export function Providers() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchProviders();
      setProviders(data.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)));
    } catch {
      setError(t('providers.errors.load'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteMessage = deleteTarget
    ? `${t('providers.deleteDialog.message', { name: deleteTarget.name })}${
        deleteTarget.usage && (deleteTarget.usage.projectCount > 0 || deleteTarget.usage.activeJobCount > 0)
          ? t('providers.deleteDialog.usageWarning', { projectCount: deleteTarget.usage.projectCount, jobCount: deleteTarget.usage.activeJobCount })
          : ''
      }`
    : '';

  return (
    <Page>
      <PageHeader size="large" title={t('providers.title')} description={t('providers.description')} />
      <ListToolbar title={t('providers.allProviders')} icon="key" count={providers.length}>
        <span className="hidden sm:inline-flex">
          <IconButton icon="add" label={t('providers.newProvider')} tooltip variant="filled" href="/provider/new" />
        </span>
      </ListToolbar>
      {error && <ErrorState message={error} />}
      {isLoading ? (
        <LoadingState />
      ) : providers.length === 0 ? (
        <EmptyState icon="key" shape="gem" title={t('providers.noProviders.title')} description={t('providers.noProviders.description')} />
      ) : (
        <RowList columns={2}>
          {providers.map((provider) => {
            const ok = providerHasCredentials(provider);
            const projectCount = provider.usage?.projectCount ?? 0;
            const activeJobCount = provider.usage?.activeJobCount ?? 0;
            return (
              <Row
                key={provider.id}
                to={`/provider/${provider.id}`}
                lead={<ProviderLogo type={provider.type} size={20} />}
                title={provider.name}
                meta={
                  <>
                    <StatusPill tone="secondary">{provider.type}</StatusPill>
                    {provider.apiUrl && (
                      <span className="inline-flex min-w-0 max-w-[200px] items-center gap-1 truncate">
                        <Icon name="public" size={14} />
                        <span className="truncate">{provider.apiUrl}</span>
                      </span>
                    )}
                    <StatusPill tone={ok ? 'success' : 'warning'} icon={ok ? 'check_circle' : 'error'}>
                      {provider.type === 'KlingAI'
                        ? ok
                          ? t('providers.providerCard.credentialsStored')
                          : t('providers.providerCard.missingCredentials')
                        : ok
                          ? t('providers.providerCard.keyStored')
                          : t('providers.providerCard.noKey')}
                    </StatusPill>
                    {projectCount > 0 && <span>{t('providers.providerCard.projects', { count: projectCount })}</span>}
                    {activeJobCount > 0 && <span>{t('providers.providerCard.activeJobs', { count: activeJobCount })}</span>}
                  </>
                }
                actions={
                  <>
                    <IconButton icon="edit" label={t('providerCustomModels.edit')} tooltip size="xs" href={`/provider/${provider.id}/edit`} />
                    <IconButton icon="delete" label={t('providerCustomModels.delete')} tooltip size="xs" className="v2-button-danger" onClick={() => setDeleteTarget(provider)} />
                    <Icon name="chevron_right" className="text-on-surface-variant m3-mirror-rtl" />
                  </>
                }
              />
            );
          })}
        </RowList>
      )}
      <MobileFab icon="add" label={t('providers.newProvider')} href="/provider/new" />
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('providers.deleteDialog.title')}
        message={deleteMessage}
        confirmLabel={t('providers.deleteDialog.confirm')}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteProvider(deleteTarget.id);
            await load();
          } catch {
            setError(t('providers.errors.delete'));
          }
        }}
      />
    </Page>
  );
}
