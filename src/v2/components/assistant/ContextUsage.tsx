import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CircularProgress, Dialog, Icon, LinearProgress, Text } from '../../../m3';
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
  disabled?: boolean;
}

function toneClass(percent: number) {
  return percent >= 90 ? 'v2-progress-error' : percent >= 70 ? 'v2-progress-warning' : undefined;
}

/**
 * Context window usage as a small ring button beside the model picker. Clicking it opens a
 * dialog with the context window, the latest reply and conversation totals.
 */
export function ContextUsage({ used, limit, unit, modelLabel, usage, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (used <= 0 && !usage?.replies) return null;

  const fmt = (n: number) => n.toLocaleString(uiLocale());
  const unitLabel = !unit || unit === 'tokens' ? t('v2.accessibility.tokens') : unit;
  const hasLimit = !!limit && limit > 0;
  const percent = hasLimit ? Math.min(100, (used / limit) * 100) : 0;
  const label = hasLimit
    ? t('v2.accessibility.contextUsed', { used: fmt(used), limit: fmt(limit), unit: unitLabel, percent: Math.round(percent) })
    : t('v2.assistant.usage.title');

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
        maxWidth={440}
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
          <section className="flex flex-col gap-2">
            <Text as="h3" variant="title-small">{t('v2.assistant.usage.contextWindow')}</Text>
            {hasLimit ? (
              <>
                <LinearProgress value={percent} thickness={8} aria-label={label} className={toneClass(percent)} />
                <div className="flex items-baseline justify-between gap-3">
                  <Text variant="body-medium" className="tabular-nums">
                    {fmt(used)} / {fmt(limit)} {unitLabel}
                  </Text>
                  <Text variant="label-large" className="tabular-nums">{Math.round(percent)}%</Text>
                </div>
                <Text variant="body-small" className="text-on-surface-variant tabular-nums">
                  {t('v2.assistant.usage.remaining', { count: Math.max(0, limit - used), value: fmt(Math.max(0, limit - used)), unit: unitLabel })}
                </Text>
              </>
            ) : (
              <Text variant="body-medium" className="text-on-surface-variant tabular-nums">
                {t('v2.assistant.usage.noLimit', { value: fmt(used), unit: unitLabel })}
              </Text>
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
