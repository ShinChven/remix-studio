import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPostedCounts, type PostedCountBucket } from '../api';
import { cn } from '../lib/utils';

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
    <div
      className={cn(
        'rounded-card border border-neutral-200/50 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70 sm:p-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
            {t('postingTrend.label')}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">
              {isLoading ? '—' : totals.posted}
            </span>
            <span className="text-[13px] font-medium text-neutral-500">{summary}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          {granularity !== 'day' && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
              {t(granularity === 'week' ? 'postingTrend.perWeek' : 'postingTrend.perMonth')}
            </span>
          )}
          {showFailed && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                {t('postingTrend.posted')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {t('postingTrend.failed')}
              </span>
            </>
          )}
        </div>
      </div>

      <div ref={containerRef} className="relative mt-4 w-full">
        {width > 0 && (
          <svg
            width={width}
            height={plotHeight}
            viewBox={`0 0 ${width} ${plotHeight}`}
            className="block text-indigo-500"
            role="img"
            aria-label={t('postingTrend.ariaLabel', { n: totals.posted })}
          >
            <defs>
              <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grid + y-axis */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={pointY(tick)}
                  y2={pointY(tick)}
                  className="stroke-neutral-200 dark:stroke-white/10"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '3 4'}
                />
                <text
                  x={padding.left - 6}
                  y={pointY(tick) + 3}
                  textAnchor="end"
                  className="fill-neutral-400 text-[9px] tabular-nums dark:fill-neutral-500"
                >
                  {tick}
                </text>
              </g>
            ))}

            {/* X labels */}
            {labelIndices.map((index) => (
              <text
                key={buckets[index].key}
                x={pointX(index)}
                y={plotHeight - 6}
                textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'}
                className="fill-neutral-400 text-[9px] dark:fill-neutral-500"
              >
                {axisFormatter.format(buckets[index].start)}
              </text>
            ))}

            {!isLoading && buckets.length > 0 && (
              <>
                {!isEmpty && <path d={areaPath()} fill={`url(#${gradientId}-area)`} />}

                {showFailed && (
                  <g className="text-red-500">
                    <path
                      d={linePath((bucket) => bucket.failed)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity={0.85}
                    />
                  </g>
                )}

                <path
                  d={linePath((bucket) => bucket.posted)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(isEmpty && 'text-neutral-300 dark:text-neutral-700')}
                />

                {showMarkers && buckets.map((bucket, index) => (
                  <circle
                    key={bucket.key}
                    cx={pointX(index)}
                    cy={pointY(bucket.posted)}
                    r={activeIndex === index ? 5 : 4}
                    fill="currentColor"
                    className="stroke-white dark:stroke-neutral-900"
                    strokeWidth={2}
                  />
                ))}

                {/* Dense ranges drop their dots, so the hovered bucket still gets one. */}
                {!showMarkers && !isEmpty && activeIndex != null && (
                  <circle
                    cx={pointX(activeIndex)}
                    cy={pointY(buckets[activeIndex].posted)}
                    r={5}
                    fill="currentColor"
                    className="stroke-white dark:stroke-neutral-900"
                    strokeWidth={2}
                  />
                )}

                {/* Selective direct label: the peak bucket only */}
                {peakIndex >= 0 && activeIndex == null && (
                  <text
                    x={pointX(peakIndex)}
                    y={pointY(buckets[peakIndex].posted) - 10}
                    textAnchor={peakIndex === 0 ? 'start' : peakIndex === buckets.length - 1 ? 'end' : 'middle'}
                    className="fill-neutral-900 text-[10px] font-bold tabular-nums dark:fill-white"
                  >
                    {buckets[peakIndex].posted}
                  </text>
                )}

                {activeIndex != null && (
                  <line
                    x1={pointX(activeIndex)}
                    x2={pointX(activeIndex)}
                    y1={padding.top}
                    y2={padding.top + innerHeight}
                    className="stroke-neutral-400 dark:stroke-neutral-500"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}
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
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-32 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
          </div>
        )}

        {isEmpty && !hasError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-neutral-500 dark:bg-neutral-900/80">
              {t('postingTrend.empty')}
            </span>
          </div>
        )}

        {!isLoading && hasError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-red-500 dark:bg-neutral-900/80">
              {t('postingTrend.error')}
            </span>
          </div>
        )}

        {activeBucket && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left shadow-lg dark:border-white/10 dark:bg-neutral-900"
            style={{ left: tooltipLeft }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              {bucketLabel(activeBucket)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-900 dark:text-white">
              <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
              {t('postingTrend.postedCount', { n: activeBucket.posted })}
            </div>
            {activeBucket.failed > 0 && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-900 dark:text-white">
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                {t('postingTrend.failedCount', { n: activeBucket.failed })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
