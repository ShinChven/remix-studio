import { useState } from 'react';
import { CalendarClock, ExternalLink, Film, ImageOff } from 'lucide-react';
import { useToolView } from './shared/runtime';
import { Header, StateMessage, Waiting, formatTime, mount } from './shared/ui';
import './post-preview.css';

/** The get_post result: the Post row with its media and executions. */
interface PostResult {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt?: string | null;
  createdAt?: string;
  url?: string;
  media?: {
    id: string;
    type: string;
    status: string;
    sourceUrl?: string | null;
    processedUrl?: string | null;
    thumbnailUrl?: string | null;
    errorMsg?: string | null;
  }[];
  executions?: {
    id: string;
    status: string;
    externalUrl?: string | null;
    errorMsg?: string | null;
    publishedAt?: string | null;
  }[];
}

type Tone = 'success' | 'danger' | 'info' | 'warning' | undefined;

function toneOf(status: string): Tone {
  if (status === 'completed' || status === 'posted' || status === 'ready') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'scheduled' || status === 'publishing' || status === 'processing') return 'info';
  if (status === 'pending') return 'warning';
  return undefined;
}

function MediaTile({ media, urls }: { media: NonNullable<PostResult['media']>[number]; urls: Record<string, string> }) {
  const [failed, setFailed] = useState(false);
  const pick = (key?: string | null) => (key ? urls[key] : undefined);
  const isVideo = media.type === 'video';
  const poster = pick(media.thumbnailUrl) ?? (isVideo ? undefined : pick(media.processedUrl) ?? pick(media.sourceUrl));
  const playable = isVideo ? pick(media.processedUrl) ?? pick(media.sourceUrl) : undefined;

  if (playable) {
    return <video src={playable} poster={poster} controls playsInline preload="metadata" />;
  }
  if (poster && !failed) {
    return <img src={poster} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <span className="pp-media-placeholder">
      {isVideo ? <Film size={22} aria-hidden /> : <ImageOff size={22} aria-hidden />}
    </span>
  );
}

function PostPreview() {
  const view = useToolView<PostResult>('post-preview');
  const { data, mediaUrls, error, t } = view;

  if (!data && error) {
    return <div className="rs-view"><StateMessage tone="danger">{error}</StateMessage></div>;
  }
  if (!data) return <Waiting t={t} />;

  const locale = t.locale;
  const media = data.media ?? [];
  const executions = data.executions ?? [];
  const firstLine = (data.textContent ?? '').split('\n').find((line) => line.trim()) ?? '';

  return (
    <div className="rs-view">
      <Header
        title={firstLine || t('noText')}
        subtitle={formatTime(data.createdAt, locale)}
        url={data.url}
        onOpen={view.openLink}
        t={t}
      />

      <div className="pp-status">
        <span className="rs-badge" data-tone={toneOf(data.status)}>{t.status(data.status)}</span>
        {data.scheduledAt ? (
          <span className="pp-schedule">
            <CalendarClock size={14} aria-hidden />
            {t('scheduledFor', { time: formatTime(data.scheduledAt, locale) })}
          </span>
        ) : null}
      </div>

      <article className="pp-card">
        {data.textContent ? <p className="pp-text">{data.textContent}</p> : <p className="pp-text pp-empty">{t('noText')}</p>}
        {media.length > 0 ? (
          <ul className={`pp-media pp-media-${Math.min(media.length, 4)}`} aria-label={t('media')}>
            {media.map((item) => (
              <li key={item.id} className="pp-media-item">
                <MediaTile media={item} urls={mediaUrls} />
                {item.status !== 'ready' ? (
                  <span className="pp-media-status rs-badge" data-tone={toneOf(item.status)} title={item.errorMsg ?? undefined}>
                    {t.status(item.status)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      {executions.length > 0 ? (
        <section className="pp-section">
          <h2 className="pp-section-title">{t('publishing')}</h2>
          <ul className="pp-executions">
            {executions.map((execution) => (
              <li key={execution.id} className="pp-execution">
                <span className="rs-badge" data-tone={toneOf(execution.status)}>{t.status(execution.status)}</span>
                <span className="pp-execution-detail rs-truncate" title={execution.errorMsg ?? undefined}>
                  {execution.errorMsg || formatTime(execution.publishedAt, locale)}
                </span>
                {execution.externalUrl ? (
                  <button type="button" className="rs-button" onClick={() => view.openLink(execution.externalUrl!)}>
                    <ExternalLink size={14} aria-hidden />
                    <span className="rs-label-collapsible">{t('viewPublished')}</span>
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

mount(<PostPreview />);
