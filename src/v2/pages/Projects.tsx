import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { deleteProject, fetchProjects, startProjectBundleExport, updateProject } from '../../api';
import { Button } from '../../m3';
import type { Project } from '../../types';
import { ProjectCard } from '../components/EntityCards';
import { ProjectFormDialog } from '../components/ProjectFormDialog';
import { ProjectsHero } from '../components/projects/ProjectsHero';
import { useAction } from '../lib/useAction';
import { useAssistantChat } from '../lib/useAssistantChat';
import { useAsyncData } from '../lib/useAsyncData';
import { CARD_PAGE_SIZES, useListParams } from '../lib/useListParams';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SectionNav } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { Page } from '../ui/Page';
import { CardGrid, MobileFab } from '../ui/Toolbar';

type StatusFilter = 'active' | 'archived' | 'all';
const STATUSES: readonly StatusFilter[] = ['active', 'all', 'archived'];
const STATUS_ICONS: Record<StatusFilter, string> = { active: 'play_circle', all: 'apps', archived: 'inventory_2' };

export function Projects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const startChat = useAssistantChat();
  const action = useAction();
  const list = useListParams({ pageSize: 24, pageSizes: CARD_PAGE_SIZES, defaults: { status: 'active' } });
  const status = list.oneOf('status', STATUSES);
  const size = list.pageSize === 'all' ? 24 : list.pageSize;

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState<{ copyFromId?: string } | null>(null);

  const projects = useAsyncData(() => fetchProjects(list.page, size, list.q, status), [list.page, size, list.q, status], { live: (event) => event.resource === 'project' });
  const items = projects.data?.items ?? [];
  const total = projects.data?.total ?? 0;

  const toggleArchive = (project: Project) => {
    const next = project.status === 'archived' ? 'active' : 'archived';
    void action.run(
      async () => {
        await updateProject(project.id, { status: next });
        await projects.reload(true);
      },
      { key: project.id, success: next === 'archived' ? t('projects.archivedToast', { name: project.name }) : t('projects.unarchivedToast', { name: project.name }), error: t('projects.archiveFailed') },
    );
  };

  const exportBundle = (project: Project) =>
    void action.run(() => startProjectBundleExport(project.id, `${project.name}_Project`), {
      key: `export:${project.id}`,
      success: t('projects.exportBundle.queued', { name: project.name }),
      successOptions: { action: { label: t('sidebar.exports'), onClick: () => navigate('/exports') } },
      error: t('projects.exportBundle.failed'),
    });

  return (
    <Page className="v2-projects">
      <ProjectsHero
        actions={
          <>
            <Button variant="filled" icon="add" emphasized className="v2-hide-mobile" onClick={() => setProjectForm({})}>
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

      <ListPane
        variant="flush"
        label={t('projects.title')}
        lead={
          <SectionNav<StatusFilter>
            scope="projects"
            label={t('projects.title')}
            value={status}
            onChange={(next) => list.set({ status: next })}
            items={STATUSES.map((value) => ({ value, label: t(`projects.statusFilter.${value}`), icon: STATUS_ICONS[value], count: value === status ? total : 0 }))}
          />
        }
        fitKey={status}
        tools={<ListSearch value={list.q} onChange={list.setQuery} label={t('projects.searchPlaceholder')} />}
        loading={projects.loading}
        refreshing={projects.refreshing}
        error={projects.error}
        onRetry={() => void projects.reload()}
        count={items.length}
        filtered={list.q !== ''}
        onClearFilters={() => list.setQuery('')}
        empty={{
          icon: 'play_circle',
          shape: 'clover-8',
          title: t('projects.noProjects.title'),
          description: t('projects.noProjects.description'),
          action:
            status === 'active' ? (
              <Button variant="filled" icon="add" onClick={() => setProjectForm({})}>
                {t('projects.newProject')}
              </Button>
            ) : undefined,
        }}
        paging={{ page: list.page, pageSize: size, total, pages: projects.data?.pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, pageSizes: CARD_PAGE_SIZES }}
      >
        <CardGrid>
          {items.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isToggling={action.isBusy(project.id)}
              isExporting={action.isBusy(`export:${project.id}`)}
              onStartAssistantChat={(p) => startChat({ id: p.id, name: p.name, type: 'project', subType: p.type || 'image' })}
              onToggleArchive={toggleArchive}
              onDuplicate={(item) => setProjectForm({ copyFromId: item.id })}
              onExportBundle={exportBundle}
              onDelete={setDeleteTarget}
            />
          ))}
        </CardGrid>
      </ListPane>

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
          await action.run(
            async () => {
              await deleteProject(deleteTarget.id);
              await projects.reload(true);
            },
            { key: deleteTarget.id, success: t('projects.deleteSuccess', { name: deleteTarget.name }), error: t('projects.deleteFailed'), rethrow: true },
          );
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </Page>
  );
}
