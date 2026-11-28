import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { useToolView } from './shared/runtime';
import { Header, StateMessage, Waiting, formatNumber, formatTime, mount } from './shared/ui';
import './generation-batch.css';

interface BatchJob {
  id: string;
  status: string;
  prompt: string;
  error: string | null;
}

interface BatchItem {
  id: string;
  jobId: string | null;
  prompt: string | null;
  textContent: string | null;
  storageKey: string | null;
  thumbnailKey: string | null;
  optimizedKey: string | null;
  aspectRatio: string | null;
  format: string | null;
  createdAt: string;
}

interface BatchResult {
  batchId?: string;
  projectId?: string;
  projectName?: string;
  name?: string;
  projectType?: string;
  projectUrl?: string;
  url?: string;
  status?: 'running' | 'completed' | 'partial' | 'failed';
  totalCount?: number;
  pending?: number;
  processing?: number;
  queued?: number;
  completed?: number;
  failed?: number;
  autoResume?: boolean;
  resumeHint?: string | null;
  notifiedAt?: string | null;
  updatedAt?: string;
  jobs?: BatchJob[];
  items?: BatchItem[];
  message?: string;
}

const TOOL = 'get_generation_batch';
const POLL_MS = 4_000;
const MAX_POLLS = 150;

function isVideoKey(key: string | null, projectType?: string): boolean {
  if (projectType === 'video') return true;
  return Boolean(key && /\.(mp4|webm|mov)(\?|$)/i.test(key));
}

