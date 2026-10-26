import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Button, Icon, IconButton, LinearProgress, LoadingIndicator, Text } from '../../../m3';
import type { AlbumItem, Job, ProjectType } from '../../../types';
import { EmptyState } from '../../ui/Page';
import { PagedFooter } from '../../ui/PagedFooter';
import { JobDetails, type OpenLightbox } from './JobDetails';
import { InfoChip, JobRow, JobSettingChips } from './JobRow';
import { PaneToolbar } from './PaneToolbar';

type SelectToggle = (id: string, isShiftPressed: boolean, scopeIds: string[]) => void;

interface CommonProps {
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
  const hasSelection = selectedDraftIds.size > 0;

  if (draftJobs.length === 0) return <DraftsCanvas {...props} />;
  const scopeIds = draftJobs.map((j) => j.id);

  return (
    <section>
      <PaneToolbar
        totalCount={draftJobs.length}
        selectedCount={selectedDraftIds.size}
        onToggleSelectAll={props.toggleSelectAllDrafts}
        rightActions={
          <>
            <Button
              variant="tonal"
              size="xs"
              icon="delete"
              className="v2-button-danger"
              disabled={starting}
              aria-label={hasSelection ? t('projectViewer.common.deleteSelected') : t('projectViewer.drafts.deleteAllDrafts')}
              onClick={() => (hasSelection ? props.setShowDeleteSelectedModal(true) : props.setShowDeleteAllDraftsModal(true))}
            >
              {hasSelection ? t('projectViewer.common.deleteSelected') : t('projectViewer.common.deleteAll')}
            </Button>
            <Button variant="filled" size="xs" icon="play_arrow" loading={starting} onClick={hasSelection ? props.runSelectedDrafts : props.runAllDrafts}>
              {starting ? t('projectViewer.drafts.starting', { defaultValue: 'Starting…' }) : hasSelection ? t('projectViewer.drafts.startSelected') : t('projectViewer.drafts.startAllNow')}
            </Button>
          </>
        }
      />
      {starting && <LinearProgress aria-label={t('projectViewer.drafts.starting', { defaultValue: 'Starting jobs' })} />}
      <div className="v2-job-list">
        {draftJobs.map((task) => (
          <JobRow
            key={task.id}
            job={task}
            isExpanded={props.expandedJobId === task.id}
            isSelected={selectedDraftIds.has(task.id)}
            providerName={props.getProviderName(task.providerId)}
            modelName={props.getModelName(task.providerId, task.modelConfigId)}
            onToggleExpand={props.toggleJobExpand}
            onToggleSelect={(id, shift) => props.toggleDraftSelection(id, shift, scopeIds)}
            onReuse={props.onReuse}
            metaChips={<JobSettingChips job={task} />}
            statusBadge={<InfoChip tone="warning">{t('projectViewer.tabs.draft')}</InfoChip>}
            actionButtons={
              <>
                <IconButton
                  icon={startingDraftJobIds.has(task.id) ? <LoadingIndicator size={20} aria-hidden /> : 'play_arrow'}
                  size="xs"
                  variant="tonal"
                  label={t('projectViewer.drafts.runJob')}
                  tooltip
                  disabled={starting}
                  onClick={() => props.runJob(task.id)}
                />
                <IconButton icon="delete" size="xs" label={t('projectViewer.common.deleteJob')} tooltip onClick={() => props.setJobToDeleteId(task.id)} />
              </>
            }
            expandedContent={<JobDetails job={task} onLightbox={props.setLightboxData} />}
          />
        ))}
      </div>
    </section>
  );
}

const STACK = [
  { r: -6, x: -20, y: 10 },
  { r: 4, x: 15, y: -5 },
  { r: -2, x: -5, y: 0 },
  { r: 5, x: 25, y: 15 },
  { r: -3, x: -10, y: -8 },
];

