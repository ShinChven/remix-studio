import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Icon, IconButton, LoadingIndicator, Ripple, Text } from '../../../m3';
import type { Library, WorkflowItem } from '../../../types';
import type { ActionMenuItem } from '../../ui/ActionMenu';
import { FilePickButton, StepCard, type StepDragProps } from './StepCard';

export interface WorkflowStepProps extends StepDragProps {
  item: WorkflowItem;
  onRemove: (id: string) => void;
  onEdit: (item: WorkflowItem) => void;
  onPreviewLibrary: (library: Library) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onAudioUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  uploadingItemIds: Set<string>;
  onLightbox: (images: string[], index: number) => void;
  onSelectFromLibrary: (id: string) => void;
  onEditImage?: (item: WorkflowItem) => void;
  onChangeLibrary: (id: string) => void;
  onSaveToLibrary?: (item: WorkflowItem) => void;
  libraries: Library[];
  onToggleDisable?: (id: string) => void;
  gridView?: boolean;
  headerExtra?: ReactNode;
}

const ICONS: Record<string, string> = { text: 'notes', image: 'image', video: 'movie', audio: 'graphic_eq', library: 'auto_stories' };

/** One step of a regular workflow: text, reference media, or a library to draw from. */
export function WorkflowStep(props: WorkflowStepProps) {
  const { item, uploadingItemIds, libraries, onLightbox } = props;
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = uploadingItemIds.has(item.id);
  const library = item.type === 'library' ? libraries.find((l) => l.id === item.value) : null;
  const isMedia = item.type === 'image' || item.type === 'video' || item.type === 'audio';
  const typeLabel =
    item.type === 'text' ? t('projectViewer.common.text') : item.type === 'image' ? t('projectViewer.common.imageShort') : item.type === 'video' ? t('projectViewer.common.video') : item.type === 'audio' ? t('projectViewer.common.audio') : item.type === 'library' ? t('projectViewer.common.libraryShort') : item.type;
  const preview = () => onLightbox([imageDisplayUrl(item.optimizedUrl || item.value)], 0);
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => (item.type === 'video' ? props.onVideoUpload(e, item.id) : item.type === 'audio' ? props.onAudioUpload(e, item.id) : props.onImageUpload(e, item.id));

  const menu: ActionMenuItem[] = [
    { key: 'edit', hidden: item.type !== 'text', label: t('projectViewer.common.edit', { defaultValue: 'Edit' }), icon: 'edit', onSelect: () => props.onEdit(item) },
    { key: 'upload', hidden: !isMedia, disabled: busy, label: item.value ? t('v2.project.replaceFile') : t('projectViewer.common.upload'), icon: 'upload', onSelect: () => fileRef.current?.click() },
    { key: 'pick', hidden: item.type === 'library', label: t('projectViewer.workflow.pickFromLibrary'), icon: 'library_books', onSelect: () => props.onSelectFromLibrary(item.id) },
    { key: 'draw', hidden: item.type !== 'image' || !item.value || busy || !props.onEditImage, label: t('v2.project.editImage'), icon: 'draw', onSelect: () => props.onEditImage?.(item) },
    { key: 'save', hidden: (item.type !== 'text' && item.type !== 'image') || !item.value || busy || !props.onSaveToLibrary, label: t('projectViewer.workflow.saveToLibrary'), icon: 'bookmark_add', onSelect: () => props.onSaveToLibrary?.(item) },
    { key: 'preview', hidden: item.type !== 'library' || !library, label: t('v2.project.browseLibrary'), icon: 'filter_list', onSelect: () => library && props.onPreviewLibrary(library) },
    { key: 'change', hidden: item.type !== 'library', label: t('projectViewer.workflow.changeLibrary'), icon: 'swap_horiz', onSelect: () => props.onChangeLibrary(item.id) },
    { key: 'delete', divider: true, danger: true, label: t('projectViewer.common.delete', { defaultValue: 'Delete' }), icon: 'delete', onSelect: () => props.onRemove(item.id) },
  ];

  const actions = (
    <>
      {menu
        .filter((action) => !action.hidden && action.key !== 'delete')
        .map((action) => (
          <IconButton key={action.key} icon={action.icon!} size="xs" label={String(action.label)} tooltip disabled={action.disabled} onClick={action.onSelect} />
        ))}
      {props.onToggleDisable && (
        <IconButton
          icon={item.disabled ? 'visibility_off' : 'visibility'}
          size="xs"
          label={item.disabled ? t('projectViewer.workflow.enableItem', { defaultValue: 'Enable' }) : t('projectViewer.workflow.disableItem', { defaultValue: 'Disable' })}
          tooltip
          onClick={() => props.onToggleDisable!(item.id)}
        />
      )}
      <IconButton icon="delete" size="xs" className="v2-icon-danger" label={t('projectViewer.common.delete', { defaultValue: 'Delete' })} tooltip onClick={() => props.onRemove(item.id)} />
    </>
  );

  return (
    <StepCard
      {...props}
      icon={ICONS[item.type] || 'circle'}
      tone={item.type === 'library' ? 'tertiary' : item.type === 'text' ? 'primary' : 'secondary'}
      label={typeLabel}
      disabled={item.disabled}
      extra={
        <>
          {item.type === 'text' && item.value && (
            <Text as="span" variant="label-small" className="v2-step__hint">
              {t('projectViewer.workflow.characterCount', { count: item.value.length })}
            </Text>
          )}
          {props.headerExtra}
        </>
      }
      actions={actions}
    >
      {isMedia && <input ref={fileRef} type="file" accept={`${item.type}/*`} hidden disabled={busy} onChange={upload} />}
      {item.type === 'text' && (
        <button type="button" className="v2-step__text m3-focus-ring" onClick={() => props.onEdit(item)}>
          <Ripple />
          {item.value ? <span>{item.value}</span> : <em className="text-on-surface-variant">{t('projectViewer.workflow.noTextContent')}</em>}
        </button>
      )}
      {item.type === 'library' && (
        <button type="button" className="v2-step__library m3-focus-ring" onClick={() => library && props.onPreviewLibrary(library)}>
          <Ripple />
          <span className="v2-step__cover">
            {library?.type === 'image' && (library.items[0]?.content || library.coverUrl) ? <img src={library.items[0]?.content || library.coverUrl} alt="" /> : <Icon name="auto_stories" size={20} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-start">
            <Text as="span" variant="title-small" className="truncate">
              {library?.name || t('projectViewer.workflow.unknownLibrary')}
            </Text>
            <Text as="span" variant="body-small" className="text-on-surface-variant">
              {t('projectViewer.workflow.itemsCount', { count: library?.itemCount ?? library?.items.length ?? 0 })}
              {(item.selectedTags || []).length > 0 && <span className="text-primary"> · {(item.selectedTags || []).map((tag) => `#${tag}`).join(' ')}</span>}
            </Text>
          </span>
          <Icon name="chevron_right" size={18} className="text-on-surface-variant" />
        </button>
      )}
      {item.type === 'image' &&
        (busy ? (
          <div className="v2-step__media v2-step__media--empty">
            <LoadingIndicator />
          </div>
        ) : item.value ? (
          <button type="button" className="v2-step__media m3-focus-ring" onClick={preview} aria-label={t('projectViewer.common.preview', { defaultValue: 'Preview' })}>
            <img src={imageDisplayUrl(item.thumbnailUrl || item.value)} alt="Reference" />
          </button>
        ) : (
          <div className="v2-step__pick">
            <FilePickButton variant="tile" accept="image/*" icon="add_photo_alternate" label={t('projectViewer.common.upload')} onChange={(e) => props.onImageUpload(e, item.id)} />
            <button type="button" className="v2-file-pick v2-file-pick--tile m3-focus-ring" onClick={() => props.onSelectFromLibrary(item.id)}>
              <Icon name="photo_library" size={22} />
              <Text as="span" variant="label-medium">
                {t('projectViewer.common.library')}
              </Text>
            </button>
          </div>
        ))}
      {(item.type === 'video' || item.type === 'audio') &&
        (item.value && !busy ? (
          item.type === 'video' ? (
            <video src={imageDisplayUrl(item.value)} poster={item.thumbnailUrl ? imageDisplayUrl(item.thumbnailUrl) : undefined} controls className="v2-media-player" />
          ) : (
            <audio src={imageDisplayUrl(item.value)} controls className="w-full" />
          )
        ) : (
          <div className="v2-step__pick">
            <FilePickButton
              variant="tile"
              accept={item.type === 'video' ? 'video/*' : 'audio/*'}
              busy={busy}
              icon={item.type === 'video' ? 'movie' : 'graphic_eq'}
              label={busy ? t('projectViewer.workflow.wait') : t('projectViewer.common.upload')}
              onChange={upload}
            />
            <button type="button" className="v2-file-pick v2-file-pick--tile m3-focus-ring" onClick={() => props.onSelectFromLibrary(item.id)}>
              <Icon name="library_books" size={22} />
              <Text as="span" variant="label-medium">
                {t('projectViewer.common.library')}
              </Text>
            </button>
          </div>
        ))}
    </StepCard>
  );
}
