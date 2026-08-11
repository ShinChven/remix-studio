import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPostedCounts } from '../api';
import { cn } from '../lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

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

interface DayBucket {
  date: Date;
  key: string;
  posted: number;
  failed: number;
}

interface PostingTrendChartProps {
  from: Date;
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
  const [buckets, setBuckets] = useState<DayBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const fromTime = startOfLocalDay(from).getTime();
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
    const rangeStart = new Date(fromTime);
    const rangeEnd = new Date(toTime);

    const emptyBuckets: DayBucket[] = [];
    // Cap the bucket count so an extreme custom range can't blow up the render.
    for (const cursor = new Date(rangeStart); cursor <= rangeEnd && emptyBuckets.length < 400; cursor.setDate(cursor.getDate() + 1)) {
      const date = new Date(cursor);
      emptyBuckets.push({ date, key: localDateKey(date), posted: 0, failed: 0 });
    }

    const load = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const counts = await fetchPostedCounts(
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
          new Date().getTimezoneOffset(),
        );
        if (cancelled) return;
        const byDate = new Map(counts.map((entry) => [entry.date, entry]));
        setBuckets(emptyBuckets.map((bucket) => ({
          ...bucket,
          posted: byDate.get(bucket.key)?.posted ?? 0,
          failed: byDate.get(bucket.key)?.failed ?? 0,
        })));
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load posting trend', error);
        setBuckets(emptyBuckets);
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

  const linePath = (pick: (bucket: DayBucket) => number) =>
    buckets.map((bucket, index) => `${index === 0 ? 'M' : 'L'}${pointX(index).toFixed(2)},${pointY(pick(bucket)).toFixed(2)}`).join(' ');

  const areaPath = () => {
    if (buckets.length === 0) return '';
    const baseline = padding.top + innerHeight;
    return `${linePath((bucket) => bucket.posted)} L${pointX(buckets.length - 1).toFixed(2)},${baseline} L${pointX(0).toFixed(2)},${baseline} Z`;
  };

  const spansWeekOrLess = buckets.length <= 7;
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, spansWeekOrLess
    ? { weekday: 'short' }
    : { month: 'numeric', day: 'numeric' }), [i18n.language, spansWeekOrLess]);
  const tooltipFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }), [i18n.language]);

  const labelIndices = useMemo(() => {
    if (buckets.length === 0) return [];
    const maxLabels = Math.max(2, Math.floor(Math.max(innerWidth, 1) / (spansWeekOrLess ? 38 : 44)));
    const step = Math.max(1, Math.ceil(buckets.length / maxLabels));
    const indices: number[] = [];
    for (let index = 0; index < buckets.length; index += step) indices.push(index);

    // Always label the last day, but drop the one before it if they would collide.
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
  // Per-day dots turn into noise past a couple of weeks; the crosshair still
  // exposes every day's exact value.
  const showMarkers = !isEmpty && buckets.length <= 14;
  const activeBucket = activeIndex != null ? buckets[activeIndex] : null;
  const tooltipLeft = activeIndex != null
    ? Math.min(Math.max(pointX(activeIndex), 72), Math.max(72, width - 72))
    : 0;

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
            <span className="text-[13px] font-medium text-neutral-500">
              {t('postingTrend.rangeSummary', { days: buckets.length })}
            </span>
          </div>
        </div>

        {showFailed && (
          <div className="flex items-center gap-3 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              {t('postingTrend.posted')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {t('postingTrend.failed')}
            </span>
          </div>
        )}
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
                {dateFormatter.format(buckets[index].date)}
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

                {/* Dense ranges drop their dots, so the hovered day still gets one. */}
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

                {/* Selective direct label: the peak day only */}
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
              {tooltipFormatter.format(activeBucket.date)}
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
