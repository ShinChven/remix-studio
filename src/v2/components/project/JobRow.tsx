import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Checkbox, Icon, IconButton, LoadingIndicator, Ripple, Text } from '../../../m3';
import type { Job } from '../../../types';

export type JobTone = 'neutral' | 'running' | 'error' | 'success';

export interface JobRowProps {
  job: Job;
  isExpanded: boolean;
  isSelected: boolean;
  /** Whether any row of the list is selected, so every row shows its checkbox. */
  selecting: boolean;
  tone?: JobTone;
  providerName?: string;
  modelName?: string;
  /** Short status text at the trailing edge, e.g. "Running" or a time. */
  status?: ReactNode;
  /** The row's own actions, shown on hover and focus. */
  actionButtons?: ReactNode;
  expandedContent?: ReactNode;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, isShiftPressed: boolean) => void;
  onReuse?: (job: Job) => void;
}

/** The settings a job runs with, as quiet text. */
export function jobSettings(job: Job): string[] {
  return [
    job.aspectRatio,
    job.resolution,
    job.quality,
    job.duration != null ? `${job.duration}s` : undefined,
    job.format?.toUpperCase(),
    (job.videoContexts?.length || 0) > 0 ? `${job.videoContexts!.length} vid` : undefined,
    (job.audioContexts?.length || 0) > 0 ? `${job.audioContexts!.length} aud` : undefined,
  ].filter(Boolean) as string[];
}

/** A short date for a list, with the year only when it isn't this year. */
export function shortDate(ts?: number) {
  if (!ts) return '';
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, { year: sameYear ? undefined : '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const LEAD_ICON: Record<JobTone, string> = { neutral: 'edit_note', running: 'progress_activity', error: 'error', success: 'check' };

/** One job in the drafts, queue or done list: a thumbnail, the prompt, a quiet line of model and settings; expands into its details. */
export function JobRow({ job, isExpanded, isSelected, selecting, tone = 'neutral', providerName, modelName, status, actionButtons, expandedContent, onToggleExpand, onToggleSelect, onReuse }: JobRowProps) {
  const { t } = useTranslation();
  const thumb = job.thumbnailUrl || job.optimizedUrl || job.imageUrl || job.imageContexts?.[0];
  // The file behind a finished job can be gone (deleted from the album), so a failed load falls back to a glyph.
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null);
  const showThumb = thumb && brokenThumb !== thumb;
  const meta = [providerName, modelName, ...jobSettings(job)].filter(Boolean).join(' · ');
  return (
    <div className="v2-jobrow" data-expanded={isExpanded ? '' : undefined} data-selected={isSelected ? '' : undefined} data-selecting={selecting ? '' : undefined} data-tone={tone}>
      <div
        className="v2-jobrow__head m3-focus-ring"
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
          className="v2-jobrow__lead"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(job.id, e.shiftKey);
          }}
        >
          <span className="v2-jobrow__thumb" data-tone={tone}>
            {showThumb ? (
              <img src={imageDisplayUrl(thumb)} alt="" loading="lazy" onError={() => setBrokenThumb(thumb)} />
            ) : thumb ? (
              <Icon name="hide_image" size={18} />
            ) : tone === 'running' ? <LoadingIndicator size={20} aria-hidden /> : <Icon name={LEAD_ICON[tone]} size={18} />}
          </span>
          <span className="v2-jobrow__check">
            <Checkbox checked={isSelected} onChange={() => undefined} aria-label={job.prompt.slice(0, 60)} tabIndex={-1} />
          </span>
        </span>
        <span className="v2-jobrow__text">
          <Text as="span" variant="body-medium" className="v2-jobrow__prompt" title={job.prompt}>
            {job.prompt || <em>{t('projectViewer.workflow.noTextContent')}</em>}
          </Text>
          {(meta || status) && (
            <Text as="span" variant="body-small" className="v2-jobrow__meta">
              {/* On a narrow pane the trailing status is hidden, so it leads the meta line instead. */}
              {status && <span className="v2-jobrow__inline-status" data-tone={tone}>{status}{meta && ' · '}</span>}
              {meta}
            </Text>
          )}
        </span>
        {status && <span className="v2-jobrow__status" data-tone={tone}>{status}</span>}
        <div className="v2-jobrow__actions" onClick={(e) => e.stopPropagation()}>
          {onReuse && <IconButton icon="history" size="xs" label={t('projectViewer.common.reuseConfiguration')} tooltip onClick={() => onReuse(job)} />}
          {actionButtons}
        </div>
      </div>
      {isExpanded && expandedContent && <div className="v2-jobrow__body">{expandedContent}</div>}
    </div>
  );
}
