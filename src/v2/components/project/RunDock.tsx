import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Ripple, Text } from '../../../m3';
import { NumberField } from '../../ui/NumberField';

export interface DraftsProgress {
  current: number;
  total: number;
  stage: 'composing' | 'saving';
}

export interface RunDockProps {
  /** The collapsed header: what generates, and a few chips of its settings. */
  title: ReactNode;
  chips?: ReactNode;
  /** Highlights the header when generation can't start yet. */
  attention?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** Settings shown when expanded. Omit for a dock without settings. */
  settings?: ReactNode;
  /** Settings that are always shown, without a collapsible summary. */
  inline?: ReactNode;
  queueCount: number;
  setQueueCount: (count: number) => void;
  combinationsCount: number;
  /** Why drafts can't be added, or the last workflow error. */
  notice?: { tone: 'error' | 'warning'; text: ReactNode } | null;
  onAdd: () => void;
  addDisabled: boolean;
  uploading: boolean;
  isAddingDrafts: boolean;
  draftsProgress: DraftsProgress | null;
}

/** The foot of the workflow panel: generation settings, how many drafts, and Add to drafts. */
export function RunDock({ title, chips, attention, collapsed, onToggle, settings, inline, queueCount, setQueueCount, combinationsCount, notice, onAdd, addDisabled, uploading, isAddingDrafts, draftsProgress }: RunDockProps) {
  const { t } = useTranslation();
  return (
    <div className="v2-run-dock" data-density="compact">
      {settings !== undefined && (
        <>
          <button type="button" className="v2-run-dock__summary m3-focus-ring" data-attention={attention ? '' : undefined} aria-expanded={!collapsed} onClick={onToggle}>
            <Ripple />
            <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
              <Text as="span" variant="label-large" emphasized className="truncate">
                {title}
              </Text>
              {chips && <span className="v2-run-dock__chips">{chips}</span>}
            </span>
            <Icon name="expand_less" className="v2-run-dock__chevron" />
          </button>
          {!collapsed && <div className="v2-run-dock__settings">{settings}</div>}
        </>
      )}
      {inline}
      <div className="v2-run-dock__qty">
        <NumberField label={t('projectViewer.settings.jobQuantity')} min={1} integer value={queueCount} onValueChange={setQueueCount} stepper className="flex-1" fullWidth />
        <Button variant="tonal" size="sm" disabled={combinationsCount === 0} title={t('projectViewer.settings.setToMaxCombinations')} onClick={() => setQueueCount(Math.max(1, combinationsCount))}>
          {t('projectViewer.settings.ofTotal', { count: combinationsCount })}
        </Button>
      </div>
      {notice && (
        <div className="v2-notice" data-tone={notice.tone}>
          <Icon name={notice.tone === 'error' ? 'error' : 'warning'} size={18} />
          <Text variant="body-small" className="line-clamp-2">
            {notice.text}
          </Text>
        </div>
      )}
      <Button variant="filled" size="md" fullWidth emphasized icon={uploading || isAddingDrafts ? undefined : 'add'} loading={uploading || isAddingDrafts} disabled={addDisabled} onClick={onAdd}>
        {uploading
          ? t('projectViewer.settings.uploadingImages')
          : isAddingDrafts
            ? draftsProgress?.stage === 'saving'
              ? t('projectViewer.settings.savingDrafts')
              : t('projectViewer.settings.composingProgress', { current: draftsProgress?.current ?? 0, total: draftsProgress?.total ?? 0 })
            : t('projectViewer.settings.addToDraft')}
      </Button>
    </div>
  );
}

/** A chip in the dock summary. */
export function DockChip({ children, tone }: { children: ReactNode; tone?: 'primary' | 'tertiary' | 'warning' }) {
  return (
    <span className="v2-info-chip" data-tone={tone}>
      {children}
    </span>
  );
}
