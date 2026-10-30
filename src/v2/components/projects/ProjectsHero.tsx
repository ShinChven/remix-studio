import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHero } from '../../ui/PageHero';

/** The page's header: the title and the actions. */
export function ProjectsHero({ actions }: { actions: ReactNode }) {
  const { t } = useTranslation();
  return <PageHero icon="play_circle" shape="cookie-7" title={t('projects.title')} description={t('projects.description')} actions={actions} />;
}
