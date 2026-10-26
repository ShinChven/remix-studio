import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Text } from '../../../m3';
import type { ProjectType, Provider } from '../../../types';
import { useModelDescriptions } from '../../lib/modelDescriptions';
import { ChoiceTiles } from '../../ui/ChoiceTiles';
import { EmptyState } from '../../ui/Page';
import { SearchField } from '../../ui/SearchField';
import { ProviderLogo } from '../ProviderLogo';

export interface ModelSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  providers: Provider[];
  selectedProviderId: string;
  selectedModelId: string;
  onSelect: (providerId: string, modelId: string) => void;
  projectType?: ProjectType;
}

/** Picks the model a project generates with, grouped by provider and searchable. */
export function ModelSelectorDialog({ open, onClose, providers, selectedProviderId, selectedModelId, onSelect, projectType = 'image' }: ModelSelectorDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const descriptions = useModelDescriptions();

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    return providers
      .map((provider) => ({
        ...provider,
        models: (provider.models || []).filter((m) => {
          const category = !m.category || m.category === projectType;
          const search = q === '' || m.name.toLowerCase().includes(q) || m.generatorId.toLowerCase().includes(q) || provider.name.toLowerCase().includes(q) || (descriptions[m.id] || '').toLowerCase().includes(q);
          return category && search;
        }),
      }))
      .filter((provider) => provider.models.length > 0);
  }, [providers, projectType, query, descriptions]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      headline={t('projectViewer.modelSelector.title')}
      fullScreen="compact"
      maxWidth={880}
      actions={
        <Text variant="label-small" className="me-auto uppercase tracking-widest text-on-surface-variant">
          {t('projectViewer.modelSelector.footer')}
        </Text>
      }
    >
      <div className="flex flex-col gap-4" data-density="compact">
        <Text variant="body-medium" className="text-on-surface-variant">
          {t('projectViewer.modelSelector.description')}
        </Text>
        <SearchField value={query} onChange={setQuery} placeholder={t('projectViewer.modelSelector.searchPlaceholder')} shape="field" autoFocus />
        {providers.length === 0 ? (
          <EmptyState icon="dns" title={t('projectViewer.modelSelector.noProviders')} description={t('projectViewer.modelSelector.noProvidersHint')} size="inline" />
        ) : groups.length === 0 ? (
          <EmptyState icon="search_off" title={t('projectViewer.modelSelector.noModelsFound', { query })} size="inline" />
        ) : (
          groups.map((provider) => (
            <section key={provider.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ProviderLogo type={provider.type} size={24} />
                <Text as="h3" variant="title-small" emphasized>
                  {provider.name}
                </Text>
                {provider.name.toLowerCase().replace(/\s/g, '') !== provider.type.toLowerCase().replace(/\s/g, '') && (
                  <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                    {provider.type}
                  </Text>
                )}
              </div>
              <ChoiceTiles
                size="compact"
                columns={3}
                aria-label={provider.name}
                value={provider.id === selectedProviderId ? selectedModelId : ''}
                onChange={(modelId) => onSelect(provider.id, modelId)}
                options={provider.models.map((model) => ({ value: model.id, label: model.name, supportingText: descriptions[model.id] }))}
              />
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}
