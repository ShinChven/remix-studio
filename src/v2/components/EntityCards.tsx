import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { projectMediaType } from '../../lib/project-media';
import { AssistChip, Card, CardActionArea, Icon, IconButton, Text } from '../../m3';
import type { Library, Project } from '../../types';
import { formatBytes } from '../lib/format';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { EntityRow } from '../ui/EntityList';
import { kindMeta } from '../ui/entityMeta';
import { KindBadge } from '../ui/KindBadge';
import { MediaCard } from '../ui/MediaCard';

const ASSET_LABEL: Record<string, string> = {
  text: 'texts',
  video: 'videos',
  audio: 'audios',
  image: 'images',
  comfyui: 'images',
  civitai: 'images',
};

function projectKicker(project: Project): string {
  switch (project.type) {
    case 'image':
      return 'IMAGE';
    case 'video':
      return 'VIDEO';
    case 'audio':
      return 'AUDIO';
    case 'comfyui':
      return 'COMFYUI';
    case 'civitai':
      return projectMediaType(project) === 'video' ? 'CIVITAI · VIDEO' : 'CIVITAI';
    default:
      return 'TEXT';
  }
}

export interface ProjectCardProps {
  project: Project;
  isToggling?: boolean;
  isExporting?: boolean;
  onStartAssistantChat?: (project: Project) => void;
  onToggleArchive?: (project: Project) => void;
  onDuplicate?: (project: Project) => void;
  onExportBundle?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

export function ProjectCard({ project, isToggling, isExporting, onStartAssistantChat, onToggleArchive, onDuplicate, onExportBundle, onDelete }: ProjectCardProps) {
  const { t } = useTranslation();
  const meta = kindMeta(project.type);
  const isArchived = project.status === 'archived';
  const last = project.album && project.album.length > 0 ? project.album[project.album.length - 1] : null;
  const image = last?.thumbnailUrl || last?.optimizedUrl || (projectMediaType(project) === 'image' ? last?.imageUrl : null);
  const count = (project.albumCount ?? project.album?.length) || 0;
  const assetIcon = kindMeta(projectMediaType(project)).icon;

  return (
    <MediaCard
      href={`/project/${project.id}`}
      image={image}
      seed={project.id}
      kicker={
        <>
          <KindBadge kind={project.type ?? 'image'} size={24} tone="solid" />
          {projectKicker(project)}
        </>
      }
      title={project.name}
      description={project.description}
      badge={
        isArchived ? (
          <span className="v2-scrim-chip">
            <Icon name="archive" size={14} />
            {t('projects.archivedBadge')}
          </span>
        ) : undefined
      }
      meta={
        <>
          <Icon name={assetIcon} size={16} />
          <span>{t(`projects.projectCard.assets.${ASSET_LABEL[project.type ?? 'image'] ?? 'images'}`, { count })}</span>
          {(project.totalSize || 0) > 0 && (
            <>
              <span className="v2-dot" />
              <span>{formatBytes(project.totalSize)}</span>
            </>
          )}
        </>
      }
      actions={
        <>
          {onStartAssistantChat && (
            <IconButton
              icon="auto_awesome"
              label={t('projects.projectCard.startAssistantChat', { defaultValue: 'Start Assistant Chat' })}
              tooltip
              size="xs"
              className="v2-on-scrim"
              onClick={() => onStartAssistantChat(project)}
            />
          )}
          <ActionMenu
            label={t('common.moreOptions', { defaultValue: 'More options' })}
            icon="more_horiz"
            size="xs"
            className="v2-on-scrim"
            placement="top-end"
            items={[
              { key: 'duplicate', icon: 'content_copy', label: t('projectViewer.main.duplicateProject'), onSelect: () => onDuplicate?.(project), hidden: !onDuplicate },
              {
                key: 'export',
                icon: 'package_2',
                label: t('projects.exportBundle.action'),
                onSelect: () => onExportBundle?.(project),
                disabled: isExporting,
                hidden: !onExportBundle,
              },
              {
                key: 'archive',
                icon: isArchived ? 'unarchive' : 'archive',
                label: t(isArchived ? 'projects.unarchiveProject' : 'projects.archiveProject'),
                onSelect: () => onToggleArchive?.(project),
                disabled: isToggling,
                hidden: !onToggleArchive,
              },
              { key: 'delete', icon: 'delete', label: t('common.delete', { defaultValue: 'Delete' }), onSelect: () => onDelete?.(project), danger: true, divider: true, hidden: !onDelete },
            ]}
          />
        </>
      }
      className={meta.accent}
    />
  );
}

export interface LibraryCardProps {
  library: Library;
  isCheckingRefs?: boolean;
  onTogglePin?: (library: Library) => void;
  onStartAssistantChat?: (library: Library) => void;
  onDuplicate?: (library: Library) => void;
  onDelete?: (library: Library) => void;
}

export function LibraryCard({ library, isCheckingRefs, onTogglePin, onStartAssistantChat, onDuplicate, onDelete }: LibraryCardProps) {
  const { t } = useTranslation();
  const meta = kindMeta(library.type);
  const isPinned = Boolean(library.pinnedAt);
  const count = library.itemCount ?? library.items?.length ?? 0;

  return (
    <Card variant={isPinned ? 'filled' : 'elevated'} className="v2-library-card" data-pinned={isPinned ? '' : undefined}>
      <CardActionArea href={`/library/${library.id}`}>
        <div className="v2-library-card__body">
          <KindBadge kind={library.type || 'text'} size={48} />
          <div className="min-w-0 flex-1">
            <Text as="h3" variant="title-medium" emphasized className="truncate">
              {library.name}
            </Text>
            {library.description && (
              <Text as="p" variant="body-small" className="mt-1 line-clamp-2 text-on-surface-variant">
                {library.description}
              </Text>
            )}
          </div>
          <div className="v2-library-card__meta">
            <AssistChip label={library.type || 'text'} icon={meta.icon} tabIndex={-1} />
            <Text as="span" variant="label-medium" className="text-on-surface-variant">
              {t('libraries.libraryCard.items', { count })}
            </Text>
          </div>
        </div>
      </CardActionArea>
      <div className="v2-library-card__actions">
        {onTogglePin && (
          <IconButton
            icon="push_pin"
            label={isPinned ? t('libraries.libraryCard.unpin') : t('libraries.libraryCard.pin')}
            tooltip
            size="xs"
            selected={isPinned}
            onClick={() => onTogglePin(library)}
          />
        )}
        {onStartAssistantChat && (
          <IconButton icon="auto_awesome" label={t('libraries.libraryCard.startAssistantChat')} tooltip size="xs" onClick={() => onStartAssistantChat(library)} />
        )}
        {(onDuplicate || onDelete) && (
          <ActionMenu
            label={t('common.moreOptions', { defaultValue: 'More options' })}
            size="xs"
            items={[
              { key: 'duplicate', icon: 'content_copy', label: t('libraries.libraryCard.duplicate'), onSelect: () => onDuplicate?.(library), hidden: !onDuplicate },
              {
                key: 'delete',
                icon: 'delete',
                label: t('libraryEditor.deleteLibrary'),
                onSelect: () => onDelete?.(library),
                disabled: isCheckingRefs,
                danger: true,
                hidden: !onDelete,
              },
            ]}
          />
        )}
      </div>
    </Card>
  );
}

/** A library as a row: the same actions as `LibraryCard`, all in its menu. */
export function LibraryRow({ library, isCheckingRefs, onTogglePin, onStartAssistantChat, onDuplicate, onDelete }: LibraryCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isPinned = Boolean(library.pinnedAt);
  const count = library.itemCount ?? library.items?.length ?? 0;
  const kind = library.type || 'text';
  const menuItems: ActionMenuItem[] = [
    { key: 'open', icon: 'arrow_forward', label: t('v2.providers.open'), onSelect: () => navigate(`/library/${library.id}`) },
    { key: 'pin', icon: 'push_pin', label: isPinned ? t('libraries.libraryCard.unpin') : t('libraries.libraryCard.pin'), onSelect: () => onTogglePin?.(library), hidden: !onTogglePin },
    { key: 'assistant', icon: 'auto_awesome', label: t('libraries.libraryCard.startAssistantChat'), onSelect: () => onStartAssistantChat?.(library), hidden: !onStartAssistantChat },
    { key: 'duplicate', icon: 'content_copy', label: t('libraries.libraryCard.duplicate'), onSelect: () => onDuplicate?.(library), hidden: !onDuplicate, divider: true },
    { key: 'delete', icon: 'delete', label: t('libraryEditor.deleteLibrary'), onSelect: () => onDelete?.(library), disabled: isCheckingRefs, danger: true, hidden: !onDelete },
  ];
  return (
    <EntityRow
      lead={() => <KindBadge kind={kind} size={44} />}
      title={library.name}
      badges={isPinned ? <Icon name="push_pin" size={16} filled className="text-primary" aria-label={t('libraries.libraryCard.unpin')} /> : undefined}
      subtitle={library.description || undefined}
      cells={[
        {
          key: 'type',
          width: '120px',
          drop: 3,
          children: (
            <span className="v2-erow__value">
              <Icon name={kindMeta(kind).icon} size={16} aria-hidden />
              {kind}
            </span>
          ),
        },
        { key: 'items', width: '110px', narrow: 'below', children: <span className="v2-erow__value">{t('libraries.libraryCard.items', { count })}</span> },
      ]}
      onOpen={() => navigate(`/library/${library.id}`)}
      ariaLabel={library.name}
      menuLabel={t('common.moreOptions', { defaultValue: 'More options' })}
      menuItems={menuItems}
    />
  );
}

export interface CampaignCardProps {
  campaign: { id: string; name: string; description?: string | null; status?: string; posts?: Array<{ media?: Array<{ thumbnailUrl?: string; url?: string }> }> };
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const post = (campaign.posts || []).find((p) => p.media && p.media.length > 0);
  const image = post?.media?.[0]?.thumbnailUrl || post?.media?.[0]?.url || null;
  return (
    <MediaCard
      href={`/campaigns/${campaign.id}`}
      image={image}
      seed={campaign.id}
      kicker={campaign.status === 'active' ? 'Active' : 'Paused'}
      title={campaign.name}
      description={campaign.description || 'Campaign'}
    />
  );
}
