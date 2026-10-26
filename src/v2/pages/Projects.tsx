import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteProject, fetchProjects, startProjectBundleExport, updateProject } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { IconButton, Text, useSnackbar } from '../../m3';
import type { Project } from '../../types';
import { ProjectCard } from '../components/EntityCards';
import { ProjectFormDialog } from '../components/ProjectFormDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { SearchField } from '../ui/SearchField';
import { CardGrid, ListToolbar, MobileFab, Segmented } from '../ui/Toolbar';

type StatusFilter = 'active' | 'archived' | 'all';
const isStatusFilter = (value: string | null): value is StatusFilter => value === 'active' || value === 'archived' || value === 'all';

export function Projects() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const q = searchParams.get('q') || '';
  const statusParam = searchParams.get('status');
  const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'active';

  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<{ copyFromId?: string } | null>(null);
  const loadSeq = useRef(0);

  const loadProjects = async (silent = false) => {
    const seq = ++loadSeq.current;
    if (!silent) setIsLoading(true);
    try {
      const result = await fetchProjects(page, 24, q, status);
      if (seq !== loadSeq.current) return;
      setProjects(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (err) {
      console.error(err);
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
    return () => {
      loadSeq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, status]);

  useLiveRefresh((event) => event.resource === 'project', () => loadProjects(true));

  const updateParams = (apply: (next: URLSearchParams) => void) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      apply(next);
      return next;
    });

  const handleToggleArchive = async (project: Project) => {
    const nextStatus = project.status === 'archived' ? 'active' : 'archived';
    setTogglingId(project.id);
    try {
      await updateProject(project.id, { status: nextStatus });
      snackbar.show(nextStatus === 'archived' ? t('projects.archivedToast', { name: project.name }) : t('projects.unarchivedToast', { name: project.name }));
      await loadProjects();
    } catch (e) {
      console.error(e);
      snackbar.show(t('projects.archiveFailed'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleExportBundle = async (project: Project) => {
    setExportingId(project.id);
    try {
      await startProjectBundleExport(project.id, `${project.name}_Project`);
      snackbar.show({ message: t('projects.exportBundle.queued', { name: project.name }), action: { label: t('sidebar.exports'), onClick: () => navigate('/exports') } });
    } catch (e) {
      console.error(e);
      snackbar.show((e as Error)?.message || t('projects.exportBundle.failed'));
    } finally {
      setExportingId(null);
    }
  };

  return (
    <Page>
      <PageHeader
        size="large"
        title={t('projects.title')}
        description={t('projects.description')}
        actions={
          <>
            <IconButton icon="unarchive" label={t('projectImports.selectFile')} tooltip variant="tonal" href="/projects/import" />
            <IconButton icon="monitor_heart" label={t('sidebar.queueMonitor')} tooltip variant="tonal" href="/projects/queues" />
          </>
        }
      />

      <ListToolbar title={t(`projects.statusHeading.${status}`)} icon="schedule" count={total}>
        <Segmented<StatusFilter>
          aria-label={t('projects.title')}
          value={status}
          onChange={(s) =>
            updateParams((next) => {
              if (s === 'active') next.delete('status');
              else next.set('status', s);
              next.set('page', '1');
            })
          }
          options={(['active', 'all', 'archived'] as const).map((s) => ({ value: s, label: t(`projects.statusFilter.${s}`) }))}
        />
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t('projects.searchPlaceholder')}
          onSubmit={(value) =>
            updateParams((next) => {
              if (value) next.set('q', value);
              else next.delete('q');
              next.set('page', '1');
            })
          }
        />
        <span className="hidden sm:inline-flex">
          <IconButton icon="add" label={t('projects.newProject')} tooltip variant="filled" onClick={() => setProjectForm({})} />
        </span>
      </ListToolbar>

      {isLoading ? (
        <LoadingState />
      ) : projects.length === 0 ? (
        <EmptyState icon="play_circle" shape="clover-8" title={t('projects.noProjects.title')} description={q ? t('projects.noResultsFound') : t('projects.noProjects.description')} />
      ) : (
        <>
          <CardGrid>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isToggling={togglingId === project.id}
                isExporting={exportingId === project.id}
                onStartAssistantChat={(p) => {
                  localStorage.removeItem('assistant_last_conversation');
                  navigate('/assistant', { state: { draftBoundContexts: [{ id: p.id, name: p.name, type: 'project', subType: p.type || 'image' }] } });
                }}
                onToggleArchive={handleToggleArchive}
                onDuplicate={(item) => setProjectForm({ copyFromId: item.id })}
                onExportBundle={handleExportBundle}
                onDelete={setDeleteTarget}
              />
            ))}
          </CardGrid>
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

      <MobileFab icon="add" label={t('projects.newProject')} onClick={() => setProjectForm({})} />

      {projectForm && (
        <ProjectFormDialog
          copyFromId={projectForm.copyFromId}
          onClose={() => setProjectForm(null)}
          onSaved={(saved) => {
            setProjectForm(null);
            navigate(`/project/${saved.id}`);
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('projects.deleteTitle', { defaultValue: 'Delete Project' })}
        message={t('projects.deleteConfirmation', { name: deleteTarget?.name })}
        confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setTogglingId(deleteTarget.id);
          try {
            await deleteProject(deleteTarget.id);
            await loadProjects();
            snackbar.show(t('projects.deleteSuccess', { name: deleteTarget.name }));
          } catch (e) {
            console.error(e);
            snackbar.show(t('projects.deleteFailed'));
            throw e;
          } finally {
            setTogglingId(null);
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </Page>
  );
}
