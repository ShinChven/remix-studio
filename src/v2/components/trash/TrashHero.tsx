import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrashItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { PageHero, type PageHeroStat } from '../../ui/PageHero';
import { timeAgo, trashBytes } from './trashMeta';

export interface TrashHeroProps {
  /** Everything in the bin; null until it has loaded. */
  items: TrashItem[] | null;
  actions: ReactNode;
}

/** The bin's header: what it holds, the space it takes, and the page actions. */
export function TrashHero({ items, actions }: TrashHeroProps) {
  const { t, i18n } = useTranslation();
  const all = items ?? [];
  const projectCount = new Set(all.map((item) => item.projectId)).size;
  const oldest = all.reduce<number | null>((min, item) => (min === null || item.deletedAt < min ? item.deletedAt : min), null);
  const totalBytes = all.reduce((sum, item) => sum + trashBytes(item), 0);

  const stats: PageHeroStat[] = [];
  if (all.length > 0) {
    stats.push({ key: 'items', value: all.length.toLocaleString(), label: t('v2.trash.statItems', { count: all.length }) });
    stats.push({ key: 'projects', icon: 'folder', value: projectCount.toLocaleString(), label: t('v2.trash.statProjects', { count: projectCount }) });
    if (totalBytes > 0) stats.push({ key: 'space', icon: 'hard_drive', value: formatBytes(totalBytes), label: t('v2.trash.toFree') });
    if (oldest !== null) stats.push({ key: 'oldest', icon: 'history', label: t('v2.trash.statOldest', { time: timeAgo(oldest, i18n.language) }), title: new Date(oldest).toLocaleString() });
  }

  return <PageHero icon="delete" shape="arch" title={t('trash.title')} description={t('trash.description')} stats={stats} actions={actions} />;
}
