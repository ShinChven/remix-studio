import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Shape, Text } from '../../../m3';
import type { Provider, ProviderType } from '../../../types';
import { KindBadge } from '../../ui/KindBadge';
import { ProviderMark } from './ProviderMark';
import { activeJobCount, PROVIDER_KINDS, projectCount, providerHasCredentials, readyModelCounts, serviceMeta, type ProviderKind } from './providerMeta';

/** Shown, greyed, around an empty orbit: a few services to start with. */
const FEATURED: ProviderType[] = ['GoogleAI', 'OpenAI', 'Claude', 'BytePlus', 'KlingAI', 'BlackForestLabs'];
const ORBIT_SIZE = 6;

/** The connected services, one per service: ready before missing a key, busiest first. */
function connectedTypes(providers: Provider[]): ProviderType[] {
  const ranked = [...providers].sort(
    (a, b) => Number(providerHasCredentials(b)) - Number(providerHasCredentials(a)) || activeJobCount(b) - activeJobCount(a) || projectCount(b) - projectCount(a),
  );
  return [...new Set(ranked.map((provider) => provider.type))];
}

export interface ProvidersHeroProps {
  /** Every provider; null until they have loaded. */
  providers: Provider[] | null;
  actions: ReactNode;
  /** Shows only the providers that make this kind. */
  onPickKind: (kind: ProviderKind) => void;
}

/** The page's header: how many services are connected and ready, what they can make, and their marks in orbit. */
export function ProvidersHero({ providers, actions, onPickKind }: ProvidersHeroProps) {
  const { t } = useTranslation();
  const all = providers ?? [];
  const ready = all.filter(providerHasCredentials).length;
  const missing = all.length - ready;
  const running = all.reduce((sum, provider) => sum + activeJobCount(provider), 0);
  const projects = all.reduce((sum, provider) => sum + projectCount(provider), 0);
  const coverage = readyModelCounts(all);
  const connected = connectedTypes(all);
  const orbit = connected.length ? connected.slice(0, ORBIT_SIZE) : FEATURED;
  const names = connected.map((type) => serviceMeta(type).label);

  return (
    <header className="v2-providers-hero">
      <Shape name="soft-boom" size={380} morph={false} className="v2-providers-hero__backdrop" />
      <div className="v2-providers-hero__main">
        <div className="v2-providers-hero__heading">
          <span className="v2-providers-hero__badge" aria-hidden>
            <Shape name="gem" size={64} morph={false} className="v2-providers-hero__badge-shape" />
            <Icon name="key" size={30} filled className="v2-providers-hero__badge-icon" />
          </span>
          <div className="v2-providers-hero__titles">
            <Text as="span" variant="label-large" emphasized className="v2-providers-hero__kicker">
              {t('v2.shell.sections.manage')}
            </Text>
            <Text as="h1" variant="headline-large" emphasized className="v2-providers-hero__title">
              {t('providers.title')}
            </Text>
          </div>
        </div>
        <Text as="p" variant="body-large" className="v2-providers-hero__description">
          {t('v2.providers.description')}
        </Text>
        {all.length > 0 && (
          <ul className="v2-providers-hero__stats">
            <li>
              <strong>{all.length.toLocaleString()}</strong> {t('v2.providers.statProviders', { count: all.length })}
            </li>
            <li data-tone="success">
              <span className="v2-providers-hero__dot" aria-hidden />
              <strong>{ready.toLocaleString()}</strong> {t('v2.providers.statReady', { count: ready })}
            </li>
            {missing > 0 && (
              <li data-tone="warning">
                <span className="v2-providers-hero__dot" aria-hidden />
                <strong>{missing.toLocaleString()}</strong> {t('v2.providers.statMissing', { count: missing })}
              </li>
            )}
            {running > 0 && (
              <li data-tone="running">
                <span className="v2-providers-hero__dot" aria-hidden />
                <strong>{running.toLocaleString()}</strong> {t('v2.providers.statRunning', { count: running })}
              </li>
            )}
            {projects > 0 && (
              <li>
                <Icon name="folder" size={16} aria-hidden />
                <strong>{projects.toLocaleString()}</strong> {t('v2.providers.statProjects', { count: projects })}
              </li>
            )}
          </ul>
        )}
        {providers && (
          <div className="v2-providers-reach">
            <Text as="span" variant="label-medium" className="v2-providers-reach__label">
              {t('v2.providers.canMake')}
            </Text>
            <ul className="v2-providers-reach__kinds">
              {PROVIDER_KINDS.map((kind) => {
                const entry = coverage[kind];
                const on = entry.providers > 0;
                return (
                  <li key={kind}>
                    <button
                      type="button"
                      className="v2-providers-reach__kind m3-focus-ring"
                      data-kind={kind}
                      data-off={on ? undefined : ''}
                      title={t('v2.providers.showKind', { kind: t(`v2.providers.kinds.${kind}`) })}
                      onClick={() => onPickKind(kind)}
                    >
                      <KindBadge kind={kind} size={36} tone="solid" />
                      <span className="v2-providers-reach__text">
                        <span className="v2-providers-reach__name">{t(`v2.providers.kinds.${kind}`)}</span>
                        <span className="v2-providers-reach__count">
                          {!on ? t('v2.providers.kindNone') : entry.models > 0 ? t('v2.providers.modelCount', { count: entry.models }) : t('v2.providers.kindReady')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="v2-providers-hero__actions">{actions}</div>
      </div>
      {providers && (
        <figure className="v2-providers-hero__orbit" data-empty={connected.length ? undefined : ''}>
          <div className="v2-providers-orbit" aria-hidden>
            <span className="v2-providers-orbit__path" />
            <span className="v2-providers-orbit__core">
              <Shape name="cookie-12" size={104} morph={false} className="v2-providers-orbit__core-shape" />
              <Icon name="vpn_key" size={40} filled className="v2-providers-orbit__core-icon" />
            </span>
            <div className="v2-providers-orbit__ring">
              {orbit.map((type, index) => (
                <span key={type} className="v2-providers-orbit__slot" style={{ '--_a': `${-90 + (index * 360) / orbit.length}deg` } as CSSProperties}>
                  <span className="v2-providers-orbit__body" title={serviceMeta(type).label}>
                    <ProviderMark type={type} size={index === 0 && connected.length ? 64 : 52} dimmed={!connected.length} />
                  </span>
                </span>
              ))}
            </div>
          </div>
          <figcaption className="v2-providers-hero__caption">
            <Text as="span" variant="label-small" className="v2-providers-hero__caption-label">
              {connected.length ? t('v2.providers.connected') : t('v2.providers.startWith')}
            </Text>
            {connected.length > 0 && (
              <Text as="span" variant="label-large" emphasized className="v2-providers-hero__caption-names">
                {names.slice(0, 2).join(', ')}
                {names.length > 2 && ` ${t('v2.providers.andMore', { count: names.length - 2 })}`}
              </Text>
            )}
          </figcaption>
        </figure>
      )}
    </header>
  );
}
