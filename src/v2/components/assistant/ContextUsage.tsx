import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAssistantContextEstimate, type AssistantContextEstimate } from '../../../api';
import { Button, CircularProgress, Dialog, Icon, LinearProgress, LoadingIndicator, Text } from '../../../m3';
import { uiLocale } from '../../lib/format';

/** Token counts summed over the assistant replies of a conversation. */
export interface ConversationUsage {
  /** Assistant replies that reported token counts. */
  replies: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Token counts of the latest reply, when it reported them. */
  lastInputTokens: number | null;
  lastOutputTokens: number | null;
}

interface Props {
  /** Prompt tokens of the latest reply: how much of the context window is in use. */
  used: number;
  limit?: number;
  unit?: string;
  modelLabel?: string;
  usage?: ConversationUsage | null;
  /** The open conversation, whose context is broken down by category in the dialog. */
  conversationId?: string | null;
  disabled?: boolean;
}

type CategoryKey = keyof AssistantContextEstimate['categories'];

/** Categories in a fixed order; each keeps its color slot whatever the values. */
const CATEGORIES: { key: CategoryKey; slot: number }[] = [
  { key: 'userMessages', slot: 1 },
  { key: 'assistantMessages', slot: 2 },
  { key: 'toolResults', slot: 3 },
  { key: 'tools', slot: 4 },
  { key: 'systemPrompt', slot: 5 },
  { key: 'images', slot: 6 },
];

function toneClass(percent: number) {
  return percent >= 90 ? 'v2-progress-error' : percent >= 70 ? 'v2-progress-warning' : undefined;
}

/**
 * Context window usage as a small ring button beside the model picker. Clicking it opens a
 * dialog that splits the context by category, with the latest reply and conversation totals.
 */
