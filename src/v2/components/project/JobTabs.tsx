import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Button, Icon, IconButton, LinearProgress, LoadingIndicator, Text } from '../../../m3';
import type { AlbumItem, Job, ProjectType } from '../../../types';
import { EmptyState } from '../../ui/Page';
import { PagedFooter } from '../../ui/PagedFooter';
import { JobDetails, type OpenLightbox } from './JobDetails';
import { JobRow, shortDate } from './JobRow';
import { DangerAction, ResultsBar } from './ResultsBar';

/**
 * A job list that only mounts the rows near the viewport, so thousands of drafts stay fast. It
 * scrolls with the results pane and measures each row, so expanded rows take their real height.
 */
function VirtualJobList({ items, renderRow }: { items: Job[]; renderRow: (job: Job) => ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    const scroller = list?.closest<HTMLElement>('.v2-project__scroll') ?? null;
    setScrollElement(scroller);
    if (!list || !scroller) return;
    // Where the list starts inside the scroller: below the sticky bar and anything above it.
    const update = () => setScrollMargin(list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (list.parentElement) observer.observe(list.parentElement);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 62,
    overscan: 10,
    scrollMargin,
    getItemKey: (index) => items[index].id,
    // Always the row's current height: by default a direct measurement returns the cached size and
    // only the resize observer reports a new one, which would leave an expanded row overlapping the next.
    measureElement: (element) => (element as HTMLElement).offsetHeight,
  });

  return (
    <div ref={listRef} className="v2-joblist" data-virtual="" style={{ height: virtualizer.getTotalSize() + 16 }}>
      {/* Rows mount once the scroller is known. Each row is measured whenever it renders (expanding one re-renders it) as well as watched for size changes. */}
      {scrollElement &&
        virtualizer.getVirtualItems().map((row) => (
        <div key={row.key} data-index={row.index} ref={(el) => virtualizer.measureElement(el)} className="v2-joblist__item" style={{ transform: `translateY(${row.start - scrollMargin}px)` }}>
          {renderRow(items[row.index])}
        </div>
      ))}
    </div>
  );
}

type SelectToggle = (id: string, isShiftPressed: boolean, scopeIds: string[]) => void;

interface CommonProps {
  /** The section switcher, shown in the bar. */
  nav: ReactNode;
  expandedJobId: string | null;
  toggleJobExpand: (id: string) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  setJobToDeleteId: (id: string) => void;
  setLightboxData: OpenLightbox;
  onReuse?: (job: Job) => void;
}

export interface DraftsTabProps extends CommonProps {
  draftJobs: Job[];
  selectedDraftIds: Set<string>;
  toggleSelectAllDrafts: () => void;
  clearDraftSelection: () => void;
  setShowDeleteSelectedModal: (show: boolean) => void;
  runSelectedDrafts: () => void;
  setShowDeleteAllDraftsModal: (show: boolean) => void;
  runAllDrafts: () => void;
  isStartingDraftBatch: boolean;
  startingDraftJobIds: Set<string>;
  toggleDraftSelection: SelectToggle;
  runJob: (id: string) => void;
  albumItems?: AlbumItem[];
  onSwitchToAlbum?: () => void;
  projectType?: ProjectType;
  projectName?: string;
}

