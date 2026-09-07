import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AtSign, ChevronRight, FileText, FolderOpen, Megaphone, Sparkles, X } from 'lucide-react';

import type { AssistantConversationResource, AssistantResourceEntityType } from '../../api';

const RESOURCE_ICONS: Record<AssistantResourceEntityType, React.ComponentType<{ className?: string }>> = {
  project: Sparkles,
  library: FolderOpen,
  campaign: Megaphone,
  post: FileText,
};

// Collapsed to zero width at rest so long names get the full row, and revealed
// on hover or keyboard focus.
const ACTION_BUTTON_CLASS = [
  'flex flex-shrink-0 items-center justify-center overflow-hidden rounded-lg text-neutral-500 dark:text-neutral-400',
  'w-0 p-0 opacity-0 transition-all duration-150',
  'group-hover:w-7 group-hover:p-1.5 group-hover:opacity-100',
  'focus-visible:w-7 focus-visible:p-1.5 focus-visible:opacity-100',
].join(' ');

interface AssistantResourcePanelProps {
  resources: AssistantConversationResource[];
  onMention: (resource: AssistantConversationResource) => void;
  onRemove: (resource: AssistantConversationResource) => void;
  onNavigate?: () => void;
}

/**
 * Resources the assistant touched in this conversation, most recent first.
 *
 * Lives under the conversation list in the assistant sidebar. Each row links to
 * the entity and can be dropped straight into the composer as a bound context,
 * which is the same thing typing `@` does.
 */
export const AssistantResourcePanel: React.FC<AssistantResourcePanelProps> = ({
  resources,
  onMention,
  onRemove,
  onNavigate,
}) => {
  const { t } = useTranslation();

  const typeLabel = (entityType: AssistantResourceEntityType) => t(
    `assistant.resourceType.${entityType}`,
    entityType === 'project'
      ? 'Project'
      : entityType === 'library'
        ? 'Library'
        : entityType === 'campaign'
          ? 'Campaign'
          : 'Post',
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-neutral-200/50 dark:border-white/5">
      <div className="flex-shrink-0 px-4 pb-2 pt-3">
        <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          {t('assistant.resourcesTitle', 'Resources')}
        </h4>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-1">
        {resources.map((resource) => {
          const Icon = RESOURCE_ICONS[resource.entityType] ?? FolderOpen;
          const label = resource.name || resource.entityId;
          return (
            <div
              key={resource.id}
              className="group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span className="flex-shrink-0 rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
                <Icon className="h-3.5 w-3.5" />
              </span>

              <Link
                to={resource.href}
                onClick={onNavigate}
                className="min-w-0 flex-1"
                title={resource.summary || `${typeLabel(resource.entityType)}: ${label}`}
              >
                <span className="flex items-center gap-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  <span className="truncate">{label}</span>
                  <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                </span>
                {/* Why the row is here: the tool behind its latest mention.
                    It gets the whole line — the icon carries the entity kind
                    and the tooltip names it, so prefixing the type here only
                    truncated the reason. Tool titles are shown untranslated,
                    as they are in the tool approvals dialog; rows recorded
                    before tools were tracked fall back to the type. */}
                <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                  {resource.toolTitle
                    || resource.toolName
                    || `${typeLabel(resource.entityType)}${resource.subType ? ` • ${resource.subType}` : ''}`}
                </span>
              </Link>

              <button
                type="button"
                onClick={() => onMention(resource)}
                title={t('assistant.mentionResource', 'Mention in chat')}
                className="flex-shrink-0 rounded-lg p-1.5 text-neutral-500 opacity-0 transition-all hover:bg-indigo-500/10 hover:text-indigo-600 focus:opacity-100 group-hover:opacity-100 dark:text-neutral-400 dark:hover:text-indigo-300"
              >
                <AtSign className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onRemove(resource)}
                title={t('assistant.removeResource', 'Remove from list')}
                className="flex-shrink-0 rounded-lg p-1.5 text-neutral-500 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100 dark:text-neutral-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
