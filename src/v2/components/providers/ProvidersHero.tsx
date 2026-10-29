import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '../../../types';
import type { PageHeroStat } from '../../ui/PageHero';
import { ShowcaseHero } from '../../ui/ShowcaseHero';
import { ProviderMark } from './ProviderMark';
import { activeJobCount, projectCount, providerHasCredentials } from './providerMeta';

/** The connected services, one per service: ready before missing a key, busiest first. */
function connectedTypes(providers: Provider[]) {
  const ranked = [...providers].sort(
    (a, b) => Number(providerHasCredentials(b)) - Number(providerHasCredentials(a)) || activeJobCount(b) - activeJobCount(a) || projectCount(b) - projectCount(a),
  );
  return [...new Set(ranked.map((provider) => provider.type))];
}

export interface ProvidersHeroProps {
  /** Every provider; null until they have loaded. */
  providers: Provider[] | null;
  actions: ReactNode;
}

/** The page's header: how many services are connected, ready and busy, and the marks of the main ones. */
export function ProvidersHero({ providers, actions }: ProvidersHeroProps) {
  const { t } = useTranslation();
  const all = providers ?? [];
  const ready = all.filter(providerHasCredentials).length;
  const missing = all.length - ready;
  const running = all.reduce((sum, provider) => sum + activeJobCount(provider), 0);
  const projects = all.reduce((sum, provider) => sum + projectCount(provider), 0);

  const stats: PageHeroStat[] = [];
  if (all.length > 0) {
    stats.push({ key: 'total', value: all.length.toLocaleString(), label: t('v2.providers.statProviders', { count: all.length }) });
    stats.push({ key: 'ready', tone: 'success', value: ready.toLocaleString(), label: t('v2.providers.statReady', { count: ready }) });
    if (missing > 0) stats.push({ key: 'missing', tone: 'warning', value: missing.toLocaleString(), label: t('v2.providers.statMissing', { count: missing }) });
    if (running > 0) stats.push({ key: 'running', tone: 'running', value: running.toLocaleString(), label: t('v2.providers.statRunning', { count: running }) });
    if (projects > 0) stats.push({ key: 'projects', icon: 'folder', value: projects.toLocaleString(), label: t('v2.providers.statProjects', { count: projects }) });
  }

  return (
    <ShowcaseHero
      tone="secondary"
      icon="key"
      shape="gem"
      backdrop="soft-boom"
      kicker={t('v2.shell.sections.manage')}
      title={t('providers.title')}
      description={t('v2.providers.description')}
      stats={stats}
      actions={actions}
      fan={connectedTypes(all).slice(0, 3).map((type, index) => <ProviderMark key={type} type={type} size={index === 0 ? 96 : 72} />)}
    />
  );
}
