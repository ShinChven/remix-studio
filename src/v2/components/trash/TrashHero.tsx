import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Icon } from '../../../m3';
import type { TrashItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { KindBadge } from '../../ui/KindBadge';
import type { PageHeroStat } from '../../ui/PageHero';
import { ShowcaseHero } from '../../ui/ShowcaseHero';
import { timeAgo, trashBytes, trashKind } from './trashMeta';

/** One deleted item as a card: its picture, the start of its text, or its kind's badge. */
function TrashCard({ item }: { item: TrashItem }) {
  const [broken, setBroken] = useState(false);
  const kind = trashKind(item);
  const poster = broken ? '' : item.thumbnailUrl || (kind === 'image' ? item.optimizedUrl || item.imageUrl : '');
  return (
    <span className="v2-trash-card" data-kind={poster ? 'picture' : kind}>
      {poster ? (
        <>
          <img src={imageDisplayUrl(poster)} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setBroken(true)} />
          {kind === 'video' && (
            <span className="v2-trash-card__play">
              <Icon name="play_arrow" size={18} filled />
            </span>
          )}
        </>
      ) : kind === 'text' ? (
        <span className="v2-trash-card__text">{item.textContent || item.prompt}</span>
      ) : (
        <KindBadge kind={kind} size={56} tone="container" />
      )}
    </span>
  );
}

export interface TrashHeroProps {
  /** Everything in the bin; null until it has loaded. */
  items: TrashItem[] | null;
  actions: ReactNode;
}

/** The bin's header: what it holds, the space it takes, the page actions, and the last things thrown in. */
export function TrashHero({ items, actions }: TrashHeroProps) {
  const { t, i18n } = useTranslation();
  const all = items ?? [];
  const projectCount = new Set(all.map((item) => item.projectId)).size;
  const oldest = all.reduce<number | null>((min, item) => (min === null || item.deletedAt < min ? item.deletedAt : min), null);
  const totalBytes = all.reduce((sum, item) => sum + trashBytes(item), 0);
  const latest = [...all].sort((a, b) => b.deletedAt - a.deletedAt).slice(0, 3);

  const stats: PageHeroStat[] = [];
  if (all.length > 0) {
    stats.push({ key: 'items', value: all.length.toLocaleString(), label: t('v2.trash.statItems', { count: all.length }) });
    stats.push({ key: 'projects', icon: 'folder', value: projectCount.toLocaleString(), label: t('v2.trash.statProjects', { count: projectCount }) });
    if (totalBytes > 0) stats.push({ key: 'space', icon: 'hard_drive', value: formatBytes(totalBytes), label: t('v2.trash.toFree') });
    if (oldest !== null) stats.push({ key: 'oldest', icon: 'history', label: t('v2.trash.statOldest', { time: timeAgo(oldest, i18n.language) }), title: new Date(oldest).toLocaleString() });
  }

  return (
    <ShowcaseHero
      tone="tertiary"
      icon="delete"
      shape="arch"
      kicker={t('v2.shell.sections.manage')}
      title={t('trash.title')}
      description={t('trash.description')}
      stats={stats}
      actions={actions}
      fan={latest.map((item) => <TrashCard key={item.id} item={item} />)}
    />
  );
}