export function ContextUsage({ used, limit, unit, modelLabel, usage, conversationId, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] = useState<AssistantContextEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  // Load the breakdown when the dialog opens, and again when a new reply changes the total.
  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setLoading(true);
    fetchAssistantContextEstimate(conversationId)
      .then((result) => {
        if (!cancelled) setEstimate(result);
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, used]);

  if (used <= 0 && !usage?.replies) return null;

  const locale = uiLocale();
  const fmt = (n: number) => n.toLocaleString(locale);
  const compact = (n: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const pct = (n: number, of: number) => {
    const value = (n / of) * 100;
    const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format;
    return value > 0 && value < 0.1 ? `<${format(0.1)}%` : `${format(value)}%`;
  };
  const unitLabel = !unit || unit === 'tokens' ? t('v2.accessibility.tokens') : unit;
  const hasLimit = !!limit && limit > 0;
  const percent = hasLimit ? Math.min(100, (used / limit) * 100) : 0;
  const label = hasLimit
    ? t('v2.accessibility.contextUsed', { used: fmt(used), limit: fmt(limit), unit: unitLabel, percent: Math.round(percent) })
    : t('v2.assistant.usage.title');

  const breakdownTotal = estimate?.total ?? 0;
  const scaleOf = hasLimit ? Math.max(limit, breakdownTotal) : breakdownTotal;
  const breakdownPercent = hasLimit && breakdownTotal > 0 ? Math.min(100, (breakdownTotal / limit) * 100) : 0;
  const parts = estimate ? CATEGORIES.filter(({ key }) => estimate.categories[key] > 0) : [];
  const free = hasLimit ? Math.max(0, limit - breakdownTotal) : 0;

  const rows: { label: string; value: string }[] = [];
  if (usage?.lastInputTokens != null) rows.push({ label: t('v2.assistant.usage.lastInput'), value: fmt(usage.lastInputTokens) });
  if (usage?.lastOutputTokens != null) rows.push({ label: t('v2.assistant.usage.lastOutput'), value: fmt(usage.lastOutputTokens) });
  const totals: { label: string; value: string }[] = usage
    ? [
        { label: t('v2.assistant.usage.totalInput'), value: fmt(usage.totalInputTokens) },
        { label: t('v2.assistant.usage.totalOutput'), value: fmt(usage.totalOutputTokens) },
        { label: t('v2.assistant.usage.total'), value: fmt(usage.totalInputTokens + usage.totalOutputTokens) },
        { label: t('v2.assistant.usage.replies'), value: fmt(usage.replies) },
      ]
    : [];

  const renderRows = (items: { label: string; value: string }[]) => (
    <dl className="v2-usage-rows">
      {items.map((row) => (
        <div key={row.label} className="v2-usage-row">
          <dt className="m3-typescale-body-medium text-on-surface-variant">{row.label}</dt>
          <dd className="m3-typescale-label-large tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );

  const renderSimpleWindow = () =>
    hasLimit ? (
      <>
        <LinearProgress value={percent} thickness={8} aria-label={label} className={toneClass(percent)} />
        <div className="flex items-baseline justify-between gap-3">
          <Text variant="body-medium" className="tabular-nums">
            {fmt(used)} / {fmt(limit)} {unitLabel}
          </Text>
          <Text variant="label-large" className="tabular-nums">{Math.round(percent)}%</Text>
        </div>
      </>
    ) : (
      <Text variant="body-medium" className="text-on-surface-variant tabular-nums">
        {t('v2.assistant.usage.noLimit', { value: fmt(used), unit: unitLabel })}
      </Text>
    );

  const renderBreakdown = (data: AssistantContextEstimate) => (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Text variant="title-medium" className="tabular-nums">
          {hasLimit ? t('v2.assistant.usage.percentUsed', { percent: Math.round(breakdownPercent) }) : `${compact(breakdownTotal)} ${unitLabel}`}
        </Text>
        {hasLimit && (
          <Text variant="body-medium" className="text-on-surface-variant tabular-nums">
            {compact(breakdownTotal)} / {compact(limit)}
          </Text>
        )}
      </div>
      <div className="v2-context-bar" role="img" aria-label={label}>
        {parts.map(({ key, slot }) => (
          <span
            key={key}
            className="v2-context-bar__part"
            data-slot={slot}
            style={{ flexGrow: data.categories[key], flexBasis: 0 }}
            title={`${t(`v2.assistant.usage.categories.${key}`)} · ${fmt(data.categories[key])}`}
          />
        ))}
        {hasLimit && free > 0 && <span className="v2-context-bar__free" style={{ flexGrow: free, flexBasis: 0 }} />}
      </div>
      <table className="v2-context-table">
        <tbody>
          {parts.map(({ key, slot }) => (
            <tr key={key}>
              <td>
                <span className="v2-context-swatch" data-slot={slot} aria-hidden />
              </td>
              <th scope="row" className="m3-typescale-body-medium">
                {t(`v2.assistant.usage.categories.${key}`)}
                {key === 'images' && data.imageCount > 0 && (
                  <span className="text-on-surface-variant"> ({fmt(data.imageCount)})</span>
                )}
              </th>
              <td className="m3-typescale-body-medium tabular-nums" title={fmt(data.categories[key])}>{compact(data.categories[key])}</td>
              <td className="m3-typescale-body-medium tabular-nums text-on-surface-variant">{pct(data.categories[key], scaleOf)}</td>
            </tr>
          ))}
          {hasLimit && (
            <tr className="v2-context-table__free">
              <td>
                <span className="v2-context-swatch" data-slot="free" aria-hidden />
              </td>
              <th scope="row" className="m3-typescale-body-medium">{t('v2.assistant.usage.categories.free')}</th>
              <td className="m3-typescale-body-medium tabular-nums" title={fmt(free)}>{compact(free)}</td>
              <td className="m3-typescale-body-medium tabular-nums text-on-surface-variant">{pct(free, scaleOf)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {data.tools.length > 0 && (
        <details className="v2-context-tools">
          <summary className="m3-typescale-body-medium m3-focus-ring">
            <Icon name="chevron_right" size={18} className="v2-context-tools__chevron" />
            <span className="flex-1">{t('v2.assistant.usage.toolList')}</span>
            <span className="tabular-nums text-on-surface-variant">{fmt(data.tools.length)}</span>
          </summary>
          <ul>
            {data.tools.map((tool) => (
              <li key={tool.name} className="m3-typescale-body-small">
                <code className="truncate" title={tool.name}>{tool.name}</code>
                <span className="tabular-nums text-on-surface-variant" title={fmt(tool.tokens)}>{compact(tool.tokens)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Text variant="body-small" className="text-on-surface-variant">
        {data.calibrated && data.reportedInputTokens != null
          ? t('v2.assistant.usage.estimateCalibrated', { value: fmt(data.reportedInputTokens) })
          : t('v2.assistant.usage.estimateRough')}
        {data.omittedMessageCount > 0 && ` ${t('v2.assistant.usage.omitted', { count: data.omittedMessageCount })}`}
      </Text>
    </>
  );

  return (
    <>
      <button
        type="button"
        className="v2-usage-chip m3-focus-ring"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {hasLimit ? (
          <CircularProgress value={percent} size={18} thickness={3} aria-hidden className={toneClass(percent)} />
        ) : (
          <Icon name="data_usage" size={18} />
        )}
        {hasLimit && <span className="tabular-nums">{Math.round(percent)}%</span>}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        icon="data_usage"
        headline={t('v2.assistant.usage.title')}
        describeContent={false}
        maxWidth={480}
        fullScreen="compact"
        actions={
          <Button variant="text" onClick={() => setOpen(false)} data-autofocus>
            {t('v2.assistant.usage.close')}
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {modelLabel && (
            <Text variant="label-large" className="truncate text-on-surface-variant" title={modelLabel}>
              {modelLabel}
            </Text>
          )}
          <section className="flex flex-col gap-3">
            <Text as="h3" variant="title-small">{t('v2.assistant.usage.contextWindow')}</Text>
            {estimate && estimate.total > 0 ? (
              renderBreakdown(estimate)
            ) : loading ? (
              <div className="flex justify-center py-4">
                <LoadingIndicator size={32} aria-label={t('v2.assistant.usage.loading')} />
              </div>
            ) : (
              renderSimpleWindow()
            )}
          </section>
          {rows.length > 0 && (
            <section className="flex flex-col gap-2">
              <Text as="h3" variant="title-small">{t('v2.assistant.usage.lastReply')}</Text>
              {renderRows(rows)}
            </section>
          )}
          {totals.length > 0 && (
            <section className="flex flex-col gap-2">
              <Text as="h3" variant="title-small">{t('v2.assistant.usage.conversation')}</Text>
              {renderRows(totals)}
            </section>
          )}
        </div>
      </Dialog>
    </>
  );
}
