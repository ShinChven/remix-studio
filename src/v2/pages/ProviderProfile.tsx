import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { fetchProvider, fetchProviderModels, type ProviderModelInfo } from '../../api';
import { Button, DataTable, Icon, Text } from '../../m3';
import type { Provider } from '../../types';
import { ProviderLogo } from '../components/ProviderLogo';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { StatTile, StatusPill } from '../ui/Stat';
import { providerHasCredentials } from './Providers';

/** Providers whose model list is built in rather than fetched with credentials. */
const STATIC_MODELS = new Set(['RunningHub', 'KlingAI', 'BytePlus', 'Replicate', 'BlackForestLabs']);
const CATEGORY_ORDER = ['text', 'image', 'video', 'audio'];
const CATEGORY_ICON: Record<string, string> = { text: 'chat', image: 'image', video: 'movie', audio: 'music_note' };

export function ProviderProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
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
      setProvider(await fetchProvider(id));
    } catch {
      setError(t('providerProfile.errorLoad'));
    } finally {
      setIsLoadingProvider(false);
    }
  }, [id, t]);

  const loadModels = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoadingModels(true);
      setModelsError(null);
      const result = await fetchProviderModels(id);
      setModels(result.models);
      if (result.error) setModelsError(result.error);
    } catch {
      setModelsError(t('providerProfile.errors.fetchModels'));
    } finally {
      setIsLoadingModels(false);
    }
  }, [id, t]);

  useEffect(() => {
    void loadProvider();
  }, [loadProvider]);
  useEffect(() => {
    if (provider && (STATIC_MODELS.has(provider.type) || provider.hasKey)) void loadModels();
  }, [provider, loadModels]);

  if (isLoadingProvider) return <LoadingState minHeight={400} />;
  if (error || !provider) {
    return (
      <Page>
        <EmptyState
          icon="error"
          shape="boom"
          title={error || t('providerProfile.errorNotFound')}
          action={
            <Button variant="tonal" href="/providers">
              {t('providerProfile.backToProviders')}
            </Button>
          }
        />
      </Page>
    );
  }

  const ok = providerHasCredentials(provider);
  const isStatic = STATIC_MODELS.has(provider.type);
  const sorted = [...models].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));

  return (
    <Page>
      <PageHeader
        backLink={{ to: '/providers', label: t('providers.title') }}
        title={
          <span className="flex items-center gap-4">
            <span className="v2-kind-badge bg-secondary-container text-on-secondary-container">
              <ProviderLogo type={provider.type} size={24} />
            </span>
            <span className="truncate">{provider.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone="secondary">{provider.type}</StatusPill>
            {provider.apiUrl && (
              <span className="inline-flex items-center gap-1">
                <Icon name="public" size={16} />
                {provider.apiUrl}
              </span>
            )}
            <StatusPill tone={ok ? 'success' : 'warning'} icon={ok ? 'check_circle' : 'error'}>
              {provider.type === 'KlingAI'
                ? ok
                  ? t('providerProfile.credentialsStored')
                  : t('providerProfile.missingCredentials')
                : ok
                  ? t('providerProfile.keyStored')
                  : t('providerProfile.noKey')}
            </StatusPill>
          </span>
        }
        actions={
          <>
            {provider.type === 'BytePlus' && (
              <Button variant="tonal" icon="layers" href={`/provider/${id}/custom-models`}>
                {t('providerProfile.customModels')}
              </Button>
            )}
            <Button variant="filled" icon="edit" href={`/provider/${id}/edit`}>
              {t('providerProfile.edit')}
            </Button>
          </>
        }
      />

      <div className="v2-stat-grid mb-8">
        <StatTile icon="speed" label={t('providerProfile.concurrency')} value={provider.concurrency} tone="primary" />
        <StatTile icon="play_circle" label={t('providerProfile.projects')} value={provider.usage?.projectCount ?? 0} />
        <StatTile icon="pending_actions" label={t('providerProfile.jobs')} value={provider.usage?.activeJobCount ?? 0} />
        <StatTile icon="model_training" label={t('providerProfile.models')} value={isLoadingModels ? '…' : models.length} tone="tertiary" />
      </div>

      <Section
        title={t('providerProfile.supportedModels')}
        actions={
          !isStatic && (
            <Button variant="text" size="xs" icon="refresh" loading={isLoadingModels} onClick={() => void loadModels()}>
              {t('providerProfile.refresh')}
            </Button>
          )
        }
      >
        {!provider.hasKey && !isStatic && (
          <div className="v2-notice" data-tone="warning">
            <Icon name="error" />
            <Text variant="body-medium">{t('providerProfile.addKeyToFetch')}</Text>
          </div>
        )}
        {modelsError && <ErrorState message={modelsError} />}
        {isLoadingModels ? (
          <LoadingState minHeight={160} />
        ) : (provider.hasKey || isStatic) && models.length === 0 && !modelsError ? (
          <EmptyState size="inline" icon="model_training" title={t('providerProfile.noModels')} />
        ) : models.length > 0 ? (
          <DataTable
            aria-label={t('providerProfile.supportedModels')}
            density="compact"
            rows={sorted}
            getRowId={(m) => `${m.category}:${m.id}`}
            columns={[
              { key: 'name', header: t('common.name', 'Name'), cell: (m) => <Text variant="label-large" emphasized>{m.name}</Text> },
              { key: 'id', header: 'Model ID', cell: (m) => <span className="font-mono text-on-surface-variant">{m.id}</span>, hideBelow: 600 },
              {
                key: 'type',
                header: 'Type',
                width: 140,
                cell: (m) => (
                  <StatusPill icon={CATEGORY_ICON[m.category] ?? 'chat'}>{t(`providerProfile.categories.${m.category}`, m.category)}</StatusPill>
                ),
              },
            ]}
          />
        ) : null}
      </Section>
    </Page>
  );
}
