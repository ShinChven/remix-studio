import { useState, useRef, useEffect } from 'react';
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
  MoreHorizontal,
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
  onDelete?: (project: Project) => void;
}

export function ProjectCard({ project, isToggling = false, onStartAssistantChat, onToggleArchive, onDuplicate, onDelete }: ProjectCardProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeMeta = getProjectTypeMeta(project.type);
  const AssetIcon = typeMeta.assetIcon;
  const isArchived = project.status === 'archived';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.addEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const lastAlbumItem = project.album && project.album.length > 0 ? project.album[project.album.length - 1] : null;
  // Use thumbnail first to improve loading times on the project list view
  const bgImage = lastAlbumItem ? (lastAlbumItem.thumbnailUrl || lastAlbumItem.optimizedUrl || lastAlbumItem.imageUrl) : null;

  let bgClass = "bg-neutral-900";
  if (!bgImage) {
    switch (project.type) {
      case 'text': bgClass = "bg-blue-950"; break;
      case 'video': bgClass = "bg-purple-950"; break;
      case 'audio': bgClass = "bg-cyan-950"; break;
      case 'image': default: bgClass = "bg-emerald-950"; break;
    }
  }

  return (
    <Link
      to={`/project/${project.id}`}
      className={`group relative block h-[280px] rounded-[20px] overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-white/5 bg-neutral-900`}
    >
      {/* Background Image or Fallback */}
      {bgImage ? (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
      ) : (
        <div className={`absolute inset-0 opacity-40 transition-transform duration-700 group-hover:scale-105 bg-gradient-to-br from-transparent to-black/50 ${bgClass}`} />
      )}

      {/* Gradient & Blur Overlay */}
      <div 
        className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none transition-opacity duration-300 backdrop-blur-md bg-gradient-to-t from-black/80 via-black/30 to-transparent"
        style={{
          maskImage: 'linear-gradient(to top, black 20%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent 100%)'
        }}
      />

      {/* Archived Badge Top-Left */}
      {isArchived && (
        <div className="absolute top-4 left-4 z-20">
          <span className="flex items-center gap-1 bg-black/40 backdrop-blur-md text-white/90 border border-white/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest shadow-sm">
            <Archive className="w-3 h-3" />
            {t('projects.archivedBadge')}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end z-10 text-white">
        
        {/* Kicker */}
        <div className="text-[11px] font-medium uppercase tracking-wider text-white/60 mb-1 flex items-center gap-2">
          {project.type === 'image' ? 'IMAGE' : project.type === 'video' ? 'VIDEO' : project.type === 'audio' ? 'AUDIO' : 'TEXT'}
        </div>

        {/* Title */}
        <h4 className="text-xl md:text-2xl font-medium leading-tight mb-1.5 truncate text-white/95">
          {project.name}
        </h4>

        {/* Description */}
        {project.description ? (
          <p className="text-sm text-white/60 line-clamp-2 mb-4 leading-relaxed font-normal">
            {project.description}
          </p>
        ) : (
          <div className="mb-4" />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-white/50">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <AssetIcon className="w-4 h-4" />
            <span className="w-1 h-1 rounded-full bg-white/30" />
            <span>{t(`projects.projectCard.assets.${typeMeta.assetLabel}`, { count: (project.albumCount ?? project.album?.length) || 0 })}</span>
            {(project.totalSize || 0) > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span>{formatSize(project.totalSize || 0)}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onStartAssistantChat && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStartAssistantChat(project);
                }}
                className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors backdrop-blur-sm"
                title={t('projects.projectCard.startAssistantChat', { defaultValue: 'Start Assistant Chat' })}
              >
                <Stars className="w-4 h-4" />
              </button>
            )}

            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors backdrop-blur-sm"
                title={t('common.moreOptions', { defaultValue: 'More options' })}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {isMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 z-50 overflow-hidden text-sm animate-in fade-in slide-in-from-bottom-2">
                  {onDuplicate && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onDuplicate(project);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      {t('projectViewer.main.duplicateProject')}
                    </button>
                  )}
                  {onToggleArchive && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        if (!isToggling) onToggleArchive(project);
                      }}
                      disabled={isToggling}
                      className="w-full flex items-center gap-2 px-4 py-2 text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
                    >
                      {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      {t(isArchived ? 'projects.unarchiveProject' : 'projects.archiveProject')}
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onDelete(project);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('common.delete', { defaultValue: 'Delete' })}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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
      className={`${isPinned ? 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-200/60 dark:border-blue-500/30' : 'bg-white/80 dark:bg-neutral-900/40 border-neutral-200/50 dark:border-white/10'} border backdrop-blur-2xl ${typeMeta.borderClassName} p-6 rounded-[20px] text-left transition-all group relative overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 duration-300 flex flex-col h-full`}
    >
      <div className="flex items-start justify-between mb-6">
        <div className={`p-3 rounded-xl shadow-sm ${typeMeta.iconClassName}`}>
          <TypeIcon className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-1">
          {onTogglePin && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTogglePin(library);
              }}
              className="p-2 text-neutral-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-500/10 rounded-full transition-all"
              title={isPinned ? t('libraries.libraryCard.unpin') : t('libraries.libraryCard.pin')}
            >
              {isPinned ? <Pin className="w-4 h-4" fill="currentColor" /> : <Pin className="w-4 h-4" />}
            </button>
          )}
          {onStartAssistantChat && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartAssistantChat(library);
              }}
              className="p-2 text-neutral-500 hover:text-amber-500 hover:bg-amber-500/10 rounded-full transition-all"
              title={t('libraries.libraryCard.startAssistantChat')}
            >
              <Stars className="w-4 h-4" />
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDuplicate(library);
              }}
              className="p-2 text-neutral-500 hover:text-green-500 hover:bg-green-500/10 rounded-full transition-all"
              title={t('libraries.libraryCard.duplicate')}
            >
              <Copy className="w-4 h-4" />
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
              className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all disabled:opacity-50"
              title={t('libraryEditor.deleteLibrary')}
            >
              {isCheckingRefs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1">
        <h4 className="text-lg font-bold text-neutral-900 dark:text-white truncate mb-2">{library.name}</h4>
        {library.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 mb-4">
            {library.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] font-medium text-neutral-500 dark:text-neutral-500 mt-auto pt-4 border-t border-neutral-200/50 dark:border-white/5">
        <div className="flex items-center gap-1.5 uppercase tracking-wider">
          <TypeIcon className="w-3.5 h-3.5" />
          <span>{library.type || 'text'}</span>
        </div>
        <div className="flex items-center gap-1.5 uppercase tracking-wider">
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>{t('libraries.libraryCard.items', { count: library.itemCount ?? library.items?.length ?? 0 })}</span>
        </div>
      </div>
    </Link>
  );
}
