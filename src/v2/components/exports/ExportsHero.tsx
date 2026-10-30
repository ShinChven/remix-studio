import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageHeroStat } from '../../ui/PageHero';
import { ShowcaseHero } from '../../ui/ShowcaseHero';

export interface ExportsHeroProps {
  /** Every export; null until the list has loaded. */
  total: number | null;
  /** Exports still being built on the current page. */
  active: number;
  actions: ReactNode;
}

/** The page's header: how many archives there are, how many are still being built, and the actions. */
export function ExportsHero({ total, active, actions }: ExportsHeroProps) {
  const { t } = useTranslation();
  // The figures are always shown, with a dash while loading, so the hero keeps its height.
  const stats: PageHeroStat[] = [
    { key: 'total', icon: 'folder_zip', value: total === null ? '–' : total.toLocaleString(), label: t('exports.stats.total') },
    active > 0
      ? { key: 'active', tone: 'running', value: active.toLocaleString(), label: t('exports.stats.active') }
      : { key: 'active', icon: 'check_circle', value: total === null ? '–' : '0', label: t('exports.stats.active') },
  ];

  return (
    <ShowcaseHero
      icon="folder_zip"
      shape="pentagon"
      backdrop="flower"
      kicker={t('v2.shell.sections.manage')}
      title={t('exports.title')}
      description={t('exports.description')}
      stats={stats}
      actions={actions}
    />
  );
}
