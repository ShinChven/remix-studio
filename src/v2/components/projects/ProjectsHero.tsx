import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '../../../types';
import { PageHero, type PageHeroStat } from '../../ui/PageHero';

export interface ProjectsOverview {
  active: number;
  archived: number;
  /** The newest active projects, newest first. */
  newest: Project[];
}

export interface ProjectsQueue {
  running: number;
  queued: number;
  failed: number;
}

export interface ProjectsHeroProps {
  /** Every project at a glance; null until it has loaded. */
  overview: ProjectsOverview | null;
  /** Jobs across every project; null until it has loaded. */
  queue: ProjectsQueue | null;
  actions: ReactNode;
}

/** The page's header: how many projects there are, what is generating, and the actions. */
export function ProjectsHero({ overview, queue, actions }: ProjectsHeroProps) {
  const { t } = useTranslation();
  const total = overview ? overview.active + overview.archived : 0;

  const stats: PageHeroStat[] = [];
  if (overview && total > 0) {
    stats.push({ key: 'total', value: total.toLocaleString(), label: t('v2.projects.statProjects', { count: total }) });
    if (overview.archived > 0) stats.push({ key: 'archived', icon: 'archive', value: overview.archived.toLocaleString(), label: t('v2.projects.statArchived', { count: overview.archived }) });
    if (queue && queue.running > 0) stats.push({ key: 'running', tone: 'running', value: queue.running.toLocaleString(), label: t('v2.projects.statRunning') });
    if (queue && queue.queued > 0) stats.push({ key: 'queued', icon: 'hourglass_top', value: queue.queued.toLocaleString(), label: t('v2.projects.statQueued') });
    if (queue && queue.failed > 0) stats.push({ key: 'failed', tone: 'error', value: queue.failed.toLocaleString(), label: t('v2.projects.statFailed') });
  }

  return <PageHero icon="play_circle" shape="cookie-7" title={t('projects.title')} description={t('projects.description')} stats={stats} actions={actions} />;
}
