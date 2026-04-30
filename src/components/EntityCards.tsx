import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  Clock,
  Copy,
  HardDrive,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Music,
  Pin,
  Stars,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import { Library, Project, ProjectType } from '../types';

function getLibraryTypeMeta(type: Library['type'] | undefined) {
  switch (type) {
    case 'image':
      return {
        icon: ImageIcon,
        iconClassName: 'bg-green-500/10 text-green-500 shadow-green-500/5',
        borderClassName: 'hover:border-green-500/50',
        glowClassName: 'via-green-500/20',
      };
    case 'video':
      return {
        icon: Video,
        iconClassName: 'bg-purple-500/10 text-purple-500 shadow-purple-500/5',
        borderClassName: 'hover:border-purple-500/50',
        glowClassName: 'via-purple-500/20',
      };
    case 'audio':
      return {
        icon: Music,
        iconClassName: 'bg-cyan-500/10 text-cyan-500 shadow-cyan-500/5',
        borderClassName: 'hover:border-cyan-500/50',
        glowClassName: 'via-cyan-500/20',
      };
    case 'text':
    default:
      return {
        icon: Type,
        iconClassName: 'bg-blue-500/10 text-blue-500 shadow-blue-500/5',
        borderClassName: 'hover:border-blue-500/50',
        glowClassName: 'via-blue-500/20',
      };
  }
}

function getProjectTypeMeta(type: ProjectType | undefined) {
  switch (type) {
    case 'text':
      return {
        icon: Type,
        iconClassName: 'bg-blue-500/10 text-blue-500 shadow-blue-500/5',
        borderClassName: 'hover:border-blue-500/50',
        accentClassName: 'text-blue-500',
        glowClassName: 'via-blue-500/20',
        assetIcon: Type,
        assetLabel: 'texts',
      };
    case 'video':
      return {
        icon: Video,
        iconClassName: 'bg-purple-500/10 text-purple-500 shadow-purple-500/5',
        borderClassName: 'hover:border-purple-500/50',
        accentClassName: 'text-purple-500/80',
        glowClassName: 'via-purple-500/20',
        assetIcon: Video,
        assetLabel: 'videos',
      };
    case 'audio':
      return {
        icon: Music,
        iconClassName: 'bg-cyan-500/10 text-cyan-500 shadow-cyan-500/5',
        borderClassName: 'hover:border-cyan-500/50',
        accentClassName: 'text-cyan-500/80',
        glowClassName: 'via-cyan-500/20',
        assetIcon: Music,
        assetLabel: 'audios',
      };
    case 'image':
    default:
      return {
        icon: ImageIcon,
        iconClassName: 'bg-green-500/10 text-green-500 shadow-green-500/5',
        borderClassName: 'hover:border-green-500/50',
        accentClassName: 'text-green-500/80',
        glowClassName: 'via-green-500/20',
        assetIcon: ImageIcon,
        assetLabel: 'images',
      };
  }
}

function formatSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatCompactDateTime(value?: number) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ProjectCardProps {
  project: Project;
  isToggling?: boolean;
  onStartAssistantChat?: (project: Project) => void;
  onToggleArchive?: (project: Project) => void;
  onDuplicate?: (project: Project) => void;
}

