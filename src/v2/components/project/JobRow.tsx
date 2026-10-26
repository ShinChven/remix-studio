import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Icon, IconButton, Ripple, Text } from '../../../m3';
import type { Job } from '../../../types';

export interface JobRowProps {
  job: Job;
  isExpanded: boolean;
  isSelected: boolean;
  tone?: 'primary' | 'success' | 'error';
  providerName?: string;
  modelName?: string;
  statusBadge?: ReactNode;
  metaChips?: ReactNode;
  actionButtons?: ReactNode;
  expandedContent?: ReactNode;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, isShiftPressed: boolean) => void;
  onReuse?: (job: Job) => void;
}

/** One job in the drafts, queue or done list: prompt, model, status and actions; expands into its details. */
export function JobRow({ job, isExpanded, isSelected, tone = 'primary', providerName, modelName, statusBadge, metaChips, actionButtons, expandedContent, onToggleExpand, onToggleSelect, onReuse }: JobRowProps) {
  const { t } = useTranslation();
  return (
    <div className="v2-job" data-expanded={isExpanded ? '' : undefined} data-selected={isSelected ? '' : undefined} data-tone={tone}>
      <div
        className="v2-job__head m3-focus-ring"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => onToggleExpand(job.id)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            onToggleExpand(job.id);
          }
        }}
      >
        <Ripple />
        <span
          className="v2-job__check"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(job.id, e.shiftKey);
          }}
        >
          <Checkbox checked={isSelected} onChange={() => undefined} aria-label={job.prompt.slice(0, 60)} tabIndex={-1} />
        </span>
        <Icon name="expand_more" size={18} className="v2-job__chevron" />
        <Text as="span" variant="body-small" className="v2-job__prompt" title={job.prompt}>
          {job.prompt}
        </Text>
        <div className="v2-job__meta">
          {(providerName || modelName) && (
            <span className="v2-info-chip v2-job__model">
              {providerName && <span className="truncate">{providerName}</span>}
              {providerName && modelName && <span className="v2-dot" />}
              {modelName && <span className="truncate text-primary">{modelName}</span>}
            </span>
          )}
          {metaChips}
          {statusBadge}
        </div>
        <div className="v2-job__actions" onClick={(e) => e.stopPropagation()}>
          {onReuse && <IconButton icon="history" size="xs" label={t('projectViewer.common.reuseConfiguration')} tooltip onClick={() => onReuse(job)} />}
          {actionButtons}
        </div>
      </div>
      {isExpanded && expandedContent && <div className="v2-job__body">{expandedContent}</div>}
    </div>
  );
}

/** Small uppercase chip for a job's settings and status. */
export function InfoChip({ children, tone, icon }: { children: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'error' | 'tertiary'; icon?: ReactNode }) {
  return (
    <span className="v2-info-chip" data-tone={tone}>
      {icon}
      {children}
    </span>
  );
}

/** The settings chips every job shows. */
export function JobSettingChips({ job }: { job: Job }) {
  return (
    <>
      {job.aspectRatio && <InfoChip>{job.aspectRatio}</InfoChip>}
      {job.quality && <InfoChip>{job.quality}</InfoChip>}
      {job.format && <InfoChip>{job.format}</InfoChip>}
      {(job.videoContexts?.length || 0) > 0 && <InfoChip tone="tertiary">{job.videoContexts?.length} vid</InfoChip>}
      {(job.audioContexts?.length || 0) > 0 && <InfoChip tone="tertiary">{job.audioContexts?.length} aud</InfoChip>}
    </>
  );
}
