import { useTranslation } from 'react-i18next';
import { Icon, Text } from '../../../m3';
import type { ModelConfig } from '../../../types';
import { useModelDescriptions } from '../../lib/modelDescriptions';
import { KindBadge } from '../../ui/KindBadge';
import { modelTraits, type ProviderKind } from './providerMeta';

export interface ModelEntry {
  key: string;
  name: string;
  modelId: string;
  kind: ProviderKind;
  description?: string;
  traits: string[];
  /** A custom variant of a built-in model. */
  custom?: boolean;
  /** Whether the provider's key reaches it, when that was checked. */
  reach?: 'yes' | 'no';
}

/** Built-in and custom models as entries for the rows, with their descriptions. */
export function useModelEntries(models: ModelConfig[], customIds: Set<string> = new Set()): ModelEntry[] {
  const descriptions = useModelDescriptions();
  return models.map((model) => ({
    key: model.id,
    name: model.name,
    modelId: model.modelId,
    kind: model.category as ProviderKind,
    description: descriptions[model.id],
    traits: modelTraits(model),
    custom: customIds.has(model.modelId),
  }));
}

/** Models, one per row: what it makes, its name and description, its main options and its model ID. */
export function ModelRows({ models, onCopy, compact = false }: { models: ModelEntry[]; onCopy?: (modelId: string) => void; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className="v2-model-rows" data-compact={compact ? '' : undefined}>
      {models.map((model) => (
        <li key={model.key} className="v2-model-row" data-kind-host data-reach={model.reach}>
          <KindBadge kind={model.kind} size={compact ? 32 : 36} tone="solid" className="v2-model-row__art" />
          <span className="v2-model-row__body">
            <span className="v2-model-row__name-line">
              <Text as="span" variant="title-small" emphasized className="v2-model-row__name">
                {model.name}
              </Text>
              {model.custom && <span className="v2-model-row__custom">{t('v2.providers.models.custom')}</span>}
            </span>
            {model.description && (
              <Text as="span" variant="body-small" className="v2-model-row__description">
                {model.description}
              </Text>
            )}
            {model.traits.length > 0 && <span className="v2-model-row__traits">{model.traits.join('  ·  ')}</span>}
          </span>
          {onCopy ? (
            <button type="button" className="v2-model-row__id m3-focus-ring" title={t('v2.providers.models.copyId')} onClick={() => onCopy(model.modelId)}>
              <span>{model.modelId}</span>
              <Icon name="content_copy" size={14} aria-hidden />
            </button>
          ) : (
            <span className="v2-model-row__id">{model.modelId}</span>
          )}
          {model.reach && (
            <span className="v2-model-row__reach" title={model.reach === 'yes' ? t('v2.providers.models.reachable') : t('v2.providers.models.unreachable')}>
              <Icon name={model.reach === 'yes' ? 'check_circle' : 'do_not_disturb_on'} size={18} filled={model.reach === 'yes'} aria-label={model.reach === 'yes' ? t('v2.providers.models.reachable') : t('v2.providers.models.unreachable')} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
