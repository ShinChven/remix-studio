import { useTranslation } from 'react-i18next';
import { Icon, IconButton } from '../../../m3';
import type { Provider } from '../../../types';
import { formatDateTime } from '../../lib/format';
import type { ActionMenuItem } from '../../ui/ActionMenu';
import { EntityRow, keepInside } from '../../ui/EntityList';
import { kindMeta } from '../../ui/entityMeta';
import { StatusPill } from '../../ui/Stat';
import { relativeTime } from '../users/userMeta';
import { ProviderMark } from './ProviderMark';
import { activeJobCount, modelCounts, projectCount, providerHasCredentials, providerKinds, serviceMeta, urlHost } from './providerMeta';

/** How many tasks the provider runs at once, stepped in place. */
export function ParallelStepper({ value, onChange, name }: { value: number; onChange: (value: number) => void; name: string }) {
  const { t } = useTranslation();
  return (
    <span className="v2-parallel" role="group" aria-label={t('v2.providers.parallelFor', { name })} onClick={keepInside} onKeyDown={keepInside}>
      <IconButton icon="remove" size="xs" label={t('v2.providers.fewer')} disabled={value <= 1} onClick={() => onChange(value - 1)} />
      <span className="v2-parallel__value" aria-live="polite">
        {value}
      </span>
      <IconButton icon="add" size="xs" label={t('v2.providers.more')} disabled={value >= 1000} onClick={() => onChange(value + 1)} />
    </span>
  );
}

/** What the provider makes, with its model count per kind and its custom variants. */
function KindChips({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  const counts = modelCounts(provider);
  const custom = provider.customModels?.length ?? 0;
  return (
    <span className="v2-provider__kinds">
      {providerKinds(provider).map((kind) => {
        const label = t(`v2.providers.kind.${kind}`);
        const catalog = provider.type === 'Civitai';
        return (
          <span key={kind} className="v2-provider-kind" data-kind={kind} title={catalog ? t('v2.providers.catalogHint') : `${label} · ${t('v2.providers.modelCount', { count: counts[kind] })}`}>
            <Icon name={kindMeta(kind).icon} size={15} filled aria-hidden />
            <span className="v2-provider-kind__label">{label}</span>
            <span className="v2-provider-kind__count">{catalog ? t('v2.providers.catalog') : counts[kind]}</span>
          </span>
        );
      })}
      {custom > 0 && (
        <span className="v2-provider-kind" data-kind="custom" title={t('providerProfile.customModels')}>
          <Icon name="layers" size={15} aria-hidden />
          <span className="v2-provider-kind__count">{t('v2.providers.customCount', { count: custom })}</span>
        </span>
      )}
    </span>
  );
}

export interface ProviderItemProps {
  provider: Provider;
  selected: boolean;
  /** Something on the page is selected: a click then toggles the provider instead of opening it. */
  selecting: boolean;
  /** `range` extends the selection from the last toggled provider (shift). */
  onToggleSelect: (range: boolean) => void;
  onOpen: () => void;
  onConcurrencyChange: (value: number) => void;
  menuItems: ActionMenuItem[];
}

/** One connected service: its mark and name, what it makes, how many tasks it runs at once, and how much it is used. */
export function ProviderItem({ provider, selected, selecting, onToggleSelect, onOpen, onConcurrencyChange, menuItems }: ProviderItemProps) {
  const { t, i18n } = useTranslation();
  const ready = providerHasCredentials(provider);
  const running = activeJobCount(provider);
  const service = serviceMeta(provider.type);
  const keyMissing = provider.type === 'KlingAI' ? t('providers.providerCard.missingCredentials') : t('providers.providerCard.noKey');

  return (
    <EntityRow
      lead={(active) => <ProviderMark type={provider.type} size={44} active={active} />}
      title={provider.name}
      badges={
        ready ? (
          <span className="v2-provider__ready" title={provider.type === 'KlingAI' ? t('providers.providerCard.credentialsStored') : t('providers.providerCard.keyStored')}>
            <Icon name="verified" size={16} filled aria-label={t('providers.providerCard.keyStored')} />
          </span>
        ) : (
          <StatusPill tone="warning" icon="key_off">
            {keyMissing}
          </StatusPill>
        )
      }
      subtitle={
        <span className="v2-provider__service">
          <span>{service.label}</span>
          {provider.apiUrl && (
            <span className="v2-provider__host" title={provider.apiUrl}>
              <Icon name="public" size={14} aria-hidden />
              {urlHost(provider.apiUrl)}
            </span>
          )}
        </span>
      }
      cells={[
        { key: 'kinds', width: '200px', shrink: true, narrow: 'below', children: <KindChips provider={provider} /> },
        {
          key: 'parallel',
          width: '116px',
          label: t('v2.providers.parallel'),
          children: (
            <span className="v2-erow__value">
              <Icon name="speed" size={16} aria-hidden />
              <ParallelStepper value={provider.concurrency || 1} onChange={onConcurrencyChange} name={provider.name} />
            </span>
          ),
        },
        {
          key: 'projects',
          width: '64px',
          label: t('v2.providers.projects'),
          drop: 3,
          children: (
            <span className="v2-erow__value">
              <Icon name="folder" size={16} aria-hidden />
              {projectCount(provider).toLocaleString()}
            </span>
          ),
        },
        {
          key: 'running',
          width: '64px',
          label: t('v2.providers.running'),
          drop: 5,
          className: 'v2-provider-running',
          children: (
            <span className="v2-erow__value" data-active={running > 0 ? '' : undefined}>
              {running > 0 ? <span className="v2-provider__pulse" aria-hidden /> : <Icon name="progress_activity" size={16} aria-hidden />}
              {running.toLocaleString()}
            </span>
          ),
        },
        {
          key: 'added',
          width: '112px',
          label: t('v2.providers.added'),
          title: formatDateTime(provider.createdAt),
          drop: 1,
          className: 'v2-provider-added',
          children: (
            <span className="v2-erow__value">
              <Icon name="event" size={16} aria-hidden />
              {relativeTime(provider.createdAt, i18n.language)}
            </span>
          ),
        },
      ]}
      selected={selected}
      selecting={selecting}
      onToggleSelect={onToggleSelect}
      onOpen={onOpen}
      ariaLabel={`${provider.name}, ${service.label}`}
      selectLabel={t('v2.providers.selectProvider', { name: provider.name })}
      menuLabel={t('v2.providers.actionsFor', { name: provider.name })}
      menuItems={menuItems}
    />
  );
}
