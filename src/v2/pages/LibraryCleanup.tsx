import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteLibrary, fetchLibrary, fetchLibraryReferences, removeLibraryReferences } from '../../api';
import { Button, Icon, Text } from '../../m3';
import type { Library } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';

interface ProjectRef {
  id: string;
  name: string;
}

/** Unlinks a library from the projects that use it, then deletes it. */
export function LibraryCleanup() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [library, setLibrary] = useState<Library | null>(null);
  const [refs, setRefs] = useState<ProjectRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [cleaning, setCleaning] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [lib, references] = await Promise.all([fetchLibrary(id), fetchLibraryReferences(id)]);
        setLibrary(lib);
        setRefs(references);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const removeOne = async (projectId: string) => {
    if (!id) return;
    setRemoving((prev) => new Set(prev).add(projectId));
    try {
      await removeLibraryReferences(id, [projectId]);
      setRefs((prev) => prev.filter((p) => p.id !== projectId));
    } catch (e) {
      console.error('Failed to remove reference:', e);
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const deleteAfterClean = async () => {
    if (!id) return;
    setCleaning(true);
    try {
      await deleteLibrary(id);
      navigate('/libraries');
    } catch (e) {
      console.error('Failed to delete:', e);
      setCleaning(false);
    }
  };

  if (loading) return <LoadingState minHeight={400} />;
  if (!library) return <EmptyState icon="error" title={t('libraryCleanup.errorNotFound')} />;
  const clean = refs.length === 0;

  return (
    <Page width="default">
      <PageHeader
        title={t('libraryCleanup.title')}
        description={<Trans i18nKey="libraryCleanup.description" values={{ name: library.name }} components={{ span: <strong className="text-on-surface" /> }} />}
        backLink={{ to: `/library/${id}`, label: t('libraryCleanup.backToLibrary') }}
      />
      <div className="flex flex-col gap-4">
        {!clean && (
          <div className="v2-notice" data-tone="warning">
            <Icon name="warning" />
            <div className="flex flex-col gap-1">
              <Text variant="label-large" emphasized>
                {t('libraryCleanup.warning', { count: refs.length })}
              </Text>
              <Text variant="body-small">{t('libraryCleanup.warningDesc')}</Text>
            </div>
          </div>
        )}
        {clean ? (
          <EmptyState icon="link_off" shape="sunny" title={t('libraryCleanup.allCleared')} description={t('libraryCleanup.allClearedDesc')} />
        ) : (
          <RowList>
            {refs.map((project) => (
              <Row
                key={project.id}
                to={`/project/${project.id}`}
                lead={<Icon name="play_circle" className="text-primary" />}
                title={project.name}
                actions={
                  <Button variant="tonal" size="xs" icon="link_off" className="v2-button-danger" loading={removing.has(project.id)} disabled={cleaning} onClick={() => void removeOne(project.id)}>
                    {t('libraryCleanup.remove')}
                  </Button>
                }
              />
            ))}
          </RowList>
        )}
        <div className="v2-divider-row">
          {clean ? (
            <Button variant="filled" icon="delete" className="v2-button-danger" loading={cleaning} onClick={() => void deleteAfterClean()} fullWidth>
              {t('libraryCleanup.deleteLibrary')}
            </Button>
          ) : (
            <Button variant="filled" icon="delete_sweep" className="v2-button-danger" loading={cleaning} onClick={() => setConfirm(true)} fullWidth>
              {t('libraryCleanup.cleanAllAndDelete')}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={t('libraryCleanup.confirm.title')}
        message={t('libraryCleanup.confirm.message', { name: library.name, count: refs.length })}
        confirmLabel={t('libraryCleanup.confirm.confirmText')}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          if (!id) return;
          setCleaning(true);
          try {
            await removeLibraryReferences(id);
            await deleteLibrary(id);
            navigate('/libraries');
          } catch (e) {
            console.error('Failed to clean and delete:', e);
            setCleaning(false);
          }
        }}
      />
    </Page>
  );
}
