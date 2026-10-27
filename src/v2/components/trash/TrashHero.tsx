import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Icon, Shape, Text } from '../../../m3';
import type { TrashItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { kindMeta } from '../../ui/entityMeta';
import { TRASH_KINDS, timeAgo, trashBytes, trashKind, type TrashKind } from './trashMeta';

/** The three most recently deleted items, as cards for the pile. */
function pile(items: TrashItem[]) {
  return [...items].sort((a, b) => b.deletedAt - a.deletedAt).slice(0, 3);
}

/** One deleted item as a card in the pile: its picture, the start of its text, or its kind's art. */
function PileCard({ item, index }: { item: TrashItem; index: number }) {
  const [broken, setBroken] = useState(false);
  const kind = trashKind(item);
  const meta = kindMeta(kind);
  const poster = broken ? '' : item.thumbnailUrl || (kind === 'image' ? item.optimizedUrl || item.imageUrl : '');
  return (
    <span className="v2-trash-hero__card" data-index={index} data-kind={poster ? 'picture' : kind}>
      {poster ? (
        <>
          <img src={imageDisplayUrl(poster)} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setBroken(true)} />
          {kind === 'video' && (
            <span className="v2-trash-hero__card-play">
              <Icon name="play_arrow" size={20} filled />
            </span>
          )}
        </>
      ) : kind === 'text' ? (
        <span className="v2-trash-hero__card-text">{item.textContent || item.prompt}</span>
      ) : (
        <span className="v2-trash-hero__card-art">
          <Shape name={meta.shape} size={72} morph={false} />
          <Icon name={meta.icon} size={28} filled />
        </span>
      )}
    </span>
  );
}

export interface TrashHeroProps {
  /** Everything in the bin; null until it has loaded. */
  items: TrashItem[] | null;
  actions: ReactNode;
}

/** The bin's header: what it holds and the space it takes, the page actions, and the last things thrown in. */
export function TrashHero({ items, actions }: TrashHeroProps) {
  const { t, i18n } = useTranslation();
  const all = items ?? [];
  const cards = pile(all);
  const projectCount = new Set(all.map((item) => item.projectId)).size;
  const oldest = all.reduce<number | null>((min, item) => (min === null || item.deletedAt < min ? item.deletedAt : min), null);
  const bytesByKind = TRASH_KINDS.map((kind) => ({ kind, bytes: all.filter((item) => trashKind(item) === kind).reduce((sum, item) => sum + trashBytes(item), 0) })).filter(
    (entry): entry is { kind: TrashKind; bytes: number } => entry.bytes > 0,
  );
  const totalBytes = bytesByKind.reduce((sum, entry) => sum + entry.bytes, 0);

  return (
    <header className="v2-trash-hero">
      <Shape name="cookie-12" size={360} morph={false} className="v2-trash-hero__backdrop" />
      <div className="v2-trash-hero__main">
        <div className="v2-trash-hero__heading">
          <span className="v2-trash-hero__badge" aria-hidden>
            <Shape name="arch" size={64} morph={false} className="v2-trash-hero__badge-shape" />
            <Icon name="delete" size={30} filled className="v2-trash-hero__badge-icon" />
          </span>
          <div className="v2-trash-hero__titles">
            <Text as="span" variant="label-large" emphasized className="v2-trash-hero__kicker">
              {t('v2.shell.sections.manage')}
            </Text>
            <Text as="h1" variant="headline-large" emphasized className="v2-trash-hero__title">
              {t('trash.title')}
            </Text>
          </div>
        </div>
        <Text as="p" variant="body-large" className="v2-trash-hero__description">
          {t('trash.description')}
        </Text>
        {items && items.length > 0 && (
          <ul className="v2-trash-hero__stats">
            <li>
              <strong>{all.length.toLocaleString()}</strong> {t('v2.trash.statItems', { count: all.length })}
            </li>
            <li>
              <Icon name="folder" size={16} aria-hidden />
              <strong>{projectCount.toLocaleString()}</strong> {t('v2.trash.statProjects', { count: projectCount })}
            </li>
            {oldest !== null && (
              <li title={new Date(oldest).toLocaleString()}>
                <Icon name="history" size={16} aria-hidden />
                {t('v2.trash.statOldest', { time: timeAgo(oldest, i18n.language) })}
              </li>
            )}
          </ul>
        )}
        {totalBytes > 0 && (
          <div className="v2-trash-space">
            <div className="v2-trash-space__head">
              <strong>{formatBytes(totalBytes)}</strong>
              <span>{t('v2.trash.toFree')}</span>
            </div>
            <div className="v2-trash-space__bar" role="img" aria-label={bytesByKind.map((entry) => `${t(`v2.trash.kinds.${entry.kind}`)} ${formatBytes(entry.bytes)}`).join(', ')}>
              {bytesByKind.map((entry) => (
                <span key={entry.kind} data-kind={entry.kind} style={{ flexGrow: entry.bytes / totalBytes }} />
              ))}
            </div>
            {bytesByKind.length > 1 && (
              <ul className="v2-trash-space__legend" aria-hidden>
                {bytesByKind.map((entry) => (
                  <li key={entry.kind} data-kind={entry.kind}>
                    {t(`v2.trash.kinds.${entry.kind}`)} <strong>{formatBytes(entry.bytes)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="v2-trash-hero__actions">{actions}</div>
      </div>
      {items && (
        <figure className="v2-trash-hero__pile" data-empty={cards.length === 0 ? '' : undefined}>
          <div className="v2-trash-hero__cards" aria-hidden>
            {cards.map((item, index) => (
              <PileCard key={item.id} item={item} index={index} />
            ))}
          </div>
          {cards.length > 0 && (
            <figcaption className="v2-trash-hero__caption">
              <Text as="span" variant="label-small" className="v2-trash-hero__caption-label">
                {t('v2.trash.lastDeleted')}
              </Text>
              <Text as="span" variant="label-large" emphasized title={new Date(cards[0].deletedAt).toLocaleString()}>
                {timeAgo(cards[0].deletedAt, i18n.language)}
              </Text>
            </figcaption>
          )}
        </figure>
      )}
    </header>
  );
}