/** Drafts waiting to be started; an empty project shows its newest results instead. */
export function DraftsTab(props: DraftsTabProps) {
  const { t } = useTranslation();
  const { draftJobs, selectedDraftIds, isStartingDraftBatch, startingDraftJobIds } = props;
  const starting = isStartingDraftBatch || startingDraftJobIds.size > 0;
  const selecting = selectedDraftIds.size > 0;
  const scopeIds = draftJobs.map((j) => j.id);

  return (
    <section className="v2-results-section">
      <ResultsBar
        nav={props.nav}
        totalCount={draftJobs.length}
        selectedCount={selectedDraftIds.size}
        onToggleSelectAll={props.toggleSelectAllDrafts}
        onClearSelection={props.clearDraftSelection}
        menuItems={draftJobs.length > 0 ? [{ key: 'delete-all', icon: 'delete_sweep', danger: true, disabled: starting, label: t('projectViewer.drafts.deleteAllDrafts'), onSelect: () => props.setShowDeleteAllDraftsModal(true) }] : []}
        tools={
          draftJobs.length > 0 && (
            <>
              <Button variant="filled" size="sm" icon="play_arrow" loading={starting} onClick={props.runAllDrafts}>
                {starting ? t('projectViewer.drafts.starting', { defaultValue: 'Starting…' }) : t('v2.project.startAll', { count: draftJobs.length })}
              </Button>
            </>
          )
        }
        selectionActions={
          <>
            <DangerAction label={t('projectViewer.common.deleteSelected')} disabled={starting} onClick={() => props.setShowDeleteSelectedModal(true)} />
            <Button variant="filled" size="sm" icon="play_arrow" loading={starting} onClick={props.runSelectedDrafts}>
              {t('v2.project.start')}
            </Button>
          </>
        }
      />
      {starting && <LinearProgress className="v2-results-progress" aria-label={t('projectViewer.drafts.starting', { defaultValue: 'Starting jobs' })} />}
      {draftJobs.length === 0 ? (
        <DraftsCanvas {...props} />
      ) : (
        <VirtualJobList
          items={draftJobs}
          renderRow={(task) => (
            <JobRow
              key={task.id}
              job={task}
              isExpanded={props.expandedJobId === task.id}
              isSelected={selectedDraftIds.has(task.id)}
              selecting={selecting}
              providerName={props.getProviderName(task.providerId)}
              modelName={props.getModelName(task.providerId, task.modelConfigId)}
              onToggleExpand={props.toggleJobExpand}
              onToggleSelect={(id, shift) => props.toggleDraftSelection(id, shift, scopeIds)}
              onReuse={props.onReuse}
              actionButtons={
                <>
                  <IconButton icon="delete" size="xs" label={t('projectViewer.common.deleteJob')} tooltip onClick={() => props.setJobToDeleteId(task.id)} />
                  <IconButton
                    icon={startingDraftJobIds.has(task.id) ? <LoadingIndicator size={18} aria-hidden /> : 'play_arrow'}
                    size="xs"
                    variant="tonal"
                    label={t('projectViewer.drafts.runJob')}
                    tooltip
                    disabled={starting}
                    onClick={() => props.runJob(task.id)}
                  />
                </>
              }
              expandedContent={<JobDetails job={task} onLightbox={props.setLightboxData} />}
            />
          )}
        />
      )}
    </section>
  );
}

const STACK = [
  { r: -7, x: -26, y: 10 },
  { r: 5, x: 20, y: -4 },
  { r: -2, x: -4, y: 2 },
  { r: 8, x: 30, y: 16 },
  { r: -4, x: -14, y: -10 },
];

/** The empty drafts view: a stack of the newest results and a hint to build the workflow. */
function DraftsCanvas({ albumItems = [], onSwitchToAlbum, projectType = 'image', projectName = 'Untitled Project' }: DraftsTabProps) {
  const { t } = useTranslation();
  const shown = albumItems.slice(0, 5);
  const visual = projectType !== 'text' && projectType !== 'audio';
  return (
    <div className="v2-canvas">
      {visual && shown.length > 0 ? (
        <button type="button" className="v2-canvas__stack m3-focus-ring" onClick={onSwitchToAlbum} aria-label={t('projectViewer.drafts.openAlbum')}>
          {shown.map((item, idx) => (
            <span key={item.id} className="v2-canvas__photo" style={{ transform: `rotate(${STACK[idx].r}deg) translate(${STACK[idx].x}px, ${STACK[idx].y}px)`, zIndex: shown.length - idx }}>
              <img src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)} alt={item.prompt} />
            </span>
          ))}
        </button>
      ) : (
        <span className="v2-canvas__glyph" aria-hidden>
          <Icon name={projectType === 'audio' ? 'graphic_eq' : projectType === 'text' ? 'notes' : 'auto_awesome'} size={36} />
        </span>
      )}
      <Text as="h3" variant="headline-small" emphasized className="text-center">
        {shown.length > 0 ? projectName : t('v2.project.noDraftsTitle')}
      </Text>
      <Text variant="body-medium" className="max-w-sm text-center text-on-surface-variant">
        {shown.length > 0 ? t('v2.project.noDraftsWithResults') : projectType === 'audio' ? t('projectViewer.drafts.buildAudioWorkflowHint') : t('projectViewer.drafts.buildWorkflowHint')}
      </Text>
      {shown.length > 0 && (
        <Button variant="tonal" icon="photo_library" onClick={onSwitchToAlbum}>
          {t('projectViewer.drafts.openAlbum')}
        </Button>
      )}
    </div>
  );
}