/** The empty drafts view: a stack of the newest results and a hint to build the workflow. */
function DraftsCanvas({ albumItems = [], onSwitchToAlbum, projectType = 'image', projectName = 'Untitled Project' }: DraftsTabProps) {
  const { t } = useTranslation();
  const shown = albumItems.slice(0, 5);
  const visual = projectType !== 'text' && projectType !== 'audio';
  return (
    <div className="v2-canvas">
      {visual && (
        <button type="button" className="v2-canvas__stack m3-focus-ring" onClick={onSwitchToAlbum} aria-label={t('projectViewer.drafts.openAlbum')}>
          {shown.map((item, idx) => (
            <span key={item.id} className="v2-canvas__photo" style={{ transform: `rotate(${STACK[idx].r}deg) translate(${STACK[idx].x}px, ${STACK[idx].y}px)`, zIndex: shown.length - idx }}>
              <img src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)} alt={item.prompt} />
            </span>
          ))}
          {shown.length === 0 && (
            <span className="v2-canvas__empty">
              <Icon name="add_photo_alternate" size={48} />
            </span>
          )}
        </button>
      )}
      <Text as="h3" variant="headline-small" emphasized className="text-center">
        {shown.length > 0 ? projectName : t('projectViewer.drafts.emptyCanvas')}
      </Text>
      <Text variant="body-medium" className="max-w-md text-center text-on-surface-variant">
        {shown.length > 0 ? t('projectViewer.drafts.galleryReady') : projectType === 'audio' ? t('projectViewer.drafts.buildAudioWorkflowHint') : t('projectViewer.drafts.buildWorkflowHint')}
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
  const scopeIds = queueJobs.map((j) => j.id);

  if (queueJobs.length === 0) return <EmptyState icon="pending_actions" shape="clover-4" title={t('projectViewer.queue.emptyTitle')} description={t('projectViewer.queue.emptyDescription')} className="v2-pane-empty" />;

  return (
    <section>
      <PaneToolbar
        totalCount={queueJobs.length}
        selectedCount={selectedQueueIds.size}
        onToggleSelectAll={props.toggleSelectAllQueue}
        rightActions={
          <>
            {selectedQueueIds.size > 0 && (
              <Button variant="tonal" size="xs" icon="delete" className="v2-button-danger" disabled={retrying} onClick={props.deleteSelectedQueue}>
                {t('projectViewer.common.delete')}
              </Button>
            )}
            {queueJobs.some((j) => selectedQueueIds.has(j.id) && j.status === 'failed') && (
              <Button variant="filled" size="xs" icon="replay" loading={isRetryingQueueBatch} disabled={retrying} onClick={props.retrySelectedQueue}>
                {isRetryingQueueBatch ? t('projectViewer.queue.retrying') : t('projectViewer.queue.retry')}
              </Button>
            )}
            {queueJobs.some((j) => j.status === 'failed') && (
              <Button variant="text" size="xs" icon="cleaning_services" className="v2-button-danger" disabled={retrying} onClick={props.clearAllFailed}>
                {t('projectViewer.queue.clearAllFailed')}
              </Button>
            )}
          </>
        }
      />
      {retrying && <LinearProgress aria-label={t('projectViewer.queue.retrying')} />}
      <div className="v2-job-list">
        {queueJobs.map((task) => (
          <JobRow
            key={task.id}
            job={task}
            tone={task.status === 'failed' ? 'error' : 'primary'}
            isExpanded={props.expandedJobId === task.id}
            isSelected={selectedQueueIds.has(task.id)}
            providerName={props.getProviderName(task.providerId)}
            modelName={props.getModelName(task.providerId, task.modelConfigId)}
            onToggleExpand={props.toggleJobExpand}
            onToggleSelect={(id, shift) => props.toggleQueueSelection(id, shift, scopeIds)}
            onReuse={props.onReuse}
            statusBadge={
              <>
                <JobSettingChips job={task} />
                {task.status === 'processing' && (
                  <InfoChip tone="primary" icon={<LoadingIndicator size={14} aria-hidden />}>
                    {t('projectViewer.queue.running')}
                  </InfoChip>
                )}
                {task.status === 'pending' && <InfoChip>{t('projectViewer.queue.queued')}</InfoChip>}
                {task.status === 'failed' && <InfoChip tone="error">{t('projectViewer.queue.failed')}</InfoChip>}
              </>
            }
            actionButtons={
              <>
                {task.status === 'failed' && (
                  <IconButton
                    icon={retryingQueueJobIds.has(task.id) ? <LoadingIndicator size={20} aria-hidden /> : 'replay'}
                    size="xs"
                    variant="tonal"
                    label={t('projectViewer.queue.retryJob')}
                    tooltip
                    disabled={retrying}
                    onClick={() => props.runJob(task.id)}
                  />
                )}
                <IconButton icon="delete" size="xs" label={t('projectViewer.common.deleteJob')} tooltip onClick={() => props.setJobToDeleteId(task.id)} />
              </>
            }
            expandedContent={<JobDetails job={task} onLightbox={props.setLightboxData} showError />}
          />
        ))}
      </div>
    </section>
  );
}

export interface CompletedTabProps extends CommonProps {
  completedJobs: Job[];
  selectedCompletedIds: Set<string>;
  toggleCompletedSelection: SelectToggle;
  toggleSelectAllCompleted: () => void;
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
  const { completedJobs, selectedCompletedIds, total, sort, projectType = 'image' } = props;
  const scopeIds = completedJobs.map((j) => j.id);

  if (total === 0) return <EmptyState icon="task_alt" shape="sunny" title={t('projectViewer.completed.emptyTitle')} description={t('projectViewer.completed.emptyDescription')} className="v2-pane-empty" />;

  return (
    <section>
      <PaneToolbar
        totalCount={completedJobs.length}
        selectedCount={selectedCompletedIds.size}
        onToggleSelectAll={props.toggleSelectAllCompleted}
        rightActions={
          <>
            {selectedCompletedIds.size > 0 && (
              <Button variant="tonal" size="xs" icon="delete" className="v2-button-danger" onClick={() => props.setShowDeleteSelectedModal(true)}>
                {t('projectViewer.common.deleteSelected')}
              </Button>
            )}
            <Button variant="outlined" size="xs" icon={sort === 'newest' ? 'arrow_downward' : 'arrow_upward'} onClick={() => props.onSortChange(sort === 'newest' ? 'oldest' : 'newest')}>
              {sort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
            </Button>
          </>
        }
      />
      <div className="v2-job-list">
        {completedJobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            tone="success"
            isExpanded={props.expandedJobId === job.id}
            isSelected={selectedCompletedIds.has(job.id)}
            providerName={props.getProviderName(job.providerId)}
            modelName={props.getModelName(job.providerId, job.modelConfigId)}
            onToggleExpand={props.toggleJobExpand}
            onToggleSelect={(id, shift) => props.toggleCompletedSelection(id, shift, scopeIds)}
            onReuse={props.onReuse}
            statusBadge={<InfoChip tone="success">{t('projectViewer.completed.completed')}</InfoChip>}
            actionButtons={<IconButton icon="delete" size="xs" label={t('projectViewer.completed.deleteJobRecord')} tooltip onClick={() => props.setJobToDeleteId(job.id)} />}
            expandedContent={<JobDetails job={job} onLightbox={props.setLightboxData} showResultText={projectType === 'text' || projectType === 'audio'} showMetadata />}
          />
        ))}
      </div>
      <PagedFooter page={props.page} pageSize={props.pageSize} total={total} pages={props.pages} onPageChange={props.onPageChange} onPageSizeChange={props.onPageSizeChange} />
    </section>
  );
}
