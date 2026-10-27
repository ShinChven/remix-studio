import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '../../../types';
import { PageHero, type PageHeroStat } from '../../ui/PageHero';
import { activeJobCount, projectCount, providerHasCredentials } from './providerMeta';

export interface ProvidersHeroProps {
  /** Every provider; null until they have loaded. */
  providers: Provider[] | null;
  actions: ReactNode;
}

/** The page's header: how many services are connected, ready and busy. */
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

  return <PageHero icon="key" shape="gem" title={t('providers.title')} description={t('v2.providers.description')} stats={stats} actions={actions} />;
}
