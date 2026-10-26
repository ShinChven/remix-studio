import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AssistantConversationResource, AssistantResourceEntityType } from '../../../api';
import { Icon, IconButton, Text } from '../../../m3';
import { BOUND_CONTEXT_ICONS } from './Composer';

const TYPE_FALLBACK: Record<AssistantResourceEntityType, string> = {
  project: 'Project',
  library: 'Library',
  campaign: 'Campaign',
  post: 'Post',
};

/**
 * Resources the assistant touched in this conversation, most recent first.
 * Each row links to the entity and can be dropped into the composer as a bound context.
 */
export function ResourcePanel({
  resources,
  onMention,
  onRemove,
  onNavigate,
}: {
  resources: AssistantConversationResource[];
  onMention: (resource: AssistantConversationResource) => void;
  onRemove: (resource: AssistantConversationResource) => void;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const typeLabel = (type: AssistantResourceEntityType) => t(`assistant.resourceType.${type}`, TYPE_FALLBACK[type] ?? 'Post');

  return (
    <section className="v2-chat-resources">
      <Text variant="label-medium" className="v2-chat-side__heading">
        {t('assistant.resourcesTitle', 'Resources')}
      </Text>
      <div className="v2-chat-resources__list">
        {resources.map((resource) => {
          const label = resource.name || resource.entityId;
          return (
            <div key={resource.id} className="v2-chat-resource">
              <span className="v2-chat-resource__icon">
                <Icon name={BOUND_CONTEXT_ICONS[resource.entityType] ?? 'folder_open'} size={18} />
              </span>
              <Link
                to={resource.href}
                onClick={onNavigate}
                className="v2-chat-resource__link"
                title={resource.summary || `${typeLabel(resource.entityType)}: ${label}`}
              >
                <span className="v2-chat-resource__name">{label}</span>
                {/* The tool behind its latest mention; rows recorded before tools were tracked fall back to the type. */}
                <span className="v2-chat-resource__meta">
                  {resource.toolTitle || resource.toolName || `${typeLabel(resource.entityType)}${resource.subType ? ` • ${resource.subType}` : ''}`}
                </span>
              </Link>
              <span className="v2-chat-resource__actions">
                <IconButton size="xs" icon="alternate_email" label={t('assistant.mentionResource', 'Mention in chat')} tooltip onClick={() => onMention(resource)} />
                <IconButton size="xs" icon="close" label={t('assistant.removeResource', 'Remove from list')} tooltip onClick={() => onRemove(resource)} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
