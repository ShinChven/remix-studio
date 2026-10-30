import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, LoadingIndicator, Ripple, Text } from '../../../m3';

export interface DraftsProgress {
  current: number;
  total: number;
  stage: 'composing' | 'saving';
}

export interface RunDockProps {
  /** The collapsed header: what generates, and a few words on its settings. */
  title: ReactNode;
  chips?: ReactNode;
  /** Shown before the title, e.g. the provider's mark. */
  leading?: ReactNode;
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
  /** Adds a workflow step; sits at the start of the dock's action row. */
  addStep?: ReactNode;
}

/** How many drafts to add: a compact stepper, and the combination count that fills it in. */
function QuantityStepper({ value, onChange, max }: { value: number; onChange: (value: number) => void; max: number }) {
  const { t } = useTranslation();
  return (
    <div className="v2-qty" role="group" aria-label={t('projectViewer.settings.jobQuantity')}>
      <IconButton icon="remove" size="xs" label={t('v2.project.fewer')} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))} />
      <input
        className="v2-qty__input"
        type="text"
        inputMode="numeric"
        aria-label={t('projectViewer.settings.jobQuantity')}
        value={value}
        onChange={(e) => {
          const next = Math.floor(Number(e.target.value.replace(/\D/g, '')));
          onChange(Number.isFinite(next) && next >= 1 ? next : 1);
        }}
        onFocus={(e) => e.target.select()}
      />
      <IconButton icon="add" size="xs" label={t('v2.project.more')} onClick={() => onChange(value + 1)} />
      <button type="button" className="v2-qty__max m3-focus-ring" disabled={max === 0} title={t('projectViewer.settings.setToMaxCombinations')} onClick={() => onChange(Math.max(1, max))}>
        <Ripple disabled={max === 0} />/ {max.toLocaleString()}
      </button>
    </div>
  );
}

/** The foot of the workflow panel: what generates and with which settings, how many drafts, and Add to drafts. */
export function RunDock({ title, chips, leading, attention, collapsed, onToggle, settings, inline, queueCount, setQueueCount, combinationsCount, notice, onAdd, addDisabled, uploading, isAddingDrafts, draftsProgress, addStep }: RunDockProps) {
  const { t } = useTranslation();
  const dockRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  // The dock's height as last laid out, so a toggle knows where it is animating from.
  const heightRef = useRef(0);
  // The dock floats over the step list; the list keeps room under its last step for the dock's height.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const host = dock?.closest<HTMLElement>('.v2-workflow');
    if (!dock || !host) return;
    heightRef.current = dock.offsetHeight;
    const observer = new ResizeObserver(() => {
      heightRef.current = dock.offsetHeight;
      host.style.setProperty('--v2-dock-h', `${dock.offsetHeight}px`);
    });
    observer.observe(dock);
    return () => {
      observer.disconnect();
      host.style.removeProperty('--v2-dock-h');
    };
  }, []);

  // The settings stay mounted while the dock shrinks shut, and only leave once it has.
  const [settingsShown, setSettingsShown] = useState(!collapsed);
  if (!collapsed && !settingsShown) setSettingsShown(true);
  const wasCollapsed = useRef(collapsed);
  const motion = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    if (wasCollapsed.current === collapsed) return;
    wasCollapsed.current = collapsed;
    const dock = dockRef.current;
    const panel = settingsRef.current;
    const from = heightRef.current;
    motion.current.forEach((animation) => animation.cancel());
    motion.current = [];
    if (!dock || !panel || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (collapsed) setSettingsShown(false);
      return;
    }
    const timing = { duration: 340, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
    if (collapsed) {
      const to = dock.offsetHeight - panel.offsetHeight - parseFloat(getComputedStyle(dock).rowGap || '0');
      const shrink = dock.animate([{ height: `${from}px` }, { height: `${to}px` }], timing);
      motion.current = [shrink, panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' })];
      shrink.onfinish = () => setSettingsShown(false);
    } else {
      const to = dock.offsetHeight;
      motion.current = [
        dock.animate([{ height: `${from}px` }, { height: `${to}px` }], timing),
        panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 100, fill: 'backwards' }),
      ];
    }
  }, [collapsed]);
  const busy = uploading || isAddingDrafts;
  const progress = uploading
    ? t('projectViewer.settings.uploadingImages')
    : isAddingDrafts
      ? draftsProgress?.stage === 'saving'
        ? t('projectViewer.settings.savingDrafts')
        : t('projectViewer.settings.composingProgress', { current: draftsProgress?.current ?? 0, total: draftsProgress?.total ?? 0 })
      : null;
  return (
    <div ref={dockRef} className="v2-run-dock" data-density="compact" data-open={settings !== undefined && !collapsed ? '' : undefined}>
      {settings !== undefined && (
        <>
          <button type="button" className="v2-run-dock__summary m3-focus-ring" data-attention={attention ? '' : undefined} aria-expanded={!collapsed} onClick={onToggle}>
            <Ripple />
            <span className="v2-run-dock__mark">{leading ?? <Icon name="tune" size={18} />}</span>
            <span className="flex min-w-0 flex-1 flex-col text-start">
              <Text as="span" variant="title-small" emphasized className="truncate">
                {title}
              </Text>
              {chips && <span className="v2-run-dock__chips">{chips}</span>}
            </span>
            <Icon name="expand_less" size={20} className="v2-run-dock__chevron" />
          </button>
          {settingsShown && (
            <div ref={settingsRef} className="v2-run-dock__settings">
              {settings}
            </div>
          )}
        </>
      )}
      {inline}
      {progress && (
        <div className="v2-run-dock__notice" aria-live="polite">
          <LoadingIndicator size={16} aria-hidden />
          <Text as="span" variant="body-small">
            {progress}
          </Text>
        </div>
      )}
      {notice && !progress && (
        <div className="v2-run-dock__notice" data-tone={notice.tone}>
          <Icon name={notice.tone === 'error' ? 'error' : 'info'} size={16} />
          <Text as="span" variant="body-small" className="line-clamp-2">
            {notice.text}
          </Text>
        </div>
      )}
      <div className="v2-run-dock__go">
        {addStep}
        <span className="v2-run-dock__run">
          <QuantityStepper value={queueCount} onChange={setQueueCount} max={combinationsCount} />
          <IconButton
            icon={busy ? <LoadingIndicator size={20} aria-hidden /> : 'playlist_add'}
            variant="filled"
            size="sm"
            className="v2-run-dock__add"
            label={progress || t('v2.project.addDrafts')}
            tooltip
            disabled={addDisabled}
            onClick={onAdd}
          />
        </span>
      </div>
    </div>
  );
}

/** One fact in the dock summary, set apart from the next by a dot. */
export function DockChip({ children, tone }: { children: ReactNode; tone?: 'primary' | 'tertiary' | 'warning' }) {
  return (
    <span className="v2-dock-fact" data-tone={tone}>
      {children}
    </span>
  );
}