export function ProjectCard({ project, isToggling = false, onStartAssistantChat, onToggleArchive, onDuplicate }: ProjectCardProps) {
  const { t } = useTranslation();
  const typeMeta = getProjectTypeMeta(project.type);
  const ProjectIcon = typeMeta.icon;
  const AssetIcon = typeMeta.assetIcon;
  const isArchived = project.status === 'archived';

  return (
    <Link
      to={`/project/${project.id}`}
      className={`bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl ${typeMeta.borderClassName} p-5 md:p-6 rounded-2xl text-left transition-all group relative overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 duration-300 ${isArchived ? 'opacity-75' : ''} flex min-h-[260px] flex-col`}
    >
      <div className="flex items-start justify-between mb-3 md:mb-4">
        <div className={`p-2.5 md:p-3 rounded-xl group-hover:scale-110 transition-transform shadow-lg ${typeMeta.iconClassName}`}>
          <ProjectIcon className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <div className="flex items-center gap-2">
          {onStartAssistantChat && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartAssistantChat(project);
              }}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-all"
              title={t('projects.projectCard.startAssistantChat', { defaultValue: 'Start assistant chat for this project' })}
              aria-label={t('projects.projectCard.startAssistantChat', { defaultValue: 'Start assistant chat for this project' })}
            >
              <Stars className="w-3.5 h-3.5" />
            </button>
          )}
          {onToggleArchive && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isToggling) onToggleArchive(project);
              }}
              disabled={isToggling}
              className={`p-1.5 rounded-lg transition-all ${isArchived ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-500/10' : 'text-neutral-500 hover:text-amber-500 hover:bg-amber-500/10'} disabled:opacity-50`}
              title={t(isArchived ? 'projects.unarchiveProject' : 'projects.archiveProject')}
            >
              {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDuplicate(project);
              }}
              className="p-1.5 text-neutral-500 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
              title={t('projectViewer.main.duplicateProject')}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-base md:text-lg font-semibold text-neutral-900 dark:text-white truncate">{project.name}</h4>
        {isArchived && (
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none shrink-0">
            <Archive className="w-2.5 h-2.5" />
            {t('projects.archivedBadge')}
          </span>
        )}
      </div>

      <div className="flex-1">
        {project.description && (
          <p className="line-clamp-2 min-h-10 text-sm leading-5 text-neutral-600 dark:text-neutral-400">
          {project.description}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-sm text-neutral-500 dark:text-neutral-500">
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="w-3.5 h-3.5 md:w-4 md:h-4" />
          <span className="font-bold">{t('projects.projectCard.jobs', { count: (project.jobCount ?? project.jobs?.length) || 0 })}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AssetIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
          <span className="font-bold">{t(`projects.projectCard.assets.${typeMeta.assetLabel}`, { count: (project.albumCount ?? project.album?.length) || 0 })}</span>
        </div>
        <div className={`flex items-center gap-1.5 font-medium ${typeMeta.accentClassName}`}>
          <HardDrive className="w-3.5 h-3.5 md:w-4 md:h-4" />
          <span className="font-bold">{formatSize(project.totalSize || 0)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
          <span className="truncate font-bold">{new Date(project.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent ${typeMeta.glowClassName} to-transparent opacity-100 transition-opacity`} />
    </Link>
  );
}

interface LibraryCardProps {
  library: Library;
  isCheckingRefs?: boolean;
  onTogglePin?: (library: Library) => void;
  onStartAssistantChat?: (library: Library) => void;
  onDuplicate?: (library: Library) => void;
  onDelete?: (library: Library) => void;
}

export function LibraryCard({ library, isCheckingRefs = false, onTogglePin, onStartAssistantChat, onDuplicate, onDelete }: LibraryCardProps) {
  const { t } = useTranslation();
  const typeMeta = getLibraryTypeMeta(library.type);
  const TypeIcon = typeMeta.icon;
  const isPinned = Boolean(library.pinnedAt);

  return (
    <Link
      to={`/library/${library.id}`}
      className={`${isPinned ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-500/20' : 'bg-white/70 dark:bg-neutral-900/70 border-neutral-200/50 dark:border-white/5'} border backdrop-blur-xl ${typeMeta.borderClassName} p-5 rounded-2xl text-left transition-all group relative overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 duration-300`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl group-hover:scale-105 transition-transform shadow-lg ${typeMeta.iconClassName}`}>
          <TypeIcon className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-1.5">
          {onTogglePin && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTogglePin(library);
              }}
              className="p-1.5 text-neutral-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
              title={isPinned ? t('libraries.libraryCard.unpin') : t('libraries.libraryCard.pin')}
            >
              {isPinned ? <Pin className="w-3.5 h-3.5" fill="currentColor" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          )}
          {onStartAssistantChat && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartAssistantChat(library);
              }}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-all"
              title={t('libraries.libraryCard.startAssistantChat', { defaultValue: 'Start assistant chat for this library' })}
              aria-label={t('libraries.libraryCard.startAssistantChat', { defaultValue: 'Start assistant chat for this library' })}
            >
              <Stars className="w-3.5 h-3.5" />
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDuplicate(library);
              }}
              className="p-1.5 text-neutral-500 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
              title={t('libraries.libraryCard.duplicate')}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(library);
              }}
              disabled={isCheckingRefs}
              className="p-1.5 text-neutral-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
              title={t('libraryEditor.deleteLibrary')}
            >
              {isCheckingRefs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      <h4 className="text-base font-bold text-neutral-900 dark:text-white truncate mb-2">{library.name}</h4>

      {library.description && (
        <p className="mb-4 line-clamp-2 min-h-10 text-sm leading-5 text-neutral-600 dark:text-neutral-400">
          {library.description}
        </p>
      )}

      <div className="flex items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500 dark:text-neutral-500">
        <div className="flex items-center gap-1.5 capitalize">
          <TypeIcon className="w-3.5 h-3.5" />
          <span>{library.type || 'text'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>{t('libraries.libraryCard.items', { count: library.itemCount ?? library.items?.length ?? 0 })}</span>
        </div>
        {library.updatedAt && (
          <div className="flex min-w-0 items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="truncate">{formatCompactDateTime(library.updatedAt)}</span>
          </div>
        )}
      </div>

      <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent ${typeMeta.glowClassName} to-transparent opacity-100 transition-opacity`} />
    </Link>
  );
}