function GenerationBatch() {
  const view = useToolView<BatchResult>('generation-batch');
  const { data, error, pending, t, canCallTools, mediaUrls, app } = view;
  const polls = useRef(0);
  const [selectedItem, setSelectedItem] = useState<BatchItem | null>(null);
  const [sentMessage, setSentMessage] = useState(false);

  const batchId = data?.batchId || (typeof view.toolArgs.batchId === 'string' ? view.toolArgs.batchId : '');
  const running = Boolean(data && (data.status === 'running' || (data.pending ?? 0) + (data.processing ?? 0) > 0));
  const canSendMessage = Boolean(app?.getHostCapabilities()?.message);

  useEffect(() => {
    if (!canCallTools || !batchId || !running || pending || polls.current >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      void view.refetch(TOOL, { batchId });
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [canCallTools, batchId, running, pending, data]);

  if (!data && error) {
    return <div className="rs-view"><StateMessage tone="danger">{error}</StateMessage></div>;
  }
  if (!data) return <Waiting t={t} />;

  const title = data.projectName || data.name || t('generationBatch');
  const url = data.projectUrl || data.url;
  const total = data.totalCount ?? 0;
  const completed = data.completed ?? 0;
  const failed = data.failed ?? 0;
  const processing = data.processing ?? 0;
  const queued = data.pending ?? 0;
  const done = Math.min(total, completed + failed);
  const status = data.status ?? (running ? 'running' : 'completed');

  const completedPct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  const failedPct = total > 0 ? Math.min(100 - completedPct, (failed / total) * 100) : 0;
  const processingPct = total > 0 ? Math.min(100 - completedPct - failedPct, (processing / total) * 100) : 0;

  const statusTone =
    status === 'completed' ? 'success'
      : status === 'failed' ? 'danger'
        : status === 'partial' ? 'warning'
          : 'info';

  const failedJobs = (data.jobs ?? []).filter((job) => job.status === 'failed');
  const items = data.items ?? [];

  const handleRefresh = () => {
    if (!batchId) return;
    polls.current = 0;
    void view.refetch(TOOL, { batchId });
  };

  const handleSendToAgent = async () => {
    if (!app || !batchId || sentMessage) return;
    setSentMessage(true);
    try {
      await app.sendMessage({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Generation batch ${batchId} for "${title}" finished (${completed} completed, ${failed} failed out of ${total}). Please inspect the results with get_generation_batch and continue.`,
          },
        ],
      });
    } catch {
      setSentMessage(false);
    }
  };

  return (
    <div className={`rs-view${pending ? ' rs-busy' : ''}`}>
      <Header
        title={title}
        subtitle={data.updatedAt ? t('updated', { time: formatTime(data.updatedAt, t.locale, false) }) : undefined}
        url={url}
        onOpen={view.openLink}
        t={t}
      >
        {canCallTools && batchId ? (
          <button
            type="button"
            className="rs-button rs-icon-button"
            onClick={handleRefresh}
            disabled={pending}
            aria-label={t('refresh')}
            title={t('refresh')}
          >
            <RefreshCw size={16} className={pending || running ? 'rs-spin' : undefined} aria-hidden />
          </button>
        ) : null}
      </Header>

      {error ? <StateMessage tone="danger">{error}</StateMessage> : null}

      {!batchId ? (
        <StateMessage>{data.message || t('empty')}</StateMessage>
      ) : (
        <>
          <div className="gb-progress-wrap">
            <div className="gb-progress-head">
              <div className="gb-progress-badges">
                <span className="rs-badge" data-tone={statusTone}>{t.status(status)}</span>
                {data.autoResume ? (
                  <span className="rs-badge" data-tone={data.notifiedAt ? 'success' : 'info'}>
                    <Sparkles size={12} aria-hidden />
                    {data.notifiedAt ? t('autoResumed') : t('autoResumeOn')}
                  </span>
                ) : null}
              </div>
              <span className="gb-progress-count">
                {formatNumber(done, t.locale)} / {formatNumber(total, t.locale)}
              </span>
            </div>
            <div className="gb-bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
              <span className="gb-bar-completed" style={{ width: `${completedPct}%` }} />
              <span className="gb-bar-failed" style={{ width: `${failedPct}%` }} />
              <span className="gb-bar-processing" style={{ width: `${processingPct}%` }} />
            </div>
            {data.resumeHint ? <p className="gb-hint">{data.resumeHint}</p> : null}
          </div>

          <div className="gb-stats">
            <div className="gb-stat" data-tone={completed > 0 ? 'success' : undefined}>
              <span className="gb-stat-value">{formatNumber(completed, t.locale)}</span>
              <span className="gb-stat-label">{t('completed')}</span>
            </div>
            <div className="gb-stat" data-tone={processing > 0 ? 'info' : undefined}>
              <span className="gb-stat-value">{formatNumber(processing, t.locale)}</span>
              <span className="gb-stat-label">{t('running')}</span>
            </div>
            <div className="gb-stat" data-tone={queued > 0 ? 'warning' : undefined}>
              <span className="gb-stat-value">{formatNumber(queued, t.locale)}</span>
              <span className="gb-stat-label">{t('queued')}</span>
            </div>
            {failed > 0 ? (
              <div className="gb-stat" data-tone="danger">
                <span className="gb-stat-value">{formatNumber(failed, t.locale)}</span>
                <span className="gb-stat-label">{t('failed')}</span>
              </div>
            ) : null}
          </div>

          {items.length > 0 ? (
            <section className="gb-section">
              <h2 className="gb-section-title">
                {t('results')} ({formatNumber(items.length, t.locale)})
              </h2>
              <div className="gb-grid">
                {items.map((item) => {
                  const thumbKey = item.thumbnailKey || item.optimizedKey || item.storageKey;
                  const src = thumbKey ? mediaUrls[thumbKey] : undefined;
                  const video = isVideoKey(item.storageKey, data.projectType);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="gb-tile"
                      onClick={() => setSelectedItem(item)}
                      title={item.prompt || item.id}
                    >
                      {src ? (
                        video ? <video src={src} muted playsInline /> : <img src={src} alt={item.prompt || ''} loading="lazy" />
                      ) : (
                        <div className="gb-tile-text">{item.textContent || item.prompt || item.id}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {failedJobs.length > 0 ? (
            <section className="gb-section">
              <h2 className="gb-section-title">
                {t('failures')} ({formatNumber(failedJobs.length, t.locale)})
              </h2>
              <ul className="gb-failures">
                {failedJobs.slice(0, 5).map((job) => (
                  <li key={job.id} className="gb-failure">
                    {job.error || t('failed')}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!running && canSendMessage ? (
            <div className="gb-actions">
              <button
                type="button"
                className="rs-button"
                disabled={sentMessage}
                onClick={() => void handleSendToAgent()}
              >
                <Send size={14} aria-hidden />
                <span>{sentMessage ? t('sentToAgent') : t('sendToAgent')}</span>
              </button>
            </div>
          ) : null}
        </>
      )}

      {selectedItem ? (() => {
        const fullKey = selectedItem.optimizedKey || selectedItem.storageKey || selectedItem.thumbnailKey;
        const src = fullKey ? mediaUrls[fullKey] : undefined;
        const video = isVideoKey(selectedItem.storageKey, data.projectType);
        return (
          <div className="gb-lightbox" role="dialog" aria-modal="true" onClick={() => setSelectedItem(null)}>
            <button
              type="button"
              className="rs-button rs-icon-button"
              aria-label={t('close')}
              onClick={() => setSelectedItem(null)}
            >
              <X size={16} aria-hidden />
            </button>
            {src ? (
              video ? (
                <video src={src} controls autoPlay onClick={(e) => e.stopPropagation()} />
              ) : (
                <img src={src} alt={selectedItem.prompt || ''} onClick={(e) => e.stopPropagation()} />
              )
            ) : null}
            {(selectedItem.prompt || selectedItem.textContent) ? (
              <p className="gb-lightbox-caption" onClick={(e) => e.stopPropagation()}>
                {selectedItem.textContent || selectedItem.prompt}
              </p>
            ) : null}
          </div>
        );
      })() : null}
    </div>
  );
}

mount(<GenerationBatch />);