export interface QueueTabProps extends CommonProps {
  queueJobs: Job[];
  selectedQueueIds: Set<string>;
  toggleSelectAllQueue: () => void;
  clearQueueSelection: () => void;
  toggleQueueSelection: SelectToggle;
  retrySelectedQueue: () => void;
  isRetryingQueueBatch: boolean;
  retryingQueueJobIds: Set<string>;
  deleteSelectedQueue: () => void;
  clearAllFailed: () => void;
  runJob: (id: string) => void;
}

/** Jobs waiting, running or failed. */
export function QueueTab(props: QueueTabProps) {
  const { t } = useTranslation();
  const { queueJobs, selectedQueueIds, isRetryingQueueBatch, retryingQueueJobIds } = props;
  const retrying = isRetryingQueueBatch || retryingQueueJobIds.size > 0;
  const selecting = selectedQueueIds.size > 0;
  const scopeIds = queueJobs.map((j) => j.id);
  const failedCount = queueJobs.filter((j) => j.status === 'failed').length;
  const runningCount = queueJobs.filter((j) => j.status === 'processing').length;

  return (
    <section className="v2-results-section">
      <ResultsBar
        nav={props.nav}
        totalCount={queueJobs.length}
        selectedCount={selectedQueueIds.size}
        onToggleSelectAll={props.toggleSelectAllQueue}
        onClearSelection={props.clearQueueSelection}
        summary={
          queueJobs.length > 0 && (
            <>
              {runningCount > 0 && t('v2.project.runningCount', { count: runningCount })}
              {runningCount > 0 && failedCount > 0 && ' · '}
              {failedCount > 0 && <span className="text-error">{t('v2.project.failedCount', { count: failedCount })}</span>}
            </>
          )
        }
        tools={
          failedCount > 0 && (
            <Button variant="text" size="sm" icon="cleaning_services" className="v2-button-danger" disabled={retrying} onClick={props.clearAllFailed}>
              {t('v2.project.clearFailed')}
            </Button>
          )
        }
        selectionActions={
          <>
            <DangerAction label={t('projectViewer.common.deleteSelected')} disabled={retrying} onClick={props.deleteSelectedQueue} />
            {queueJobs.some((j) => selectedQueueIds.has(j.id) && j.status === 'failed') && (
              <Button variant="filled" size="sm" icon="replay" loading={isRetryingQueueBatch} disabled={retrying} onClick={props.retrySelectedQueue}>
                {isRetryingQueueBatch ? t('projectViewer.queue.retrying') : t('projectViewer.queue.retry')}
              </Button>
            )}
          </>
        }
      />
      {retrying && <LinearProgress className="v2-results-progress" aria-label={t('projectViewer.queue.retrying')} />}
      {queueJobs.length === 0 ? (
        <EmptyState icon="pending_actions" shape="clover-4" title={t('projectViewer.queue.emptyTitle')} description={t('projectViewer.queue.emptyDescription')} className="v2-pane-empty" />
      ) : (
        <VirtualJobList
          items={queueJobs}
          renderRow={(task) => {
            const tone = task.status === 'failed' ? 'error' : task.status === 'processing' ? 'running' : 'neutral';
            return (
              <JobRow
                key={task.id}
                job={task}
                tone={tone}
                isExpanded={props.expandedJobId === task.id}
                isSelected={selectedQueueIds.has(task.id)}
                selecting={selecting}
                providerName={props.getProviderName(task.providerId)}
                modelName={props.getModelName(task.providerId, task.modelConfigId)}
                onToggleExpand={props.toggleJobExpand}
                onToggleSelect={(id, shift) => props.toggleQueueSelection(id, shift, scopeIds)}
                onReuse={props.onReuse}
                status={task.status === 'processing' ? t('projectViewer.queue.running') : task.status === 'failed' ? t('projectViewer.queue.failed') : t('projectViewer.queue.queued')}
                actionButtons={
                  <>
                    <IconButton icon="delete" size="xs" label={t('projectViewer.common.deleteJob')} tooltip onClick={() => props.setJobToDeleteId(task.id)} />
                    {task.status === 'failed' && (
                      <IconButton
                        icon={retryingQueueJobIds.has(task.id) ? <LoadingIndicator size={18} aria-hidden /> : 'replay'}
                        size="xs"
                        variant="tonal"
                        label={t('projectViewer.queue.retryJob')}
                        tooltip
                        disabled={retrying}
                        onClick={() => props.runJob(task.id)}
                      />
                    )}
                  </>
                }
                expandedContent={<JobDetails job={task} onLightbox={props.setLightboxData} showError />}
              />
            );
          }}
        />
      )}
    </section>
  );
}

