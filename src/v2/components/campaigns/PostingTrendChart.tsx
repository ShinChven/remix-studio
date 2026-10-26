import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPostedCounts, type PostedCountBucket } from '../../../api';
import { cx, LoadingIndicator, Text } from '../../../m3';


const DAY_MS = 24 * 60 * 60 * 1000;

/** Long ranges collapse into wider buckets so the line stays readable. */
const DAILY_MAX_DAYS = 120;
const WEEKLY_MAX_DAYS = 500;
/** Safety valve: an all-time range on an old account still has to render. */
const MAX_DAY_BUCKETS = 8000;
/** Fallback window for an all-time range that has no data at all. */
const EMPTY_ALL_TIME_DAYS = 30;

type Granularity = 'day' | 'week' | 'month';

function startOfLocalDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfLocalDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function localDateKey(value: Date) {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function parseLocalDateKey(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local-day range covering the last `days` days, today included. */
export function lastNDaysRange(days: number) {
  const to = endOfLocalDay(new Date());
  const from = startOfLocalDay(new Date(to.getTime() - (days - 1) * DAY_MS));
  return { from, to };
}

/** Integer axis ticks that comfortably cover `max`. */
function axisTicks(max: number) {
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const rawStep = Math.max(1, Math.ceil(Math.max(max, 1) / 4));
  const step = nice.find((candidate) => candidate >= rawStep) ?? Math.ceil(rawStep / 1000) * 1000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
}

interface TrendBucket {
  /** First local day covered by the bucket. */
  start: Date;
  /** Last local day covered by the bucket (same as `start` for daily buckets). */
  end: Date;
  key: string;
  posted: number;
  failed: number;
}

interface PostingTrendChartProps {
  /** Start of the range, or `null` for all time (starts at the first day with data). */
  from: Date | null;
  to: Date;
  className?: string;
  /** Plot height in px. Defaults to a width-aware value so phones get a shorter chart. */
  height?: number;
}

/** Posted (and failed) posts per day, week or month over a range, as an M3-colored line chart. */
export function PostingTrendChart({ from, to, className, height }: PostingTrendChartProps) {
  const { t, i18n } = useTranslation();
  const gradientId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [width, setWidth] = useState(0);
  const [counts, setCounts] = useState<PostedCountBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const isAllTime = from == null;
  const fromTime = from ? startOfLocalDay(from).getTime() : null;
  const toTime = endOfLocalDay(to).getTime();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    setWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // An all-time range asks the server for everything; the first day with data
    // becomes the visible start once the response lands.
    const rangeStart = new Date(fromTime ?? 0);
    const rangeEnd = new Date(toTime);

    const load = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const data = await fetchPostedCounts(
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
          new Date().getTimezoneOffset(),
        );
        if (cancelled) return;
        setCounts(data);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load posting trend', error);
        setCounts([]);
        setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [fromTime, toTime]);

  /** Day-level buckets covering the effective range, zero-filled. */
  const dayBuckets = useMemo(() => {
    const rangeEnd = startOfLocalDay(new Date(toTime));
    const firstWithData = counts.length > 0 ? parseLocalDateKey(counts[0].date) : null;
    const rangeStart = fromTime != null
      ? startOfLocalDay(new Date(fromTime))
      : startOfLocalDay(firstWithData ?? new Date(toTime - (EMPTY_ALL_TIME_DAYS - 1) * DAY_MS));

    const byDate = new Map(counts.map((entry) => [entry.date, entry]));
    const buckets: TrendBucket[] = [];
    for (
      const cursor = new Date(Math.min(rangeStart.getTime(), rangeEnd.getTime()));
      cursor <= rangeEnd && buckets.length < MAX_DAY_BUCKETS;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const date = new Date(cursor);
      const key = localDateKey(date);
      buckets.push({
        start: date,
        end: date,
        key,
        posted: byDate.get(key)?.posted ?? 0,
        failed: byDate.get(key)?.failed ?? 0,
      });
    }
    return buckets;
  }, [counts, fromTime, toTime]);

  const granularity: Granularity = dayBuckets.length <= DAILY_MAX_DAYS
    ? 'day'
    : dayBuckets.length <= WEEKLY_MAX_DAYS
      ? 'week'
      : 'month';

  /** Day buckets rolled up to the granularity the range calls for. */
  const buckets = useMemo(() => {
    if (granularity === 'day') return dayBuckets;

    const groups: TrendBucket[] = [];
    let currentKey = '';
    dayBuckets.forEach((day, index) => {
      // Weeks are chunked from the range start so the range is covered exactly;
      // months follow the calendar.
      const groupKey = granularity === 'week'
        ? `w${Math.floor(index / 7)}`
        : `${day.start.getFullYear()}-${day.start.getMonth()}`;

      if (groupKey !== currentKey) {
        currentKey = groupKey;
        groups.push({ start: day.start, end: day.end, key: day.key, posted: 0, failed: 0 });
      }
      const group = groups[groups.length - 1];
      group.end = day.end;
      group.posted += day.posted;
      group.failed += day.failed;
    });
    return groups;
  }, [dayBuckets, granularity]);

  const totals = useMemo(() => buckets.reduce(
    (acc, bucket) => ({ posted: acc.posted + bucket.posted, failed: acc.failed + bucket.failed }),
    { posted: 0, failed: 0 },
  ), [buckets]);

  const isCompact = width > 0 && width < 400;
  const plotHeight = height ?? (isCompact ? 150 : 190);
  const padding = { top: 18, right: 10, bottom: 22, left: isCompact ? 22 : 28 };
  const innerWidth = Math.max(0, width - padding.left - padding.right);
  const innerHeight = Math.max(0, plotHeight - padding.top - padding.bottom);

  const showFailed = totals.failed > 0;
  const maxValue = buckets.reduce(
    (max, bucket) => Math.max(max, bucket.posted, showFailed ? bucket.failed : 0),
    0,
  );
  const { top: axisTop, ticks } = axisTicks(maxValue);

  const pointX = (index: number) => {
    if (buckets.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index * innerWidth) / (buckets.length - 1);
  };
  const pointY = (value: number) => padding.top + innerHeight - (value / axisTop) * innerHeight;

  const linePath = (pick: (bucket: TrendBucket) => number) =>
    buckets.map((bucket, index) => `${index === 0 ? 'M' : 'L'}${pointX(index).toFixed(2)},${pointY(pick(bucket)).toFixed(2)}`).join(' ');

  const areaPath = () => {
    if (buckets.length === 0) return '';
    const baseline = padding.top + innerHeight;
    return `${linePath((bucket) => bucket.posted)} L${pointX(buckets.length - 1).toFixed(2)},${baseline} L${pointX(0).toFixed(2)},${baseline} Z`;
  };

  const spansWeekOrLess = granularity === 'day' && buckets.length <= 7;
  const spansMultipleYears = buckets.length > 0
    && buckets[0].start.getFullYear() !== buckets[buckets.length - 1].end.getFullYear();

  const axisFormatter = useMemo(() => {
    if (granularity === 'month') {
      return new Intl.DateTimeFormat(i18n.language, spansMultipleYears
        ? { month: 'short', year: '2-digit' }
        : { month: 'short' });
    }
    return new Intl.DateTimeFormat(i18n.language, spansWeekOrLess
      ? { weekday: 'short' }
      : { month: 'numeric', day: 'numeric' });
  }, [i18n.language, granularity, spansWeekOrLess, spansMultipleYears]);

  const tooltipDayFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }), [i18n.language]);
  const tooltipSpanFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
  }), [i18n.language]);
  const tooltipMonthFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  }), [i18n.language]);

  const bucketLabel = (bucket: TrendBucket) => {
    if (granularity === 'month') return tooltipMonthFormatter.format(bucket.start);
    if (granularity === 'week') {
      return `${tooltipSpanFormatter.format(bucket.start)} – ${tooltipSpanFormatter.format(bucket.end)}`;
    }
    return tooltipDayFormatter.format(bucket.start);
  };

  const labelIndices = useMemo(() => {
    if (buckets.length === 0) return [];
    const maxLabels = Math.max(2, Math.floor(Math.max(innerWidth, 1) / (spansWeekOrLess ? 38 : 44)));
    const step = Math.max(1, Math.ceil(buckets.length / maxLabels));
    const indices: number[] = [];
    for (let index = 0; index < buckets.length; index += step) indices.push(index);

    // Always label the last bucket, but drop the one before it if they would collide.
    const last = buckets.length - 1;
    if (indices[indices.length - 1] !== last) {
      if (last - indices[indices.length - 1] < Math.ceil(step * 0.75)) indices.pop();
      indices.push(last);
    }
    return indices;
  }, [buckets.length, innerWidth, spansWeekOrLess]);

  const peakIndex = useMemo(() => {
    if (buckets.length === 0 || maxValue === 0) return -1;
    return buckets.reduce((best, bucket, index) => (bucket.posted > buckets[best].posted ? index : best), 0);
  }, [buckets, maxValue]);

  const indexFromPointer = (event: React.PointerEvent<SVGRectElement>) => {
    if (buckets.length === 0) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    if (buckets.length === 1) return 0;
    const ratio = offsetX / Math.max(1, bounds.width);
    return Math.min(buckets.length - 1, Math.max(0, Math.round(ratio * (buckets.length - 1))));
  };

  const isEmpty = !isLoading && totals.posted === 0 && totals.failed === 0;
  // Per-bucket dots turn into noise past a couple of weeks; the crosshair still
  // exposes every bucket's exact value.
  const showMarkers = !isEmpty && buckets.length <= 14;
  const activeBucket = activeIndex != null ? buckets[activeIndex] : null;
  const tooltipLeft = activeIndex != null
    ? Math.min(Math.max(pointX(activeIndex), 72), Math.max(72, width - 72))
    : 0;

  const summary = isAllTime
    ? t('postingTrend.rangeSummaryAllTime')
    : t('postingTrend.rangeSummary', { days: dayBuckets.length });

  return (
    <div className={cx('v2-trend', className)}>
      <div className="v2-trend__head">
        <div className="flex flex-col">
          <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
            {t('postingTrend.label')}
          </Text>
          <span className="flex items-baseline gap-2">
            <Text as="span" variant="display-small" emphasized className="tabular-nums">
              {isLoading ? '—' : totals.posted}
            </Text>
            <Text as="span" variant="label-medium" className="text-on-surface-variant">
              {summary}
            </Text>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {granularity !== 'day' && <span className="v2-info-chip">{t(granularity === 'week' ? 'postingTrend.perWeek' : 'postingTrend.perMonth')}</span>}
          {showFailed && (
            <>
              <span className="v2-trend__legend" data-series="posted">
                {t('postingTrend.posted')}
              </span>
              <span className="v2-trend__legend" data-series="failed">
                {t('postingTrend.failed')}
              </span>
            </>
          )}
        </div>
      </div>
      <div ref={containerRef} className="v2-trend__plot" style={{ height: plotHeight }}>
        {width > 0 && (
          <svg width={width} height={plotHeight} viewBox={`0 0 ${width} ${plotHeight}`} role="img" aria-label={t('postingTrend.ariaLabel', { n: totals.posted })}>
            <defs>
              <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--md-sys-color-primary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--md-sys-color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={pointY(tick)} y2={pointY(tick)} stroke="var(--md-sys-color-outline-variant)" strokeWidth={1} strokeDasharray={tick === 0 ? undefined : '3 4'} />
                <text x={padding.left - 6} y={pointY(tick) + 3} textAnchor="end" className="v2-trend__axis">
                  {tick}
                </text>
              </g>
            ))}
            {labelIndices.map((index) => (
              <text key={buckets[index].key} x={pointX(index)} y={plotHeight - 6} textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'} className="v2-trend__axis">
                {axisFormatter.format(buckets[index].start)}
              </text>
            ))}
            {!isLoading && buckets.length > 0 && (
              <>
                {!isEmpty && <path d={areaPath()} fill={`url(#${gradientId}-area)`} />}
                {showFailed && <path d={linePath((bucket) => bucket.failed)} fill="none" stroke="var(--md-sys-color-error)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.85} />}
                <path d={linePath((bucket) => bucket.posted)} fill="none" stroke="var(--md-sys-color-primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {showMarkers &&
                  buckets.map((bucket, index) => (
                    <circle key={bucket.key} cx={pointX(index)} cy={pointY(bucket.posted)} r={activeIndex === index ? 5 : 4} fill="var(--md-sys-color-primary)" stroke="var(--md-sys-color-surface-container)" strokeWidth={2} />
                  ))}
                {/* Dense ranges drop their dots, so the hovered bucket still gets one. */}
                {!showMarkers && !isEmpty && activeIndex != null && <circle cx={pointX(activeIndex)} cy={pointY(buckets[activeIndex].posted)} r={5} fill="var(--md-sys-color-primary)" stroke="var(--md-sys-color-surface-container)" strokeWidth={2} />}
                {peakIndex >= 0 && activeIndex == null && (
                  <text x={pointX(peakIndex)} y={pointY(buckets[peakIndex].posted) - 10} textAnchor={peakIndex === 0 ? 'start' : peakIndex === buckets.length - 1 ? 'end' : 'middle'} className="v2-trend__peak">
                    {buckets[peakIndex].posted}
                  </text>
                )}
                {activeIndex != null && <line x1={pointX(activeIndex)} x2={pointX(activeIndex)} y1={padding.top} y2={padding.top + innerHeight} stroke="var(--md-sys-color-outline)" strokeWidth={1} strokeDasharray="3 3" />}
              </>
            )}
            <rect
              x={padding.left}
              y={padding.top}
              width={Math.max(0, innerWidth)}
              height={Math.max(0, innerHeight)}
              fill="transparent"
              onPointerMove={(event) => setActiveIndex(indexFromPointer(event))}
              onPointerDown={(event) => setActiveIndex(indexFromPointer(event))}
              onPointerLeave={() => setActiveIndex(null)}
              onPointerCancel={() => setActiveIndex(null)}
            />
          </svg>
        )}
        {isLoading && (
          <div className="v2-trend__state">
            <LoadingIndicator size={32} />
          </div>
        )}
        {isEmpty && !hasError && (
          <div className="v2-trend__state">
            <Text variant="label-medium" className="text-on-surface-variant">
              {t('postingTrend.empty')}
            </Text>
          </div>
        )}
        {!isLoading && hasError && (
          <div className="v2-trend__state">
            <Text variant="label-medium" className="text-error">
              {t('postingTrend.error')}
            </Text>
          </div>
        )}
        {activeBucket && (
          <div className="v2-trend__tooltip" style={{ left: tooltipLeft }}>
            <Text variant="label-small" emphasized>
              {bucketLabel(activeBucket)}
            </Text>
            <span className="v2-trend__legend" data-series="posted">
              {t('postingTrend.postedCount', { n: activeBucket.posted })}
            </span>
            {activeBucket.failed > 0 && (
              <span className="v2-trend__legend" data-series="failed">
                {t('postingTrend.failedCount', { n: activeBucket.failed })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
