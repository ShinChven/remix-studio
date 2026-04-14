import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, FolderPlus, Library as LibraryIcon, Loader2, X, CheckSquare, Square, FileText, Video as VideoIcon } from 'lucide-react';
import { Library, ProjectType } from '../../types';
import { fetchLibraries, copyAlbumToLibrary } from '../../api';
import { toast } from 'sonner';

interface CopyToLibraryDialogProps {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  projectType?: ProjectType;
  itemIds: string[];
  onClose: () => void;
  onSuccess: (libraryId: string) => void;
}

export function CopyToLibraryDialog({
  isOpen,
  projectId,
  projectName,
  projectType = 'image',
  itemIds,
  onClose,
  onSuccess,
}: CopyToLibraryDialogProps) {
  const { t } = useTranslation();
  const isTextProject = projectType === 'text';
  const isVideoProject = projectType === 'video';
  const targetLibraryType = isTextProject ? 'text' : isVideoProject ? 'video' : 'image';
  const defaultLibraryName = `${projectName} ${
    isTextProject
      ? t('projectViewer.copyToLibrary.texts')
      : isVideoProject
        ? t('projectViewer.copyToLibrary.videos')
        : t('projectViewer.tabs.album')
  }`;
  const itemSummary = t(
    isTextProject
      ? 'projectViewer.copyToLibrary.textItemCount'
      : projectType === 'video'
        ? 'projectViewer.copyToLibrary.videoItemCount'
        : 'projectViewer.copyToLibrary.imageItemCount',
    { count: itemIds.length }
  );
  const AccentIcon = isTextProject ? FileText : isVideoProject ? VideoIcon : LibraryIcon;

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [newLibraryName, setNewLibraryName] = useState(defaultLibraryName);
  const [existingLibraries, setExistingLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [version, setVersion] = useState<'raw' | 'optimized'>('optimized');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void loadLibraries();
      setNewLibraryName(defaultLibraryName);
      setIsSubmitting(false);
    }
  }, [defaultLibraryName, isOpen, targetLibraryType]);

  const loadLibraries = async () => {
    setIsLoading(true);
    try {
      const result = await fetchLibraries(1, 100);
      const matchingLibraries = result.items.filter((lib) => lib.type === targetLibraryType);
      setExistingLibraries(matchingLibraries);
      if (matchingLibraries.length > 0) {
        setSelectedLibraryId((current) =>
          current && matchingLibraries.some((lib) => lib.id === current)
            ? current
            : matchingLibraries[0].id
        );
      } else {
        setSelectedLibraryId('');
        setMode('new');
      }
    } catch (err: any) {
      toast.error(t('projectViewer.copyToLibrary.loadLibrariesFailed', { message: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (mode === 'new' && !newLibraryName.trim()) {
      toast.error(t('projectViewer.copyToLibrary.enterLibraryName'));
      return;
    }

    if (mode === 'existing' && !selectedLibraryId) {
      toast.error(t('projectViewer.copyToLibrary.selectLibrary'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await copyAlbumToLibrary(projectId, {
        itemIds,
        version: isTextProject ? undefined : version,
        destinationLibraryId: mode === 'existing' ? selectedLibraryId : undefined,
        newLibraryName: mode === 'new' ? newLibraryName.trim() : undefined,
      });

      toast.success(
        mode === 'new'
          ? t('projectViewer.copyToLibrary.createdNewLibrary', { type: targetLibraryType, itemSummary })
          : t('projectViewer.copyToLibrary.copiedToLibrary', { itemSummary })
      );
      onSuccess(result.libraryId);
      onClose();
    } catch (err: any) {
      toast.error(t('projectViewer.copyToLibrary.copyFailed', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />

      <div
        className="relative w-full max-w-xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(820px,calc(100dvh-2rem))] overflow-hidden rounded-[24px] sm:rounded-[32px] border border-neutral-800 bg-neutral-900 shadow-[0_50px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950/30 p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="rounded-xl sm:rounded-2xl border border-blue-500/20 bg-blue-500/10 p-2.5 sm:p-3 text-blue-400">
              <AccentIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">{t('projectViewer.common.copyToLibrary')}</h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                {t('projectViewer.copyToLibrary.description', { itemSummary, type: targetLibraryType })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-neutral-500 transition-all hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-8 space-y-5 sm:space-y-8 overflow-y-auto">
          {/* Target Selection */}
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">{t('projectViewer.copyToLibrary.destination')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <button
                onClick={() => setMode('new')}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                  mode === 'new'
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50'
                }`}
              >
                <FolderPlus className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('projectViewer.copyToLibrary.createNew')}</span>
              </button>
              <button
                disabled={existingLibraries.length === 0}
                onClick={() => setMode('existing')}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                  mode === 'existing'
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50 disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
              >
                <LibraryIcon className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('projectViewer.copyToLibrary.addToExisting')}</span>
              </button>
            </div>

            {mode === 'new' ? (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <input
                  type="text"
                  value={newLibraryName}
                  onChange={(e) => setNewLibraryName(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 sm:px-5 py-3.5 sm:py-4 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                  placeholder={t('projectViewer.copyToLibrary.newLibraryName')}
                  autoFocus
                />
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                {isLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-600" />
                  </div>
                ) : (
                  <select
                    value={selectedLibraryId}
                    onChange={(e) => setSelectedLibraryId(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 sm:px-5 py-3.5 sm:py-4 text-sm text-white outline-none transition-all focus:border-blue-500/50"
                  >
                    {existingLibraries.map((lib) => (
                      <option key={lib.id} value={lib.id}>
                        {lib.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {!isTextProject && (
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">{t('projectViewer.copyToLibrary.versionToCopy')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <button
                  onClick={() => setVersion('optimized')}
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                    version === 'optimized'
                      ? 'bg-neutral-800 border-neutral-600 text-white'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50'
                  }`}
                >
                  {version === 'optimized' ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">{t('projectViewer.copyToLibrary.optimized')}</p>
                    <p className="text-[8px] text-neutral-500 mt-1 uppercase tracking-wider">{t('projectViewer.copyToLibrary.optimizedHint')}</p>
                  </div>
                </button>
                <button
                  onClick={() => setVersion('raw')}
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                    version === 'raw'
                      ? 'bg-neutral-800 border-neutral-600 text-white'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50'
                  }`}
                >
                  {version === 'raw' ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">{t('projectViewer.copyToLibrary.raw')}</p>
                    <p className="text-[8px] text-neutral-500 mt-1 uppercase tracking-wider">{t('projectViewer.copyToLibrary.rawHint')}</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 border-t border-neutral-800 bg-neutral-950/40 p-4 sm:p-6">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 sm:py-2.5 text-[10px] font-black uppercase tracking-widest text-neutral-400 transition-all hover:text-white border border-neutral-800/80 sm:border-transparent rounded-xl"
            disabled={isSubmitting}
          >
            {t('projectViewer.common.cancel')}
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || (mode === 'new' && !newLibraryName.trim()) || (mode === 'existing' && !selectedLibraryId)}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-blue-600 px-8 py-3.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('projectViewer.copyToLibrary.copying')}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                {t('projectViewer.common.copyToLibrary')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
