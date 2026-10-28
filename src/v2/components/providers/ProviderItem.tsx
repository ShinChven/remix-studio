import { useState, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Icon, IconButton, Ripple, Text } from '../../../m3';
import type { Provider } from '../../../types';
import { formatDateTime } from '../../lib/format';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
import { kindMeta } from '../../ui/entityMeta';
import { StatusPill } from '../../ui/Stat';
import { relativeTime } from '../users/userMeta';
import { ProviderMark } from './ProviderMark';
import { activeJobCount, modelCounts, projectCount, providerHasCredentials, providerKinds, serviceMeta, urlHost } from './providerMeta';

/** Clicks and keys inside a control stay there instead of opening the provider. */
const keep = (event: SyntheticEvent) => event.stopPropagation();

/** How many tasks the provider runs at once, stepped in place. */
export function ParallelStepper({ value, onChange, name }: { value: number; onChange: (value: number) => void; name: string }) {
  const { t } = useTranslation();
  return (
    <span className="v2-parallel" role="group" aria-label={t('v2.providers.parallelFor', { name })} onClick={keep} onKeyDown={keep}>
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
  const [active, setActive] = useState(false);
  const ready = providerHasCredentials(provider);
  const projects = projectCount(provider);
  const running = activeJobCount(provider);
  const service = serviceMeta(provider.type);
  const keyMissing = provider.type === 'KlingAI' ? t('providers.providerCard.missingCredentials') : t('providers.providerCard.noKey');

  const activate = (event: MouseEvent | KeyboardEvent) => {
    if (selecting || event.metaKey || event.ctrlKey || event.shiftKey) onToggleSelect(event.shiftKey);
    else onOpen();
  };

  return (
    <li
      className="v2-provider m3-focus-ring"
      data-selected={selected ? '' : undefined}
      data-ready={ready ? '' : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${provider.name}, ${service.label}`}
      onClick={activate}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={(event) => event.target === event.currentTarget && setActive(true)}
      onBlur={(event) => event.target === event.currentTarget && setActive(false)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') activate(event);
        if (event.key === ' ') {
          event.preventDefault();
          onToggleSelect(event.shiftKey);
        }
      }}
    >
      <Ripple />
      <span className="v2-provider__lead">
        <span
          className="v2-provider__check"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target instanceof HTMLInputElement) onToggleSelect(event.shiftKey);
          }}
        >
          <Checkbox checked={selected} aria-label={t('v2.providers.selectProvider', { name: provider.name })} onChange={() => undefined} />
        </span>
        <ProviderMark type={provider.type} size={44} active={active} className="v2-provider__mark" />
      </span>

      <span className="v2-provider__identity">
        <span className="v2-provider__name-line">
          <Text as="span" variant="title-small" emphasized className="v2-provider__name">
            {provider.name}
          </Text>
          {ready ? (
            <span className="v2-provider__ready" title={provider.type === 'KlingAI' ? t('providers.providerCard.credentialsStored') : t('providers.providerCard.keyStored')}>
              <Icon name="verified" size={16} filled aria-label={t('providers.providerCard.keyStored')} />
            </span>
          ) : (
            <StatusPill tone="warning" icon="key_off" className="v2-provider__missing-pill">
              {keyMissing}
            </StatusPill>
          )}
        </span>
        <Text as="span" variant="body-small" className="v2-provider__service">
          <span>{service.label}</span>
          {provider.apiUrl && (
            <span className="v2-provider__host" title={provider.apiUrl}>
              <Icon name="public" size={14} aria-hidden />
              {urlHost(provider.apiUrl)}
            </span>
          )}
        </Text>
      </span>

      <KindChips provider={provider} />

      {/* Each figure is marked with an icon; its label stays for screen readers and the tooltip. */}
      <span className="v2-provider__stats">
        <span className="v2-provider__stat v2-provider__stat--parallel" title={t('v2.providers.parallel')}>
          <span className="v2-provider__stat-label">{t('v2.providers.parallel')}</span>
          <span className="v2-provider__stat-value">
            <Icon name="speed" size={16} className="v2-provider__stat-icon" aria-hidden />
            <ParallelStepper value={provider.concurrency || 1} onChange={onConcurrencyChange} name={provider.name} />
          </span>
        </span>
        <span className="v2-provider__stat v2-provider__stat--projects" title={t('v2.providers.projects')}>
          <span className="v2-provider__stat-label">{t('v2.providers.projects')}</span>
          <span className="v2-provider__stat-value">
            <Icon name="folder" size={16} className="v2-provider__stat-icon" aria-hidden />
            {projects.toLocaleString()}
          </span>
        </span>
        <span className="v2-provider__stat v2-provider__stat--running" data-active={running > 0 ? '' : undefined} title={t('v2.providers.running')}>
          <span className="v2-provider__stat-label">{t('v2.providers.running')}</span>
          <span className="v2-provider__stat-value">
            {running > 0 ? <span className="v2-provider__pulse" aria-hidden /> : <Icon name="progress_activity" size={16} className="v2-provider__stat-icon" aria-hidden />}
            {running.toLocaleString()}
          </span>
        </span>
        <span className="v2-provider__stat v2-provider__stat--added" title={formatDateTime(provider.createdAt)}>
          <span className="v2-provider__stat-label">{t('v2.providers.added')}</span>
          <span className="v2-provider__stat-value">
            <Icon name="event" size={16} className="v2-provider__stat-icon" aria-hidden />
            {relativeTime(provider.createdAt, i18n.language)}
          </span>
        </span>
      </span>

      <span className="v2-provider__menu" onClick={keep} onKeyDown={keep}>
        <ActionMenu label={t('v2.providers.actionsFor', { name: provider.name })} items={menuItems} openOnHover />
      </span>
    </li>
  );
}

