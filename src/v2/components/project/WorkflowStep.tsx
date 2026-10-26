import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Icon, IconButton, LoadingIndicator, Ripple, Text } from '../../../m3';
import type { Library, WorkflowItem } from '../../../types';
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

const ICONS: Record<string, string> = { text: 'text_fields', image: 'image', video: 'movie', audio: 'graphic_eq', library: 'library_books' };

/** One step of a regular workflow: text, reference media, or a library to draw from. */
export function WorkflowStep(props: WorkflowStepProps) {
  const { item, uploadingItemIds, libraries, onLightbox } = props;
  const { t } = useTranslation();
  const busy = uploadingItemIds.has(item.id);
  const library = item.type === 'library' ? libraries.find((l) => l.id === item.value) : null;
  const saveLabel = t('projectViewer.workflow.saveToLibrary', { defaultValue: 'Save to Library' });
  const typeLabel =
    item.type === 'text' ? t('projectViewer.common.text') : item.type === 'image' ? t('projectViewer.common.imageShort') : item.type === 'video' ? t('projectViewer.common.video') : item.type === 'audio' ? t('projectViewer.common.audio') : item.type === 'library' ? t('projectViewer.common.libraryShort') : item.type;
  const preview = () => onLightbox([imageDisplayUrl(item.optimizedUrl || item.value)], 0);

  const actions = (
    <>
      {item.type === 'text' && (
        <>
          <IconButton icon="library_books" size="xs" label={t('projectViewer.workflow.pickFromLibrary')} tooltip onClick={() => props.onSelectFromLibrary(item.id)} />
          {props.onSaveToLibrary && item.value && <IconButton icon="bookmark_add" size="xs" label={saveLabel} tooltip onClick={() => props.onSaveToLibrary!(item)} />}
        </>
      )}
      {item.type === 'image' && (
        <>
          <FilePickButton accept="image/*" busy={busy} icon="upload" label={busy ? t('projectViewer.workflow.wait') : t('projectViewer.common.upload')} onChange={(e) => props.onImageUpload(e, item.id)} />
          <IconButton icon="library_books" size="xs" label={t('projectViewer.common.library')} tooltip onClick={() => props.onSelectFromLibrary(item.id)} />
          {item.value && !busy && props.onEditImage && <IconButton icon="draw" size="xs" label={t('projectViewer.common.edit', { defaultValue: 'Edit' })} tooltip onClick={() => props.onEditImage!(item)} />}
          {item.value && !busy && props.onSaveToLibrary && <IconButton icon="bookmark_add" size="xs" label={saveLabel} tooltip onClick={() => props.onSaveToLibrary!(item)} />}
        </>
      )}
      {item.type === 'library' && <IconButton icon="swap_horiz" size="xs" label={t('projectViewer.workflow.changeLibrary')} tooltip onClick={() => props.onChangeLibrary(item.id)} />}
      {props.onToggleDisable && (
        <IconButton
          icon={item.disabled ? 'visibility_off' : 'visibility'}
          size="xs"
          label={item.disabled ? t('projectViewer.workflow.enableItem', { defaultValue: 'Enable' }) : t('projectViewer.workflow.disableItem', { defaultValue: 'Disable' })}
          tooltip
          onClick={() => props.onToggleDisable!(item.id)}
        />
      )}
      <IconButton icon="delete" size="xs" label={t('projectViewer.common.delete', { defaultValue: 'Delete' })} tooltip onClick={() => props.onRemove(item.id)} />
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
          {item.type === 'text' && (
            <Text as="span" variant="label-small" className="text-on-surface-variant">
              {t('projectViewer.workflow.characterCount', { count: item.value.length })}
            </Text>
          )}
          {props.headerExtra}
        </>
      }
      actions={actions}
    >
      {item.type === 'text' && (
        <button type="button" className="v2-step__text m3-focus-ring" onClick={() => props.onEdit(item)}>
          <Ripple />
          {item.value ? <span>{item.value}</span> : <em className="text-on-surface-variant">{t('projectViewer.workflow.noTextContent')}</em>}
          <Icon name="open_in_full" size={16} className="v2-step__text-expand" />
        </button>
      )}
      {item.type === 'library' && (
        <button type="button" className="v2-step__library m3-focus-ring" onClick={() => library && props.onPreviewLibrary(library)}>
          <Ripple />
          <span className="v2-pick-card__media">
            {library?.type === 'image' && (library.items[0]?.content || library.coverUrl) ? <img src={library.items[0]?.content || library.coverUrl} alt="" /> : <Icon name="library_books" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-start">
            <Text as="span" variant="title-small" emphasized className="truncate">
              {library?.name || t('projectViewer.workflow.unknownLibrary')}
            </Text>
            <Text as="span" variant="label-small" className="text-on-surface-variant">
              {t('projectViewer.workflow.itemsCount', { count: library?.itemCount ?? library?.items.length ?? 0 })}
              {(item.selectedTags || []).length > 0 && <span className="text-primary"> · {t('projectViewer.workflow.filteredTags', { count: (item.selectedTags || []).length })}</span>}
            </Text>
          </span>
          <Icon name="open_in_full" size={16} className="text-on-surface-variant" />
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
          <FilePickButton variant="tile" accept="image/*" icon="add_photo_alternate" label={t('projectViewer.common.upload')} onChange={(e) => props.onImageUpload(e, item.id)} />
        ))}
      {(item.type === 'video' || item.type === 'audio') && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <FilePickButton
              variant="tile"
              accept={item.type === 'video' ? 'video/*' : 'audio/*'}
              busy={busy}
              icon={item.type === 'video' ? 'movie' : 'graphic_eq'}
              label={busy ? t('projectViewer.workflow.wait') : `${t('projectViewer.common.upload')} ${item.type === 'video' ? t('projectViewer.common.video') : t('projectViewer.common.audio')}`}
              onChange={(e) => (item.type === 'video' ? props.onVideoUpload(e, item.id) : props.onAudioUpload(e, item.id))}
            />
            <button type="button" className="v2-file-pick v2-file-pick--tile m3-focus-ring" onClick={() => props.onSelectFromLibrary(item.id)}>
              <Icon name="library_books" size={24} />
              <Text as="span" variant="label-medium">
                {t('projectViewer.common.library')}
              </Text>
            </button>
          </div>
          {item.value && !busy && (item.type === 'video' ? <video src={imageDisplayUrl(item.value)} poster={item.thumbnailUrl ? imageDisplayUrl(item.thumbnailUrl) : undefined} controls className="v2-media-player" /> : <audio src={imageDisplayUrl(item.value)} controls className="w-full" />)}
        </div>
      )}
    </StepCard>
  );
}
