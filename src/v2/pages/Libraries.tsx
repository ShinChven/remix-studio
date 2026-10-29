import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteLibrary, duplicateLibrary, fetchLibraries, fetchLibraryReferences, setLibraryPinned } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { Button, Text, useSnackbar } from '../../m3';
import type { Library } from '../../types';
import { LibraryCard, LibraryRow } from '../components/EntityCards';
import { useViewPref } from '../lib/viewPrefs';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList } from '../ui/EntityList';
import { EmptyState, LoadingState, Page } from '../ui/Page';
import { PageHero } from '../ui/PageHero';
import { Pagination } from '../ui/Pagination';
import { PromptDialog } from '../ui/PromptDialog';
import { SearchField } from '../ui/SearchField';
import { CardGrid, ListToolbar, MobileFab, Segmented } from '../ui/Toolbar';

const MAX_PINNED_LIBRARIES = 6;
const LAYOUTS = ['cards', 'list'] as const;
type Layout = (typeof LAYOUTS)[number];

export function Libraries() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const q = searchParams.get('q') || '';
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [toDuplicate, setToDuplicate] = useState<Library | null>(null);
  const [toDelete, setToDelete] = useState<Library | null>(null);
  const [checkingRefs, setCheckingRefs] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const [layout, setLayout] = useViewPref<Layout>('v2.libraries.layout', 'cards', LAYOUTS);
  const loadSeq = useRef(0);

  const loadLibraries = async (silent = false) => {
    const seq = ++loadSeq.current;
    if (!silent) setIsLoading(true);
    try {
      const result = await fetchLibraries(page, 24, q);
      if (seq !== loadSeq.current) return;
      setLibraries(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (err) {
      console.error(err);
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLibraries();
    return () => {
      loadSeq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q]);

  useLiveRefresh((event) => event.resource === 'library', () => loadLibraries(true));

  const updateParams = (apply: (next: URLSearchParams) => void) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      apply(next);
      return next;
    });

  const handleTogglePin = async (lib: Library) => {
    const shouldPin = !lib.pinnedAt;
    if (shouldPin && libraries.filter((l) => l.pinnedAt).length >= MAX_PINNED_LIBRARIES) {
      snackbar.show(t('libraries.pinLimitReached', { max: MAX_PINNED_LIBRARIES }));
      return;
    }
    try {
      await setLibraryPinned(lib.id, shouldPin);
      await loadLibraries(true);
    } catch (error) {
      snackbar.show((error as Error).message || 'Failed to update pin state');
    }
  };

  const startAssistantChat = (l: Library) => {
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', { state: { draftBoundContexts: [{ id: l.id, name: l.name, type: 'library', subType: l.type || 'text' }] } });
  };

  const handleDeleteClick = async (lib: Library) => {
    setCheckingRefs(lib.id);
    try {
      const refs = await fetchLibraryReferences(lib.id);
      if (refs.length > 0) navigate(`/library/${lib.id}/cleanup`);
      else setToDelete(lib);
    } catch (error) {
      snackbar.show((error as Error).message || 'Failed to check library references');
    } finally {
      setCheckingRefs(null);
    }
  };

  return (
    <Page>
      <PageHero
        icon="folder"
        shape="cookie-6"
        title={t('libraries.title')}
        description={t('libraries.description')}
        actions={
          <Button variant="filled" icon="add" emphasized href="/library/new" className="v2-hide-compact">
            {t('libraries.newLibrary')}
          </Button>
        }
      />

      <ListToolbar title={t('libraries.allLibraries')} icon="grid_view" count={total}>
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t('libraries.searchPlaceholder')}
          onSubmit={(value) =>
            updateParams((next) => {
              if (value) next.set('q', value);
              else next.delete('q');
              next.set('page', '1');
            })
          }
        />
        <Segmented<Layout>
          aria-label={t('v2.library.layout')}
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'cards', label: t('v2.library.cards'), icon: 'grid_view' },
            { value: 'list', label: t('v2.library.list'), icon: 'view_agenda' },
          ]}
        />
      </ListToolbar>

      {isLoading ? (
        <LoadingState />
      ) : libraries.length === 0 ? (
        <EmptyState icon="folder" shape="cookie-6" title={t('libraries.noLibraries.title')} description={q ? t('libraries.noResultsFound') : t('libraries.noLibraries.description')} />
      ) : (
        <>
          {layout === 'cards' ? (
            <CardGrid min={260}>
              {libraries.map((lib) => (
                <LibraryCard
                  key={lib.id}
                  library={lib}
                  isCheckingRefs={checkingRefs === lib.id}
                  onTogglePin={handleTogglePin}
                  onStartAssistantChat={startAssistantChat}
                  onDuplicate={setToDuplicate}
                  onDelete={handleDeleteClick}
                />
              ))}
            </CardGrid>
          ) : (
            <div className="v2-erow-surface">
              <EntityList>
                {libraries.map((lib) => (
                  <LibraryRow
                    key={lib.id}
                    library={lib}
                    isCheckingRefs={checkingRefs === lib.id}
                    onTogglePin={handleTogglePin}
                    onStartAssistantChat={startAssistantChat}
                    onDuplicate={setToDuplicate}
                    onDelete={handleDeleteClick}
                  />
                ))}
              </EntityList>
            </div>
          )}
          {pages > 1 && (
            <div className="v2-page-footer">
              <Pagination page={page} pages={pages} onPageChange={(p) => updateParams((next) => next.set('page', String(p)))} size="sm" />
              <Text variant="label-small" className="uppercase tracking-widest">
                {t('projects.pagination', { current: page, total: pages })}
              </Text>
            </div>
          )}
        </>
      )}

      <MobileFab icon="add" label={t('libraries.newLibrary')} href="/library/new" />

      <PromptDialog
        open={toDuplicate !== null}
        icon="content_copy"
        title={t('libraries.duplicateDialog.title')}
        description={t('libraries.duplicateDialog.description')}
        label={t('libraries.duplicateDialog.placeholder')}
        initialValue={toDuplicate?.name || ''}
        confirmLabel={t('libraries.duplicateDialog.confirm')}
        cancelLabel={t('libraries.duplicateDialog.cancel')}
        onClose={() => setToDuplicate(null)}
        onConfirm={async (name) => {
          if (!toDuplicate) return;
          try {
            const duplicated = await duplicateLibrary(toDuplicate.id, name);
            await loadLibraries(true);
            snackbar.show(t('libraries.duplicateDialog.success', { name: toDuplicate.name }));
            navigate(`/library/${duplicated.id}`);
          } catch (error) {
            snackbar.show((error as Error).message || t('libraries.duplicateDialog.error'));
            throw error;
          }
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        tone="danger"
        title={t('libraryEditor.confirm.deleteLibrary.title')}
        message={t('libraryEditor.confirm.deleteLibrary.message', { name: toDelete?.name })}
        confirmLabel={t('libraryEditor.confirm.deleteLibrary.confirm')}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteLibrary(toDelete.id);
            snackbar.show(t('libraries.libraryCard.deleteSuccess', 'Library deleted successfully'));
            await loadLibraries(true);
          } catch (error) {
            snackbar.show((error as Error).message || 'Failed to delete library');
          }
        }}
      />
    </Page>
  );
}
