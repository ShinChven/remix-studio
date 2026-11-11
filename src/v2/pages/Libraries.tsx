import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { deleteLibrary, duplicateLibrary, fetchLibraries, fetchLibraryReferences, setLibraryPinned } from '../../api';
import { Button } from '../../m3';
import type { Library, LibraryType } from '../../types';
import { LibraryCard, LibraryRow } from '../components/EntityCards';
import { useAction } from '../lib/useAction';
import { useAssistantChat } from '../lib/useAssistantChat';
import { useAsyncData } from '../lib/useAsyncData';
import { CARD_PAGE_SIZES, useListParams } from '../lib/useListParams';
import { useViewPref } from '../lib/viewPrefs';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList } from '../ui/EntityList';
import { kindMeta } from '../ui/entityMeta';
import { SectionNav } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { Page } from '../ui/Page';
import { PageHero } from '../ui/PageHero';
import { PromptDialog } from '../ui/PromptDialog';
import { CardGrid, LayoutToggle, LIST_LAYOUTS, MobileFab, type ListLayout } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';

const MAX_PINNED_LIBRARIES = 6;
type TypeFilter = LibraryType | 'all';
const TYPE_FILTERS: readonly TypeFilter[] = ['all', 'text', 'image', 'video', 'audio'];
const TYPE_LABELS: Record<LibraryType, string> = { text: 'typeText', image: 'typeImage', video: 'typeVideo', audio: 'typeAudio' };

export function Libraries() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const startChat = useAssistantChat();
  const action = useAction();
  const list = useListParams({ pageSize: 24, pageSizes: CARD_PAGE_SIZES, defaults: { type: 'all' } });
  const type = list.oneOf('type', TYPE_FILTERS);
  const size = list.pageSize === 'all' ? 24 : list.pageSize;
  const [toDuplicate, setToDuplicate] = useState<Library | null>(null);
  const [toDelete, setToDelete] = useState<Library | null>(null);
  const [layout, setLayout] = useViewPref<ListLayout>('v2.libraries.layout', 'cards', LIST_LAYOUTS);

  const libraries = useAsyncData(() => fetchLibraries(list.page, size, list.q, false, false, false, type === 'all' ? undefined : type), [list.page, size, list.q, type], { live: (event) => event.resource === 'library' });
  const items = libraries.data?.items ?? [];
  const total = libraries.data?.total ?? 0;

  const togglePin = (lib: Library) => {
    const shouldPin = !lib.pinnedAt;
    if (shouldPin && items.filter((l) => l.pinnedAt).length >= MAX_PINNED_LIBRARIES) {
      toast.info(t('libraries.pinLimitReached', { max: MAX_PINNED_LIBRARIES }));
      return;
    }
    void action.run(
      async () => {
        await setLibraryPinned(lib.id, shouldPin);
        await libraries.reload(true);
      },
      { key: `pin:${lib.id}` },
    );
  };

  // A library still used by projects is cleaned up first; only an unused one is deleted outright.
  const askDelete = (lib: Library) =>
    void action.run(
      async () => {
        const refs = await fetchLibraryReferences(lib.id);
        if (refs.length > 0) navigate(`/library/${lib.id}/cleanup`);
        else setToDelete(lib);
      },
      { key: lib.id },
    );

  const cardProps = (lib: Library) => ({
    library: lib,
    isCheckingRefs: action.isBusy(lib.id),
    onTogglePin: togglePin,
    onStartAssistantChat: (l: Library) => startChat({ id: l.id, name: l.name, type: 'library', subType: l.type || 'text' }),
    onDuplicate: setToDuplicate,
    onDelete: askDelete,
  });

  return (
    <Page>
      <PageHero
        icon="folder"
        shape="cookie-6"
        title={t('libraries.title')}
        description={t('libraries.description')}
        actions={
          <Button variant="filled" icon="add" emphasized href="/library/new" className="v2-hide-mobile">
            {t('libraries.newLibrary')}
          </Button>
        }
      />

      <ListPane
        variant="flush"
        label={t('libraries.allLibraries')}
        lead={
          <SectionNav<TypeFilter>
            scope="libraries"
            label={t('libraryForm.typeLabel')}
            value={type}
            onChange={(value) => list.set({ type: value })}
            items={TYPE_FILTERS.map((value) => ({
              value,
              label: value === 'all' ? t('libraries.typeAll') : t(`libraryForm.${TYPE_LABELS[value]}`),
              icon: value === 'all' ? 'apps' : kindMeta(value).icon,
              count: value === type ? total : 0,
            }))}
          />
        }
        fitKey={type}
        tools={
          <>
            <ListSearch value={list.q} onChange={list.setQuery} label={t('libraries.searchPlaceholder')} />
            <LayoutToggle value={layout} onChange={setLayout} />
          </>
        }
        loading={libraries.loading}
        refreshing={libraries.refreshing}
        error={libraries.error}
        onRetry={() => void libraries.reload()}
        count={items.length}
        filtered={list.filtered}
        onClearFilters={list.clearFilters}
        empty={{
          icon: 'folder',
          shape: 'cookie-6',
          title: t('libraries.noLibraries.title'),
          description: t('libraries.noLibraries.description'),
          action: (
            <Button variant="filled" icon="add" href="/library/new">
              {t('libraries.newLibrary')}
            </Button>
          ),
        }}
        paging={{ page: list.page, pageSize: size, total, pages: libraries.data?.pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, pageSizes: CARD_PAGE_SIZES }}
      >
        {layout === 'cards' ? (
          <CardGrid min={260}>
            {items.map((lib) => (
              <LibraryCard key={lib.id} {...cardProps(lib)} />
            ))}
          </CardGrid>
        ) : (
          <div className="v2-erow-surface">
            <EntityList>
              {items.map((lib) => (
                <LibraryRow key={lib.id} {...cardProps(lib)} />
              ))}
            </EntityList>
          </div>
        )}
      </ListPane>

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
          const duplicated = await action.run(() => duplicateLibrary(toDuplicate.id, name), { key: `duplicate:${toDuplicate.id}`, success: t('libraries.duplicateDialog.success', { name: toDuplicate.name }), error: t('libraries.duplicateDialog.error'), rethrow: true });
          if (duplicated) navigate(`/library/${duplicated.id}`);
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
          await action.run(
            async () => {
              await deleteLibrary(toDelete.id);
              await libraries.reload(true);
            },
            { key: `delete:${toDelete.id}`, success: t('v2.libraryActions.libraryCard.deleteSuccess', 'Library deleted successfully'), rethrow: true },
          );
        }}
      />
    </Page>
  );
}
