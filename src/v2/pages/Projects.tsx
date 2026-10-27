import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteProject, fetchProjects, fetchQueueStatus, startProjectBundleExport, updateProject } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { Button, Text, useSnackbar } from '../../m3';
import type { Project } from '../../types';
import { ProjectCard } from '../components/EntityCards';
import { ProjectFormDialog } from '../components/ProjectFormDialog';
import { ProjectsHero, type ProjectsOverview, type ProjectsQueue } from '../components/projects/ProjectsHero';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page } from '../ui/Page';
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

  // Every project at a glance, for the hero.
  const [overview, setOverview] = useState<ProjectsOverview | null>(null);
  const [overviewKey, setOverviewKey] = useState(0);
  const refreshOverview = () => setOverviewKey((key) => key + 1);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProjects(1, 5, undefined, 'active'), fetchProjects(1, 1, undefined, 'archived', false, true)])
      .then(([active, archived]) => {
        if (!cancelled) setOverview({ active: active.total, archived: archived.total, newest: active.items });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [overviewKey]);

  // What is generating across every project; kept current while anything is.
  const [queue, setQueue] = useState<ProjectsQueue | null>(null);
  const [queueKey, setQueueKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchQueueStatus('projects')
      .then(({ totals }) => {
        if (!cancelled) setQueue({ running: totals.processingJobs, queued: totals.pendingJobs, failed: totals.failedJobs });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [queueKey]);
  const busy = !!queue && queue.running + queue.queued > 0;
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setQueueKey((key) => key + 1);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useLiveRefresh(
    (event) => event.resource === 'project',
    () => {
      refreshOverview();
      return loadProjects(true);
    },
  );
  useLiveRefresh((event) => event.resource === 'project', () => setQueueKey((key) => key + 1), { minIntervalMs: 10_000 });

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
      refreshOverview();
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
    <Page className="v2-projects">
      <ProjectsHero
        overview={overview}
        queue={queue}
        actions={
          <>
            <Button variant="filled" icon="add" emphasized className="v2-projects-hero__create" onClick={() => setProjectForm({})}>
              {t('projects.newProject')}
            </Button>
            <Button variant="tonal" icon="unarchive" href="/projects/import">
              {t('projectImports.selectFile')}
            </Button>
            <Button variant="tonal" icon="monitor_heart" href="/projects/queues">
              {t('sidebar.queueMonitor')}
            </Button>
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
            refreshOverview();
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