export interface CompletedTabProps extends CommonProps {
  completedJobs: Job[];
  isLoading: boolean;
  selectedCompletedIds: Set<string>;
  toggleCompletedSelection: SelectToggle;
  toggleSelectAllCompleted: () => void;
  clearCompletedSelection: () => void;
  setShowDeleteSelectedModal: (show: boolean) => void;
  projectType?: ProjectType;
  page: number;
  pageSize: number | 'all';
  total: number;
  pages: number;
  sort: 'newest' | 'oldest';
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number | 'all') => void;
  onSortChange: (sort: 'newest' | 'oldest') => void;
}

/** Finished job records, paged. */
export function CompletedTab(props: CompletedTabProps) {
  const { t } = useTranslation();
  const { completedJobs, selectedCompletedIds, total, sort, projectType = 'image', isLoading } = props;
  const selecting = selectedCompletedIds.size > 0;
  const scopeIds = completedJobs.map((j) => j.id);

  return (
    <section className="v2-results-section">
      <ResultsBar
        nav={props.nav}
        isLoading={isLoading && completedJobs.length > 0}
        totalCount={completedJobs.length}
        selectedCount={selectedCompletedIds.size}
        onToggleSelectAll={props.toggleSelectAllCompleted}
        onClearSelection={props.clearCompletedSelection}
        tools={
          total > 0 && (
            <IconButton
              icon={sort === 'newest' ? 'arrow_downward' : 'arrow_upward'}
              size="sm"
              label={sort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
              tooltip
              onClick={() => props.onSortChange(sort === 'newest' ? 'oldest' : 'newest')}
            />
          )
        }
        selectionActions={<DangerAction label={t('projectViewer.common.deleteSelected')} onClick={() => props.setShowDeleteSelectedModal(true)} />}
      />
      {isLoading && completedJobs.length === 0 ? (
        <div className="v2-results-loading">
          <LoadingIndicator />
        </div>
      ) : total === 0 ? (
        <EmptyState icon="task_alt" shape="sunny" title={t('projectViewer.completed.emptyTitle')} description={t('projectViewer.completed.emptyDescription')} className="v2-pane-empty" />
      ) : (
        <>
          <VirtualJobList
            items={completedJobs}
            renderRow={(job) => (
              <JobRow
                key={job.id}
                job={job}
                tone="success"
                isExpanded={props.expandedJobId === job.id}
                isSelected={selectedCompletedIds.has(job.id)}
                selecting={selecting}
                providerName={props.getProviderName(job.providerId)}
                modelName={props.getModelName(job.providerId, job.modelConfigId)}
                onToggleExpand={props.toggleJobExpand}
                onToggleSelect={(id, shift) => props.toggleCompletedSelection(id, shift, scopeIds)}
                onReuse={props.onReuse}
                status={shortDate(job.updatedAt || job.createdAt)}
                actionButtons={<IconButton icon="delete" size="xs" label={t('projectViewer.completed.deleteJobRecord')} tooltip onClick={() => props.setJobToDeleteId(job.id)} />}
                expandedContent={<JobDetails job={job} onLightbox={props.setLightboxData} showResultText={projectType === 'text' || projectType === 'audio'} showMetadata />}
              />
            )}
          />
          <PagedFooter className="v2-results-footer" page={props.page} pageSize={props.pageSize} total={total} pages={props.pages} onPageChange={props.onPageChange} onPageSizeChange={props.onPageSizeChange} />
        </>
      )}
    </section>
  );
}
