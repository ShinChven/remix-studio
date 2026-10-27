import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { projectMediaType } from '../../../lib/project-media';
import { Icon, Shape, shapeMaskStyle, Text } from '../../../m3';
import type { Project } from '../../../types';
import { kindMeta } from '../../ui/entityMeta';

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

/** One of the newest projects, cropped to its kind's shape: its newest picture, or its kind's icon. */
function Piece({ project, index }: { project: Project; index: number }) {
  const [broken, setBroken] = useState(false);
  const kind = project.type ?? 'image';
  const meta = kindMeta(kind);
  const last = project.album?.[project.album.length - 1];
  const poster = broken ? '' : last?.thumbnailUrl || last?.optimizedUrl || (projectMediaType(project) === 'image' ? last?.imageUrl : '') || '';
  return (
    <span className="v2-projects-hero__piece" data-index={index} data-kind={kind} data-poster={poster ? '' : undefined}>
      <Shape name={meta.shape} size="100%" morph={false} className="v2-projects-hero__piece-shape" />
      {poster ? (
        <span className="v2-projects-hero__piece-picture" style={shapeMaskStyle(meta.shape)}>
          <img src={imageDisplayUrl(poster)} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setBroken(true)} />
        </span>
      ) : (
        <Icon name={meta.icon} size={index === 0 ? 44 : 26} filled className="v2-projects-hero__piece-icon" />
      )}
    </span>
  );
}

export interface ProjectsHeroProps {
  /** Every project at a glance; null until it has loaded. */
  overview: ProjectsOverview | null;
  /** Jobs across every project; null until it has loaded. */
  queue: ProjectsQueue | null;
  actions: ReactNode;
}

/** The page's header: how many projects there are and what is generating, the actions, and the newest projects in their kinds' shapes. */
export function ProjectsHero({ overview, queue, actions }: ProjectsHeroProps) {
  const { t } = useTranslation();
  const total = overview ? overview.active + overview.archived : 0;
  const newest = overview?.newest.slice(0, 5) ?? [];

  return (
    <header className="v2-projects-hero" data-cluster={newest.length > 0 ? '' : undefined}>
      <Shape name="soft-boom" size={380} morph={false} className="v2-projects-hero__backdrop" />
      <div className="v2-projects-hero__main">
        <div className="v2-projects-hero__heading">
          <span className="v2-projects-hero__badge" aria-hidden>
            <Shape name="cookie-7" size={64} morph={false} className="v2-projects-hero__badge-shape" />
            <Icon name="play_circle" size={30} filled className="v2-projects-hero__badge-icon" />
          </span>
          <div className="v2-projects-hero__titles">
            <Text as="span" variant="label-large" emphasized className="v2-projects-hero__kicker">
              {t('v2.shell.sections.create')}
            </Text>
            <Text as="h1" variant="headline-large" emphasized className="v2-projects-hero__title">
              {t('projects.title')}
            </Text>
          </div>
        </div>
        <Text as="p" variant="body-large" className="v2-projects-hero__description">
          {t('projects.description')}
        </Text>
        {overview && total > 0 && (
          <ul className="v2-projects-hero__stats">
            <li>
              <strong>{total.toLocaleString()}</strong> {t('v2.projects.statProjects', { count: total })}
            </li>
            {overview.archived > 0 && (
              <li>
                <Icon name="archive" size={16} aria-hidden />
                <strong>{overview.archived.toLocaleString()}</strong> {t('v2.projects.statArchived', { count: overview.archived })}
              </li>
            )}
            {queue && queue.running > 0 && (
              <li data-tone="running">
                <span className="v2-projects-hero__dot" aria-hidden />
                <strong>{queue.running.toLocaleString()}</strong> {t('v2.projects.statRunning')}
              </li>
            )}
            {queue && queue.queued > 0 && (
              <li>
                <Icon name="hourglass_top" size={16} aria-hidden />
                <strong>{queue.queued.toLocaleString()}</strong> {t('v2.projects.statQueued')}
              </li>
            )}
            {queue && queue.failed > 0 && (
              <li data-tone="error">
                <Icon name="error" size={16} filled aria-hidden />
                <strong>{queue.failed.toLocaleString()}</strong> {t('v2.projects.statFailed')}
              </li>
            )}
          </ul>
        )}
        <div className="v2-projects-hero__actions">{actions}</div>
      </div>
      {newest.length > 0 && (
        <figure className="v2-projects-hero__cluster">
          <div className="v2-projects-hero__pieces" aria-hidden>
            {newest.map((project, index) => (
              <Piece key={project.id} project={project} index={index} />
            ))}
          </div>
          <figcaption className="v2-projects-hero__caption">
            <Text as="span" variant="label-small" className="v2-projects-hero__caption-label">
              {t('v2.projects.newest')}
            </Text>
            <Text as="span" variant="label-large" emphasized className="v2-projects-hero__caption-name">
              {newest[0].name}
            </Text>
          </figcaption>
        </figure>
      )}
    </header>
  );
}
