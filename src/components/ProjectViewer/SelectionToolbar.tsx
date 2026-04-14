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
  /** Keep the mobile toolbar on a single row for compact icon-first action sets. */
  mobileSingleLine?: boolean;
  /** Push mobile action buttons to the right edge while keeping desktop layout unchanged. */
  mobileActionsRight?: boolean;
}

/** A thin vertical divider — hidden on small screens so it never orphans on a wrapped line. */
function Divider() {
  return <div className="hidden lg:block h-4 w-px bg-neutral-800 flex-shrink-0" />;
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
  mobileSingleLine = false,
  mobileActionsRight = false,
}: SelectionToolbarProps) {
  const { t } = useTranslation();

  const checkIconClass =
    accentColor === 'emerald' ? 'text-emerald-500' : 'text-blue-500';

  return (
    <div
      className={`sticky top-0 z-20 flex justify-between bg-neutral-950/90 backdrop-blur-md border border-neutral-800 p-2.5 sm:px-4 sm:py-3 rounded-lg sm:rounded-xl gap-2 sm:gap-3 shadow-lg shadow-black/20 ${
        mobileSingleLine ? 'flex-row items-center lg:flex-row lg:items-center' : 'flex-col lg:flex-row lg:items-center'
      }`}
    >
      <div
        className={`flex items-center w-full lg:w-auto gap-1.5 sm:gap-x-3 sm:gap-y-2 ${
          mobileSingleLine ? 'flex-nowrap min-w-0' : 'flex-wrap'
        }`}
      >
        {prefix && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            {prefix}
            <Divider />
          </div>
        )}

        <button
          onClick={onToggleSelectAll}
          title={t('projectViewer.common.selectAll')}
          aria-label={t('projectViewer.common.selectAll')}
          className="flex items-center justify-center gap-1.5 sm:gap-2 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg hover:bg-neutral-800 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors flex-shrink-0"
        >
          {selectedCount === totalCount && totalCount > 0 ? (
            <CheckSquare className={`w-4 h-4 sm:w-4 sm:h-4 ${checkIconClass}`} />
          ) : (
            <Square className="w-4 h-4 sm:w-4 sm:h-4" />
          )}
          <span className="hidden sm:inline whitespace-nowrap">{t('projectViewer.common.selectAll')}</span>
        </button>

        <span className="sm:hidden text-[10px] font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap flex-shrink-0">
          {selectedCount > 0 ? `${selectedCount}/${totalCount}` : `${totalCount}`}
        </span>

        {selectedCount > 0 && (
          <>
            <Divider />
            <span className="hidden sm:inline text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex-shrink-0 whitespace-nowrap">
              {t('projectViewer.common.selectedCount', { count: selectedCount })}
            </span>
            <div
              className={`flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
                mobileActionsRight ? 'ml-auto sm:ml-0' : ''
              }`}
            >
              {selectionActions}
            </div>
          </>
        )}

        {selectedCount === 0 && zeroSelectionActions && (
          <>
            <Divider />
            <div
              className={`flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
                mobileActionsRight ? 'ml-auto sm:ml-0' : ''
              }`}
            >
              {zeroSelectionActions}
            </div>
          </>
        )}
      </div>

      {/* Right group */}
      {rightActions && (
        <div
          className={`flex items-center gap-1.5 sm:gap-2 lg:w-auto lg:justify-end flex-shrink-0 ${
            mobileSingleLine
              ? 'ml-auto flex-nowrap w-auto pt-0 border-none'
              : 'ml-auto flex-wrap w-full pt-2 border-t border-neutral-800/50 lg:w-auto lg:pt-0 lg:border-none'
          }`}
        >
          {rightActions}
        </div>
      )}
    </div>
  );
}
