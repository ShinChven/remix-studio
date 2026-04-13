import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Library } from '../types';
import { Plus, Folder, LayoutGrid, Layers, ChevronRight, ChevronLeft, Loader2, Copy } from 'lucide-react';
import { duplicateLibrary, fetchLibraries } from '../api';
import { DuplicateLibraryDialog } from '../components/DuplicateLibraryDialog';
import { PageHeader } from '../components/PageHeader';
import { toast } from 'sonner';

export function Libraries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryToDuplicate, setLibraryToDuplicate] = useState<Library | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchLibraries(page, 20);
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
  }, [page]);

  const addLibrary = () => navigate('/library/new');

  const handleDuplicateLibrary = async (name: string) => {
    if (!libraryToDuplicate) return;

    try {
      const duplicated = await duplicateLibrary(libraryToDuplicate.id, name);
      const result = await fetchLibraries(page, 20);
      setLibraries(result.items);
      setTotal(result.total);
      setPages(result.pages);
      toast.success(`Copied "${libraryToDuplicate.name}"`);
      navigate(`/library/${duplicated.id}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to duplicate library');
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

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title="Libraries"
          description="Manage your reusable prompts and image collections."
        />

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-500" />
              All Libraries {total > 0 && <span className="text-sm text-neutral-500 font-normal">({total})</span>}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={addLibrary}
                className="text-xs md:text-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-blue-600/30 font-medium"
              >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Library</span><span className="sm:hidden">New</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {libraries.map(lib => (
                  <Link
                    key={lib.id}
                    to={`/library/${lib.id}`}
                    className="w-full bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/60 hover:border-blue-500/40 hover:bg-neutral-900/60 p-3 md:p-4 rounded-xl text-left transition-all group flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                      <div className={`flex-shrink-0 p-2 md:p-2.5 rounded-lg ${lib.type === 'image' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-blue-500/10 text-blue-500'} group-hover:scale-110 transition-transform`}>
                        {lib.type === 'image' ? <Layers className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="font-semibold text-white text-sm md:text-base truncate">{lib.name}</h4>
                        <div className="flex items-center gap-2 md:gap-3 mt-0.5 whitespace-nowrap overflow-hidden">
                          <span className="text-[10px] md:text-xs text-neutral-500 uppercase tracking-wider font-medium">{lib.type || 'text'}</span>
                          <span className="text-neutral-700">•</span>
                          <span className="text-[10px] md:text-xs text-neutral-400">{lib.items?.length || 0} items</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLibraryToDuplicate(lib);
                        }}
                        className="p-2 text-neutral-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all border border-transparent hover:border-blue-500/20"
                        title="Duplicate Library"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <span className="hidden sm:inline text-sm font-medium text-blue-500 opacity-100 transition-opacity">Open Editor →</span>
                      <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </Link>
                ))}

                {libraries.length === 0 && (
                  <div className="col-span-full py-16 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center justify-center gap-4 bg-neutral-900/20">
                    <Folder className="w-12 h-12 text-neutral-700" />
                    <div>
                      <p className="text-lg font-medium text-neutral-400">No libraries yet</p>
                      <p className="text-sm">Create one to store reusable prompts or images.</p>
                    </div>
                  </div>
                )}
              </div>
              
              {pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-8 pb-4">
                  <button
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-neutral-400 font-medium">Page {page} of {pages}</span>
                  <button
                    onClick={() => handlePageChange(Math.min(pages, page + 1))}
                    disabled={page === pages}
                    className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-colors"
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
