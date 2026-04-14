import React from 'react';
import { CheckSquare, ChevronDown, Square } from 'lucide-react';
import { Job } from '../../types';
import { InfoChip } from './InfoChip';

type AccentColor = 'blue' | 'emerald';

interface JobListItemProps {
  job: Job;
  isExpanded: boolean;
  isSelected: boolean;
  accentColor?: AccentColor;
  borderClassName?: string;
  providerName?: string;
  modelName?: string;
  statusBadge?: React.ReactNode;
  metaChips?: React.ReactNode;
  actionButtons?: React.ReactNode;
  expandedContent?: React.ReactNode;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  /** View mode: 'standard' (spaced/rounded) or 'compact' (edge-to-edge/sharp). */
  viewMode?: 'standard' | 'compact';
}

const accentClasses: Record<AccentColor, string> = {
  blue: 'border-blue-500/30 bg-blue-500/5',
  emerald: 'border-emerald-500/30 bg-emerald-500/5',
};

const expandedClasses: Record<AccentColor, string> = {
  blue: 'border-blue-500/50 bg-neutral-900/50 rounded-b-none',
  emerald: 'border-emerald-500/50 bg-neutral-900/50 rounded-b-none',
};

const selectedTextClasses: Record<AccentColor, string> = {
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
};

const providerTextClasses: Record<AccentColor, string> = {
  blue: 'text-blue-500/60',
  emerald: 'text-emerald-500/60',
};

const expandedBorderClasses: Record<AccentColor, string> = {
  blue: 'border-blue-500/30',
  emerald: 'border-emerald-500/30',
};

export function JobListItem({
  job,
  isExpanded,
  isSelected,
  accentColor = 'blue',
  borderClassName = '',
  providerName,
  modelName,
  statusBadge,
  metaChips,
  actionButtons,
  expandedContent,
  onToggleExpand,
  onToggleSelect,
  viewMode = 'standard',
}: JobListItemProps) {
  const headerClassName = isSelected
    ? accentClasses[accentColor]
    : isExpanded
      ? expandedClasses[accentColor]
      : `border-neutral-800 hover:border-neutral-700 ${borderClassName}`.trim();

  return (
    <div className={`flex flex-col gap-0 animate-in fade-in slide-in-from-top-2 duration-300 ${viewMode === 'compact' ? 'border-b border-neutral-800/50' : ''}`}>
      <div
        className={`bg-neutral-950/50 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between transition-all cursor-pointer group/task ${
          viewMode === 'standard' ? 'p-4 rounded-xl border' : 'p-3 lg:py-2.5 rounded-none border-0'
        } ${headerClassName}`}
        onClick={() => onToggleExpand(job.id)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(job.id);
            }}
            className={`flex-shrink-0 p-1 rounded-lg transition-colors ${isSelected ? selectedTextClasses[accentColor] : 'text-neutral-500 hover:text-white'}`}
          >
            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>

          <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-600" />
          </div>

          <span className={`text-xs font-medium truncate ${isExpanded ? 'text-white' : 'text-neutral-400'}`} title={job.prompt}>
            {job.prompt}
          </span>
        </div>

        <div className="flex flex-col gap-2 pl-10 sm:pl-0 lg:pl-0 lg:items-end lg:flex-shrink-0">
          {(providerName || modelName) && (
            <div className="flex items-center lg:hidden">
              <InfoChip className="max-w-[9rem] sm:max-w-none gap-1">
                {providerName && (
                  <span className="truncate leading-none text-neutral-500">
                    {providerName}
                  </span>
                )}
                {providerName && modelName && <span className="w-1 h-1 rounded-full bg-neutral-800 flex-shrink-0" />}
                {modelName && (
                  <span className={`truncate leading-none ${providerTextClasses[accentColor]}`}>
                    {modelName}
                  </span>
                )}
              </InfoChip>
            </div>
          )}

          <div className="flex items-center gap-2 lg:flex-wrap lg:justify-end">
            {(providerName || modelName) && (
              <div className="hidden lg:flex items-center">
                <InfoChip className="max-w-none gap-1">
                  {providerName && (
                    <span className="truncate leading-none text-neutral-500">
                      {providerName}
                    </span>
                  )}
                  {providerName && modelName && <span className="w-1 h-1 rounded-full bg-neutral-800 flex-shrink-0" />}
                  {modelName && (
                    <span className={`truncate leading-none ${providerTextClasses[accentColor]}`}>
                      {modelName}
                    </span>
                  )}
                </InfoChip>
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 self-center">
              {metaChips}
              {statusBadge}
            </div>

            {actionButtons && <div className="ml-auto flex items-center gap-1 self-center flex-shrink-0">{actionButtons}</div>}
          </div>
        </div>
      </div>

      {isExpanded && expandedContent && (
        <div className={`bg-neutral-900/30 border-b p-4 space-y-4 animate-in slide-in-from-top-1 duration-200 ${
          viewMode === 'standard' ? 'border-x rounded-b-xl' : 'border-t border-neutral-800/50'
        } ${expandedBorderClasses[accentColor]}`}>
          {expandedContent}
        </div>
      )}
    </div>
  );
}
