import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library } from '../types';
import { Plus, Folder, LayoutGrid, ChevronRight, ChevronLeft, Loader2, Search } from 'lucide-react';
import { duplicateLibrary, fetchLibraries, setLibraryPinned, deleteLibrary, fetchLibraryReferences } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import type { BoundContext } from '../components/Assistant/AssistantComposer';
import { DuplicateLibraryDialog } from '../components/DuplicateLibraryDialog';
import { PageHeader } from '../components/PageHeader';
import { LibraryCard } from '../components/EntityCards';
import { toast } from 'sonner';

const MAX_PINNED_LIBRARIES = 6;

export function Libraries() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const q = searchParams.get('q') || '';

  const [libraries, setLibraries] = useState<Library[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryToDuplicate, setLibraryToDuplicate] = useState<Library | null>(null);
  const [libraryToDelete, setLibraryToDelete] = useState<Library | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCheckingRefs, setIsCheckingRefs] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);

  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchLibraries(page, 24, q);
        if (mounted) {
          setLibraries(result.items);
          setTotal(result.total);
          setPages(result.pages);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [page, q]);

  const addLibrary = () => navigate('/library/new');

  const handleDuplicateLibrary = async (name: string) => {
    if (!libraryToDuplicate) return;

    try {
      const duplicated = await duplicateLibrary(libraryToDuplicate.id, name);
      const result = await fetchLibraries(page, 24, q);
      setLibraries(result.items);
      setTotal(result.total);
      setPages(result.pages);
      toast.success(t('libraries.duplicateDialog.success', { name: libraryToDuplicate.name }));
      navigate(`/library/${duplicated.id}`);
    } catch (error: any) {
      toast.error(error.message || t('libraries.duplicateDialog.error'));
      throw error;
    }
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', newPage.toString());
      return next;
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const handleTogglePin = async (lib: Library) => {
    const shouldPin = !lib.pinnedAt;
    if (shouldPin) {
      const pinnedCount = libraries.filter(l => l.pinnedAt).length;
      if (pinnedCount >= MAX_PINNED_LIBRARIES) {
        toast.error(t('libraries.pinLimitReached', { max: MAX_PINNED_LIBRARIES }));
        return;
      }
    }
    try {
      await setLibraryPinned(lib.id, shouldPin);
      const result = await fetchLibraries(page, 24, q);
      setLibraries(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update pin state');
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (searchInput) {
          next.set('q', searchInput);
        } else {
          next.delete('q');
        }
        next.set('page', '1');
        return next;
      });
    }
  };

  const handleDeleteClick = async (lib: Library) => {
    setIsCheckingRefs(lib.id);
    try {
      const refs = await fetchLibraryReferences(lib.id);
      if (refs.length > 0) {
        navigate(`/library/${lib.id}/cleanup`);
      } else {
        setLibraryToDelete(lib);
        setShowDeleteModal(true);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to check library references');
    } finally {
      setIsCheckingRefs(null);
    }
  };

  const confirmDelete = async () => {
    if (!libraryToDelete) return;
    setIsDeleting(true);
    try {
      await deleteLibrary(libraryToDelete.id);
      toast.success(t('libraries.libraryCard.deleteSuccess', 'Library deleted successfully'));
      // Refresh list
      const result = await fetchLibraries(page, 24, q);
      setLibraries(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete library');
    } finally {
      setIsDeleting(false);
      setLibraryToDelete(null);
    }
  };

  const handleStartAssistantChat = (lib: Library) => {
    const libraryContext: BoundContext = {
      id: lib.id,
      name: lib.name,
      type: 'library',
      subType: lib.type || 'text',
    };

    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', {
      state: {
        draftBoundContexts: [libraryContext],
      },
    });
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={t('libraries.title')}
          description={t('libraries.description')}
        />

        <section>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 md:mb-8">
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-500" />
              {t('libraries.allLibraries')} {total > 0 && <span className="text-sm text-neutral-500 dark:text-neutral-500 font-normal">({total})</span>}
            </h3>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search Input */}
              <div className="relative flex-1 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-500" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={t('libraries.searchPlaceholder')}
                    className="w-full bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all shadow-sm"
                  />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addLibrary}
                  className="p-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-all flex items-center justify-center border border-blue-700 shadow-lg shadow-blue-600/10 active:scale-95"
                  title={t('libraries.newLibrary')}
                  aria-label={t('libraries.newLibrary')}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {libraries.map(lib => (
                  <LibraryCard
                    key={lib.id}
                    library={lib}
                    isCheckingRefs={isCheckingRefs === lib.id}
                    onTogglePin={handleTogglePin}
                    onStartAssistantChat={handleStartAssistantChat}
                    onDuplicate={setLibraryToDuplicate}
                    onDelete={handleDeleteClick}
                  />
                ))}

                {libraries.length === 0 && (
                  <div className="col-span-full py-20 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-900/20 shadow-sm">
                    <div className="p-4 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm">
                      <Folder className="w-8 h-8 text-neutral-700" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-neutral-600 dark:text-neutral-400 tracking-tight">{t('libraries.noLibraries.title')}</p>
                      <p className="text-sm mt-1">{q ? t('libraries.noResultsFound') : t('libraries.noLibraries.description')}</p>
                    </div>
                  </div>
                )}
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-8 pb-4">
                  <button
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('projects.pagination', { current: page, total: pages })}</span>
                  <button
                    onClick={() => handlePageChange(Math.min(pages, page + 1))}
                    disabled={page === pages}
                    className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <DuplicateLibraryDialog
        isOpen={libraryToDuplicate !== null}
        currentName={libraryToDuplicate?.name || ''}
        onClose={() => setLibraryToDuplicate(null)}
        onConfirm={handleDuplicateLibrary}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title={t('libraryEditor.confirm.deleteLibrary.title')}
        message={t('libraryEditor.confirm.deleteLibrary.message', { name: libraryToDelete?.name })}
        confirmText={t('libraryEditor.confirm.deleteLibrary.confirm')}
        type="danger"
      />
    </div>
  );
}
