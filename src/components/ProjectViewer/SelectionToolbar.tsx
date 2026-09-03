import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, Square } from 'lucide-react';

interface SelectionToolbarProps {
  /** Total number of items in the list. */
  totalCount: number;
  /** Number of currently selected items. */
  selectedCount: number;
  /** Accent color used for the CheckSquare icon. Defaults to 'blue'. */
  accentColor?: 'blue' | 'emerald';
  /** Called when the Select All / Deselect All button is clicked. */
  onToggleSelectAll: () => void;
  /**
   * Action buttons shown in the left area when selectedCount > 0
   * (e.g. Delete Selected, Start Selected).
   */
  selectionActions?: React.ReactNode;
  /**
   * Content shown in the left area when selectedCount === 0
   * (e.g. Export All, Copy All in AlbumTab).
   */
  zeroSelectionActions?: React.ReactNode;
  /**
   * Content always shown on the right side of the toolbar
   * (e.g. Start All Now, Clear All Failed, item count badge).
   */
  rightActions?: React.ReactNode;
  /**
   * Optional content rendered before the Select All button,
   * separated by a vertical divider (e.g. AlbumTab's item count + MB display).
   */
  prefix?: React.ReactNode;
}

/** A thin vertical divider — only shown once the pane is wide enough for labelled buttons. */
function Divider() {
  return <div className="hidden @min-[56rem]/pane:block h-4 w-px bg-neutral-200 dark:bg-neutral-800 flex-shrink-0" />;
}

export function SelectionToolbar({
  totalCount,
  selectedCount,
  accentColor = 'blue',
  onToggleSelectAll,
  selectionActions,
  zeroSelectionActions,
  rightActions,
  prefix,
}: SelectionToolbarProps) {
  const { t } = useTranslation();

  const checkIconClass =
    accentColor === 'emerald' ? 'text-emerald-500' : 'text-blue-500';

  return (
    // Everything here wraps. Buttons keep their intrinsic width (flex-shrink-0), so a
    // no-wrap row would let the two groups slide over each other once the pane got
    // narrow; wrapping makes an overflow impossible at any width.
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between bg-white dark:bg-neutral-950 border border-neutral-200/50 dark:border-white/5 gap-x-2 gap-y-2 @min-[56rem]/pane:gap-x-3 shadow-lg shadow-black/5 dark:shadow-black/20 px-3 py-2 @min-[56rem]/pane:p-3 rounded-none border-x-0 border-t-0">
      <div className="flex flex-wrap items-center min-w-0 gap-1.5 @min-[56rem]/pane:gap-x-3 @min-[56rem]/pane:gap-y-2">
        {prefix && (
          <div className="hidden @xl/pane:flex items-center gap-2 flex-shrink-0">
            {prefix}
            <Divider />
          </div>
        )}

        <button
          onClick={onToggleSelectAll}
          title={t('projectViewer.common.selectAll')}
          aria-label={t('projectViewer.common.selectAll')}
          className="flex items-center justify-start gap-2 @min-[56rem]/pane:gap-3 min-h-8 p-1 rounded-lg text-[10px] font-bold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white uppercase tracking-widest transition-colors flex-shrink-0"
        >
          {selectedCount === totalCount && totalCount > 0 ? (
            <CheckSquare className={`w-4 h-4 ${checkIconClass}`} />
          ) : (
            <Square className="w-4 h-4" />
          )}
          <span className="hidden @min-[56rem]/pane:inline whitespace-nowrap">{t('projectViewer.common.selectAll')}</span>
        </button>

        {/* Compact stand-in for the "N selected" label while the pane is too narrow for it. */}
        <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest whitespace-nowrap flex-shrink-0 @min-[56rem]/pane:hidden">
          {selectedCount > 0 ? `${selectedCount}/${totalCount}` : `${totalCount}`}
        </span>

        {selectedCount > 0 && (
          <>
            <Divider />
            <span className="hidden @min-[56rem]/pane:inline text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest flex-shrink-0 whitespace-nowrap">
              {t('projectViewer.common.selectedCount', { count: selectedCount })}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 @min-[56rem]/pane:gap-2 min-w-0">
              {selectionActions}
            </div>
          </>
        )}

        {selectedCount === 0 && zeroSelectionActions && (
          <>
            <Divider />
            <div className="flex flex-wrap items-center gap-1.5 @min-[56rem]/pane:gap-2 min-w-0">
              {zeroSelectionActions}
            </div>
          </>
        )}
      </div>

      {/* Right group */}
      {rightActions && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 @min-[56rem]/pane:gap-2 ml-auto min-w-0">
          {rightActions}
        </div>
      )}
    </div>
  );
}
