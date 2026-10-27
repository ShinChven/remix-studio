import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Button, Icon, Shape, Text } from '../../../m3';
import type { Library, LibraryItem } from '../../../types';
import { formatBytes, formatDate } from '../../lib/format';
import { kindMeta } from '../../ui/entityMeta';

/** One card of the cover stack: a picture, the start of a text, or a track's name. */
interface Cover {
  key: string;
  image?: string;
  title?: string;
  text?: string;
}

/** The three newest items, as cards for the cover stack. */
function covers(library: Library): Cover[] {
  const type = library.type || 'text';
  return [...library.items]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .map((item: LibraryItem): Cover | null => {
      if (type === 'text') return item.content ? { key: item.id, title: item.title, text: item.content } : null;
      if (type === 'audio') return { key: item.id, title: item.title || '' };
      const src = item.thumbnailUrl || (type === 'image' ? item.content : '');
      return src ? { key: item.id, image: imageDisplayUrl(src) } : null;
    })
    .filter((cover): cover is Cover => cover !== null)
    .slice(0, 3);
}

export interface LibraryHeroProps {
  library: Library;
  /** Items in the library, kept current by the page. */
  itemCount: number;
  /** The main action: upload, or a new prompt. */
  primary: ReactNode;
  /** Secondary actions after the main one. */
  actions: ReactNode;
}

/** The library's header: its kind shape, name and numbers, the actions, and a stack of its newest items. */
export function LibraryHero({ library, itemCount, primary, actions }: LibraryHeroProps) {
  const { t } = useTranslation();
  const type = library.type || 'text';
  const meta = kindMeta(type);
  const stack = covers(library);
  const tagCount = new Set(library.items.flatMap((item) => item.tags ?? [])).size;
  const totalSize = type === 'text' ? 0 : library.items.reduce((sum, item) => sum + (item.size ?? 0), 0);
  const updated = formatDate(library.updatedAt);

  return (
    <header className="v2-lib-hero" data-covers={stack.length > 0 ? '' : undefined}>
      <Shape name={meta.shape} size={320} morph={false} className="v2-lib-hero__backdrop" />
      <div className="v2-lib-hero__main">
        <Button variant="text" size="xs" icon="arrow_back" href="/libraries" className="v2-lib-hero__back">
          {t('nav.libraries', 'Libraries')}
        </Button>
        <div className="v2-lib-hero__heading">
          <span className="v2-lib-hero__badge" aria-hidden>
            <Shape name={meta.shape} size={64} morph={false} className="v2-lib-hero__badge-shape" />
            <Icon name={meta.icon} size={28} filled className="v2-lib-hero__badge-icon" />
          </span>
          <div className="v2-lib-hero__titles">
            <Text as="span" variant="label-large" emphasized className="v2-lib-hero__kicker">
              {t(`v2.library.kind.${type}`)}
            </Text>
            <Text as="h1" variant="headline-large" emphasized className="v2-lib-hero__title">
              {library.name}
            </Text>
          </div>
        </div>
        {library.description && (
          <Text as="p" variant="body-large" className="v2-lib-hero__description">
            {library.description}
          </Text>
        )}
        <ul className="v2-lib-hero__stats">
          <li>
            <strong>{itemCount.toLocaleString()}</strong> {t('v2.library.statItems', { count: itemCount })}
          </li>
          {tagCount > 0 && (
            <li>
              <strong>{tagCount.toLocaleString()}</strong> {t('v2.library.statTags', { count: tagCount })}
            </li>
          )}
          {totalSize > 0 && (
            <li>
              <strong>{formatBytes(totalSize)}</strong>
            </li>
          )}
          {updated && <li>{t('v2.library.updated', { date: updated })}</li>}
        </ul>
        <div className="v2-lib-hero__actions">
          {primary}
          {actions}
        </div>
      </div>
      {stack.length > 0 && (
        <div className="v2-lib-hero__covers" aria-hidden>
          {stack.map((cover, index) => (
            <span key={cover.key} className="v2-lib-hero__cover" data-index={index} data-kind={cover.image ? 'image' : type}>
              {cover.image ? (
                <img src={cover.image} alt="" referrerPolicy="no-referrer" decoding="async" />
              ) : type === 'audio' ? (
                <>
                  <span className="v2-lib-hero__cover-art">
                    <Shape name={meta.shape} size={72} morph={false} />
                    <Icon name={meta.icon} size={28} filled />
                  </span>
                  <span className="v2-lib-hero__cover-caption">{cover.title}</span>
                </>
              ) : (
                <span className="v2-lib-hero__cover-text">
                  {cover.title && <strong>{cover.title}</strong>}
                  {cover.text}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
