import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library } from '../types';
import { Plus, Folder, LayoutGrid, ChevronRight, ChevronLeft, Loader2, Copy, Search, ImageIcon, Type, Video, Music } from 'lucide-react';
import { duplicateLibrary, fetchLibraries } from '../api';
import { DuplicateLibraryDialog } from '../components/DuplicateLibraryDialog';
import { PageHeader } from '../components/PageHeader';
import { toast } from 'sonner';

function getLibraryTypeMeta(type: Library['type'] | undefined) {
  switch (type) {
    case 'image':
      return {
        icon: ImageIcon,
        iconClassName: 'bg-green-500/10 text-green-500 shadow-green-500/5',
        borderClassName: 'hover:border-green-500/50',
        accentClassName: 'text-green-500',
        glowClassName: 'via-green-500/20',
      };
    case 'video':
      return {
        icon: Video,
        iconClassName: 'bg-purple-500/10 text-purple-500 shadow-purple-500/5',
        borderClassName: 'hover:border-purple-500/50',
        accentClassName: 'text-purple-500',
        glowClassName: 'via-purple-500/20',
      };
    case 'audio':
      return {
        icon: Music,
        iconClassName: 'bg-cyan-500/10 text-cyan-500 shadow-cyan-500/5',
        borderClassName: 'hover:border-cyan-500/50',
        accentClassName: 'text-cyan-500',
        glowClassName: 'via-cyan-500/20',
      };
    case 'text':
    default:
      return {
        icon: Type,
        iconClassName: 'bg-blue-500/10 text-blue-500 shadow-blue-500/5',
        borderClassName: 'hover:border-blue-500/50',
        accentClassName: 'text-blue-500',
        glowClassName: 'via-blue-500/20',
      };
  }
}

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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-500" />
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
                  className="text-xs md:text-sm bg-blue-600 text-white hover:bg-blue-700 px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 border border-blue-700 font-black uppercase tracking-widest shadow-lg shadow-blue-600/10 active:scale-95"
                >
                  <Plus className="w-4 h-4" /> <span>{t('libraries.newLibrary')}</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {libraries.map(lib => {
                  const typeMeta = getLibraryTypeMeta(lib.type);
                  const TypeIcon = typeMeta.icon;
                  return (
                  <Link
                    key={lib.id}
                    to={`/library/${lib.id}`}
                    className={`bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl ${typeMeta.borderClassName} p-5 md:p-6 rounded-2xl text-left transition-all group relative overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 duration-300`}
                  >
                    <div className="flex items-start justify-between mb-3 md:mb-4">
                      <div className={`p-2.5 md:p-3 rounded-xl group-hover:scale-110 transition-transform shadow-lg ${typeMeta.iconClassName}`}>
                        <TypeIcon className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLibraryToDuplicate(lib);
                        }}
                        className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all border border-neutral-200 dark:border-neutral-700/50 bg-neutral-100/50 dark:bg-neutral-800/30"
                        title={t('libraries.libraryCard.duplicate')}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h4 className="text-base md:text-lg font-semibold text-neutral-900 dark:text-white truncate mb-2">{lib.name}</h4>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-sm text-neutral-500 dark:text-neutral-500 mb-4">
                      <div className="flex items-center gap-1.5 capitalize">
                        <TypeIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span>{lib.type || 'text'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span>{t('libraries.libraryCard.items', { count: lib.itemCount ?? lib.items?.length ?? 0 })}</span>
                      </div>
                    </div>

                    <div className={`pt-3 md:pt-4 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-end text-[10px] md:text-xs font-black uppercase tracking-widest opacity-100 transition-opacity ${typeMeta.accentClassName}`}>
                      {t('libraries.libraryCard.openEditor')}
                    </div>

                    <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent ${typeMeta.glowClassName} to-transparent opacity-100 transition-opacity`} />
                  </Link>
                )})}

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
    </div>
  );
}
