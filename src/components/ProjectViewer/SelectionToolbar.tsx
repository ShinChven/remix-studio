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
    <div className="sticky top-0 z-20 flex items-center justify-between bg-neutral-950/80 backdrop-blur-md border border-neutral-800 px-4 py-3 rounded-xl flex-wrap gap-2 shadow-lg shadow-black/20">
      <div className="flex items-center gap-3">
        {prefix && (
          <>
            {prefix}
            <div className="h-4 w-px bg-neutral-800 mx-1" />
          </>
        )}

        <button
          onClick={onToggleSelectAll}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-neutral-800 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
        >
          {selectedCount === totalCount && totalCount > 0 ? (
            <CheckSquare className={`w-4 h-4 ${checkIconClass}`} />
          ) : (
            <Square className="w-4 h-4" />
          )}
          {t('projectViewer.common.selectAll')}
        </button>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2 pl-4 border-l border-neutral-800">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              {t('projectViewer.common.selectedCount', { count: selectedCount })}
            </span>
            {selectionActions}
          </div>
        )}

        {selectedCount === 0 && zeroSelectionActions && (
          <div className="flex items-center gap-2 pl-4 border-l border-neutral-800">
            {zeroSelectionActions}
          </div>
        )}
      </div>

      {rightActions && (
        <div className="flex items-center gap-2">
          {rightActions}
        </div>
      )}
    </div>
  );
}
