import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Button, Dialog, Icon, IconButton, Shape, Text } from '../../../m3';
import type { TrashItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { kindMeta } from '../../ui/entityMeta';
import { DetailBlock, ParamTable } from '../project/JobDetails';
import { formatDuration } from './TrashGrid';
import { timeAgo, trashFilename, trashKind, trashTitle } from './trashMeta';

export interface TrashItemDialogProps {
  item: TrashItem | null;
  /** The items in view, for previous and next. */
  items: TrashItem[];
  onNavigate: (item: TrashItem) => void;
  onClose: () => void;
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
  onCopy: (text: string) => void;
  onProjectClick: (projectId: string) => void;
}

/** One deleted item up close: its picture, video, track or text beside what it is, where it came from and when it went. */
export function TrashItemDialog({ item, items, onNavigate, onClose, onRestore, onDelete, onCopy, onProjectClick }: TrashItemDialogProps) {
  const { t, i18n } = useTranslation();
  const index = item ? items.findIndex((other) => other.id === item.id) : -1;
  const previous = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  // Arrow keys page through the bin, unless a player or field has them.
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, video, audio, [contenteditable="true"]')) return;
      const target = e.key === 'ArrowLeft' ? previous : e.key === 'ArrowRight' ? next : null;
      if (!target) return;
      e.preventDefault();
      onNavigate(target);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, previous, next, onNavigate]);

  const kind = item ? trashKind(item) : 'image';
  const meta = kindMeta(kind);
  const orphan = item?.projectExists === false;

  const facts = item
    ? ([
        { label: t('v2.trash.facts.kind'), value: [t(`v2.trash.kind.${kind}`), item.format?.toUpperCase()].filter(Boolean).join(' · ') },
        { label: t('v2.trash.facts.deleted'), value: `${new Date(item.deletedAt).toLocaleString()} · ${timeAgo(item.deletedAt, i18n.language)}` },
        item.createdAt ? { label: t('v2.project.created'), value: new Date(item.createdAt).toLocaleString() } : null,
        kind !== 'text' ? { label: t('v2.project.filename'), value: trashFilename(item) } : null,
        item.aspectRatio ? { label: t('v2.trash.facts.aspectRatio'), value: item.aspectRatio } : null,
        item.resolution || item.quality ? { label: item.resolution ? t('v2.trash.facts.resolution') : t('v2.trash.facts.quality'), value: item.resolution || item.quality } : null,
        item.duration ? { label: t('v2.project.duration'), value: formatDuration(item.duration) } : null,
        item.size || item.optimizedSize || item.thumbnailSize
          ? {
              label: t('v2.project.fileSizes'),
              value: [
                item.size ? `${t('v2.trash.facts.original')} ${formatBytes(item.size)}` : null,
                item.optimizedSize ? `${t('v2.trash.facts.optimized')} ${formatBytes(item.optimizedSize)}` : null,
                item.thumbnailSize ? `${t('v2.trash.facts.thumbnail')} ${formatBytes(item.thumbnailSize)}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
            }
          : null,
        item.tags && item.tags.length > 0 ? { label: t('v2.trash.facts.tags'), value: item.tags.map((tag) => `#${tag}`).join('  ') } : null,
      ].filter(Boolean) as Array<{ label: string; value: ReactNode }>)
    : [];

  // The file may be gone already, with its project.
  const [missing, setMissing] = useState<string | null>(null);

  let preview: ReactNode = null;
  if (item) {
    if (missing === item.id) preview = <Icon name="broken_image" size={56} className="v2-trash-dialog__missing" />;
    else if (kind === 'image')
      preview = <img key={item.id} src={imageDisplayUrl(item.optimizedUrl || item.imageUrl)} alt={item.prompt} referrerPolicy="no-referrer" className="v2-trash-dialog__picture" onError={() => setMissing(item.id)} />;
    else if (kind === 'video')
      preview = <video key={item.id} src={imageDisplayUrl(item.imageUrl)} poster={item.thumbnailUrl ? imageDisplayUrl(item.thumbnailUrl) : undefined} controls autoPlay playsInline className="v2-trash-dialog__video" />;
    else if (kind === 'audio')
      preview = (
        <div className="v2-trash-dialog__track">
          <span className="v2-trash-dialog__art" aria-hidden>
            <Shape name={meta.shape} size={144} />
            <Icon name={meta.icon} size={48} filled />
          </span>
          <audio key={item.id} src={imageDisplayUrl(item.imageUrl)} controls autoPlay className="v2-media-player" />
        </div>
      );
    else preview = <div className="v2-trash-dialog__text">{item.textContent || item.prompt}</div>;
  }

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      icon={meta.icon}
      headline={item ? trashTitle(item) : undefined}
      fullScreen="compact"
      maxWidth={1040}
      className="v2-trash-dialog"
      actions={
        item && (
          <>
            <span className="v2-trash-dialog__nav">
              <IconButton icon="chevron_left" size="sm" label={`${t('projectViewer.imageLightbox.previous')} (←)`} tooltip disabled={!previous} onClick={() => previous && onNavigate(previous)} className="m3-mirror-rtl" />
              <Text as="span" variant="label-medium" className="v2-trash-dialog__counter">
                {index + 1} / {items.length}
              </Text>
              <IconButton icon="chevron_right" size="sm" label={`${t('projectViewer.imageLightbox.next')} (→)`} tooltip disabled={!next} onClick={() => next && onNavigate(next)} className="m3-mirror-rtl" />
            </span>
            <Button variant="text" icon="delete_forever" className="v2-button-danger" onClick={() => onDelete(item)}>
              {t('v2.trash.deleteForever')}
            </Button>
            <Button variant="filled" icon="restore" disabled={orphan} onClick={() => onRestore(item)}>
              {t('v2.trash.restore')}
            </Button>
          </>
        )
      }
    >
      {item && (
        <div className="v2-trash-dialog__body" data-kind={kind}>
          <div className="v2-trash-dialog__preview">{preview}</div>
          <div className="v2-trash-dialog__facts">
            <button
              type="button"
              className="v2-trash-dialog__project m3-focus-ring"
              data-orphan={orphan ? '' : undefined}
              title={t('v2.trash.showProject', { name: item.projectName })}
              onClick={() => onProjectClick(item.projectId)}
            >
              <Icon name={orphan ? 'folder_off' : 'folder'} size={20} filled={!orphan} />
              <span className="v2-trash-dialog__project-text">
                <Text as="span" variant="label-small" className="v2-trash-dialog__project-label">
                  {orphan ? t('v2.trash.projectGone') : t('v2.trash.facts.project')}
                </Text>
                <Text as="span" variant="title-small" emphasized className="truncate">
                  {item.projectName}
                </Text>
              </span>
              {!orphan && <Icon name="filter_list" size={18} className="v2-trash-dialog__project-go" />}
            </button>
            {orphan && (
              <Text as="p" variant="body-small" className="v2-trash-dialog__orphan">
                {t('v2.trash.orphanHint')}
              </Text>
            )}
            {item.prompt && kind !== 'text' && (
              <DetailBlock label={t('v2.trash.facts.prompt')}>
                <div className="v2-trash-dialog__prompt">
                  <Text as="p" variant="body-medium">
                    {item.prompt}
                  </Text>
                  <IconButton icon="content_copy" size="xs" label={t('v2.trash.copyPrompt')} tooltip onClick={() => onCopy(item.prompt)} />
                </div>
              </DetailBlock>
            )}
            {kind === 'text' && item.textContent && item.prompt && (
              <DetailBlock label={t('v2.trash.facts.prompt')}>
                <Text as="p" variant="body-small" className="v2-trash-dialog__prompt-text">
                  {item.prompt}
                </Text>
              </DetailBlock>
            )}
            <ParamTable label={t('v2.project.details')} rows={facts} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
