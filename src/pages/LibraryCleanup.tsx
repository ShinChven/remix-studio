import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Library } from '../types';
import {
  fetchLibrary,
  fetchLibraryReferences,
  removeLibraryReferences,
  deleteLibrary as apiDeleteLibrary,
} from '../api';
import { Loader2, Trash2, Unlink, AlertTriangle, Play, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';

interface ProjectRef {
  id: string;
  name: string;
}

export function LibraryCleanup() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [library, setLibrary] = useState<Library | null>(null);
  const [references, setReferences] = useState<ProjectRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [cleaningAll, setCleaningAll] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      const [lib, refs] = await Promise.all([
        fetchLibrary(id),
        fetchLibraryReferences(id),
      ]);
      setLibrary(lib);
      setReferences(refs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleRemoveSingle = async (projectId: string) => {
    if (!id) return;
    setRemovingIds((prev) => new Set(prev).add(projectId));
    try {
      await removeLibraryReferences(id, [projectId]);
      setReferences((prev) => prev.filter((p) => p.id !== projectId));
    } catch (e) {
      console.error('Failed to remove reference:', e);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleCleanAllAndDelete = async () => {
    if (!id) return;
    setCleaningAll(true);
    try {
      await removeLibraryReferences(id);
      await apiDeleteLibrary(id);
      navigate('/libraries');
    } catch (e) {
      console.error('Failed to clean and delete:', e);
      setCleaningAll(false);
    }
  };

  const handleDeleteAfterClean = async () => {
    if (!id) return;
    setCleaningAll(true);
    try {
      await apiDeleteLibrary(id);
      navigate('/libraries');
    } catch (e) {
      console.error('Failed to delete:', e);
      setCleaningAll(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (!library) {
    return <div className="p-8 text-neutral-500">Library not found.</div>;
  }

  const allCleaned = references.length === 0;

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        {/* Header */}
        <PageHeader
          title="Clean Up References"
          description={(
            <>
              Remove references to "<span className="text-white font-medium">{library.name}</span>" from projects before deleting.
            </>
          )}
          backLink={{ to: `/library/${id}`, label: 'Back to Library' }}
        />

        {/* Warning banner */}
        {!allCleaned && (
          <div className="flex items-start gap-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-400">
                {references.length} project{references.length > 1 ? 's' : ''} still referencing this library
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Remove references individually or use the button below to clean all and delete.
              </p>
            </div>
          </div>
        )}

        {/* Project list */}
        <div className="space-y-3">
          {references.map((project) => {
            const isRemoving = removingIds.has(project.id);
            return (
              <div
                key={project.id}
                className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-4 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Play className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm text-neutral-200 font-medium truncate">{project.name}</span>
                </div>
                <button
                  onClick={() => handleRemoveSingle(project.id)}
                  disabled={isRemoving || cleaningAll}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all border border-neutral-800 hover:border-red-500/20 disabled:opacity-50 flex-shrink-0"
                >
                  {isRemoving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" />
                  )}
                  Remove
                </button>
              </div>
            );
          })}

          {allCleaned && (
            <div className="py-12 border-2 border-dashed border-neutral-800 rounded-2xl text-center text-neutral-500 flex flex-col items-center justify-center gap-3 bg-neutral-900/20">
              <Unlink className="w-10 h-10 text-neutral-700" />
              <div>
                <p className="text-base font-medium text-neutral-400">All references cleared</p>
                <p className="text-sm text-neutral-600 mt-1">You can now safely delete this library.</p>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t border-neutral-800/50">
          {!allCleaned ? (
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={cleaningAll}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white shadow-2xl shadow-red-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {cleaningAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Clean All & Delete Library
            </button>
          ) : (
            <button
              onClick={handleDeleteAfterClean}
              disabled={cleaningAll}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white shadow-2xl shadow-red-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {cleaningAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete Library
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleCleanAllAndDelete}
        title="Clean All & Delete"
        message={`This will remove all references to "${library.name}" from ${references.length} project${references.length > 1 ? 's' : ''} and permanently delete the library. This action is irreversible.`}
        confirmText="Clean & Delete"
        type="danger"
      />
    </div>
  );
}
