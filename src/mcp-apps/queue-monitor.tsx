import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useToolView } from './shared/runtime';
import { Header, StateMessage, Waiting, formatNumber, formatTime, mount } from './shared/ui';
import type { Translator } from './shared/i18n';
import './queue-monitor.css';

/** The get_queue_status result; see server/mcp/tool-definitions.ts. */
interface QueueResult {
  url?: string;
  updatedAt: string;
  breakdown: 'none' | 'projects' | 'providers';
  totals: {
    projects: number;
    providers: number;
    running: number;
    queued: number;
    failed: number;
    activeSlots: number;
    concurrency: number;
    availableSlots: number;
  };
  projects?: {
    id: string;
    name: string;
    providerName?: string | null;
    running: number;
    queued: number;
    failed: number;
    projectUrl?: string;
  }[];
  providers?: {
    id: string;
    name: string;
    type?: string;
    activeSlots: number;
    concurrency: number;
    running: number;
    queued: number;
    failed: number;
    providerUrl?: string;
  }[];
  totalRows?: number;
  hasMore?: boolean;
}

const TOOL = 'get_queue_status';
/** While jobs are moving the view polls; it stops once the queue is idle. */
const POLL_MS = 15_000;
const MAX_POLLS = 40;

function Meter({ used, total }: { used: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, used / total) : 0;
  return (
    <span className="qm-meter" role="presentation">
      <span style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

function Counts({ running, queued, failed, t }: { running: number; queued: number; failed: number; t: Translator }) {
  return (
    <span className="qm-counts">
      {running > 0 ? <span className="rs-badge" data-tone="info" title={t('running')}>{running} {t('running')}</span> : null}
      {queued > 0 ? <span className="rs-badge" data-tone="warning" title={t('queued')}>{queued} {t('queued')}</span> : null}
      {failed > 0 ? <span className="rs-badge" data-tone="danger" title={t('failed')}>{failed} {t('failed')}</span> : null}
    </span>
  );
}

function QueueMonitor() {
  const view = useToolView<QueueResult>('queue-monitor');
  const { data, error, pending, t, canCallTools } = view;
  const polls = useRef(0);

  const breakdown = data?.breakdown && data.breakdown !== 'none' ? data.breakdown : undefined;
  const limit = typeof view.toolArgs.limit === 'number' ? view.toolArgs.limit : 25;
  const load = (mode: 'none' | 'projects' | 'providers') => view.refetch(TOOL, { breakdown: mode, limit });

  const active = Boolean(data && (data.totals.running > 0 || data.totals.queued > 0));
  useEffect(() => {
    if (!canCallTools || !active || pending || polls.current >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      void load(data?.breakdown ?? 'none');
    }, POLL_MS);
    return () => window.clearTimeout(timer);
    // `load` is rebuilt every render; each new result is what restarts the timer.
  }, [canCallTools, active, pending, data]);

  if (!data && error) {
    return <div className="rs-view"><StateMessage tone="danger">{error}</StateMessage></div>;
  }
  if (!data) return <Waiting t={t} />;

  const { totals } = data;
  const locale = t.locale;
  const rows = breakdown === 'providers' ? data.providers ?? [] : breakdown === 'projects' ? data.projects ?? [] : [];

  return (
    <div className={`rs-view${pending ? ' rs-busy' : ''}`}>
      <Header
        title={t('queue')}
        subtitle={t('updated', { time: formatTime(data.updatedAt, locale, false) })}
        url={data.url}
        onOpen={view.openLink}
        t={t}
      >
        {canCallTools ? (
          <button
            type="button"
            className="rs-button rs-icon-button"
            onClick={() => { polls.current = 0; void load(data.breakdown); }}
            disabled={pending}
            aria-label={t('refresh')}
            title={t('refresh')}
          >
            <RefreshCw size={16} className={pending ? 'rs-spin' : undefined} aria-hidden />
          </button>
        ) : null}
      </Header>

      {error ? <StateMessage tone="danger">{error}</StateMessage> : null}

      <div className="qm-stats">
        <div className="qm-stat" data-tone="info">
          <span className="qm-stat-value">{formatNumber(totals.running, locale)}</span>
          <span className="qm-stat-label">{t('running')}</span>
        </div>
        <div className="qm-stat" data-tone="warning">
          <span className="qm-stat-value">{formatNumber(totals.queued, locale)}</span>
          <span className="qm-stat-label">{t('queued')}</span>
        </div>
        <div className="qm-stat" data-tone={totals.failed > 0 ? 'danger' : undefined}>
          <span className="qm-stat-value">{formatNumber(totals.failed, locale)}</span>
          <span className="qm-stat-label">{t('failed')}</span>
        </div>
        <div className="qm-stat qm-stat-slots">
          <span className="qm-stat-value">
            {formatNumber(totals.activeSlots, locale)}
            <span className="qm-stat-of"> / {formatNumber(totals.concurrency, locale)}</span>
          </span>
          <span className="qm-stat-label">{t('slots')}</span>
          <Meter used={totals.activeSlots} total={totals.concurrency} />
        </div>
      </div>

      {canCallTools || breakdown ? (
        <div className="qm-tabs" role="tablist">
          {(['projects', 'providers'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              className="rs-tab"
              aria-selected={breakdown === mode}
              disabled={!canCallTools}
              onClick={() => void load(mode)}
            >
              {t(mode)}
              <span className="rs-chip-count">{mode === 'projects' ? totals.projects : totals.providers}</span>
            </button>
          ))}
        </div>
      ) : null}

      {breakdown ? (
        rows.length === 0 ? (
          <StateMessage>{t('noRows')}</StateMessage>
        ) : (
          <ul className="qm-rows">
            {breakdown === 'providers'
              ? (data.providers ?? []).map((row) => (
                  <li key={row.id}>
                    <button type="button" className="qm-row" onClick={() => row.providerUrl && view.openLink(row.providerUrl)}>
                      <span className="qm-row-main">
                        <span className="qm-row-title rs-truncate">{row.name}</span>
                        <span className="qm-row-sub">
                          <Meter used={row.activeSlots} total={row.concurrency} />
                          <span>{row.activeSlots} / {row.concurrency}</span>
                        </span>
                      </span>
                      <Counts running={row.running} queued={row.queued} failed={row.failed} t={t} />
                    </button>
                  </li>
                ))
              : (data.projects ?? []).map((row) => (
                  <li key={row.id}>
                    <button type="button" className="qm-row" onClick={() => row.projectUrl && view.openLink(row.projectUrl)}>
                      <span className="qm-row-main">
                        <span className="qm-row-title rs-truncate">{row.name}</span>
                        {row.providerName ? <span className="qm-row-sub rs-truncate">{row.providerName}</span> : null}
                      </span>
                      <Counts running={row.running} queued={row.queued} failed={row.failed} t={t} />
                    </button>
                  </li>
                ))}
          </ul>
        )
      ) : null}

      {data.hasMore && data.totalRows ? (
        <p className="qm-more">{t('more', { count: data.totalRows - rows.length })}</p>
      ) : null}
    </div>
  );
}

mount(<QueueMonitor />);
