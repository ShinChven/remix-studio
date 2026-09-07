/**
 * Resolves an assistant tool call into the workspace entity it touched.
 *
 * The assistant sidebar lists these as "resources used in this conversation",
 * so detection runs server-side (right after a tool succeeds) and the result is
 * persisted — the UI never has to re-derive it from raw tool payloads.
 */

export type AssistantResourceEntityType = 'library' | 'project' | 'campaign' | 'post';

export interface AssistantResourceTarget {
  entityType: AssistantResourceEntityType;
  entityId: string;
  name: string | null;
  subType: string | null;
  href: string;
  summary: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const POST_TOOL_NAMES = new Set([
  'create_post',
  'get_post',
  'get_post_text',
  'update_post',
  'update_post_text',
  'add_media_to_post',
  'schedule_post',
]);

const CAMPAIGN_TOOL_NAMES = new Set(['create_campaign', 'list_campaigns', 'update_campaign']);

const LIBRARY_ITEM_TOOL_NAMES = [
  'create_prompt',
  'batch_create_prompts',
  'update_prompt',
  'delete_prompt',
  'batch_update_library_items',
  'update_library_item',
];

export function extractAssistantResourceTarget(
  toolName: string | null | undefined,
  toolArgsJson: unknown,
  toolResultJson: unknown,
): AssistantResourceTarget | null {
  const args = asRecord(toolArgsJson);
  const result = asRecord(toolResultJson);
  const name = String(toolName || '');

  const postId = getStringField(result, 'postId')
    ?? (POST_TOOL_NAMES.has(name) ? getStringField(result, 'id') : null)
    ?? getStringField(args, 'postId');
  const postCampaignId = getStringField(result, 'campaignId') ?? getStringField(args, 'campaignId');
  if (postId && postCampaignId) {
    return {
      entityType: 'post',
      entityId: postId,
      name: getStringField(result, 'title') ?? `Post ${postId.slice(0, 8)}`,
      subType: null,
      href: `/campaigns/${postCampaignId}/posts/edit/${postId}`,
      summary: name.includes('update') || name === 'schedule_post' || name === 'add_media_to_post'
        ? 'Post was updated.'
        : 'Post is ready.',
    };
  }

  const campaignId = getStringField(result, 'campaignId')
    ?? getStringField(args, 'campaignId')
    ?? (CAMPAIGN_TOOL_NAMES.has(name) ? getStringField(result, 'id') : null);
  if (campaignId) {
    const campaignName = getStringField(result, 'name') ?? getStringField(args, 'name');
    return {
      entityType: 'campaign',
      entityId: campaignId,
      name: campaignName,
      subType: null,
      href: `/campaigns/${campaignId}`,
      summary: name === 'update_campaign'
        ? (campaignName ? `Campaign "${campaignName}" was updated.` : 'Campaign was updated.')
        : (campaignName ? `Campaign "${campaignName}" is ready.` : 'Campaign is ready.'),
    };
  }

  const projectId = getStringField(result, 'projectId') ?? getStringField(args, 'projectId');
  if (projectId) {
    const projectName = getStringField(result, 'name') ?? getStringField(args, 'name');
    return {
      entityType: 'project',
      entityId: projectId,
      name: projectName,
      subType: getStringField(result, 'type') ?? getStringField(args, 'type'),
      href: `/project/${projectId}`,
      summary: projectName ? `Project "${projectName}" is ready.` : 'Project is ready.',
    };
  }

  const libraryId = getStringField(result, 'library_id')
    ?? getStringField(result, 'libraryId')
    ?? getStringField(args, 'library_id')
    ?? getStringField(args, 'libraryId');
  const libraryName = getStringField(result, 'name')
    ?? getStringField(result, 'libraryName')
    ?? getStringField(args, 'name')
    ?? getStringField(args, 'libraryName');
  const librarySubType = getStringField(result, 'type') ?? getStringField(args, 'type');

  if (name === 'create_library' && getStringField(result, 'id')) {
    const id = getStringField(result, 'id')!;
    return {
      entityType: 'library',
      entityId: id,
      name: libraryName,
      subType: librarySubType,
      href: `/library/${id}`,
      summary: libraryName ? `Library "${libraryName}" is ready.` : 'Library is ready.',
    };
  }

  if (!libraryId) return null;

  const updated = name === 'update_library' || LIBRARY_ITEM_TOOL_NAMES.includes(name);
  if (updated || name.includes('library')) {
    return {
      entityType: 'library',
      entityId: libraryId,
      name: libraryName,
      subType: librarySubType,
      href: `/library/${libraryId}`,
      summary: updated
        ? (libraryName ? `Library "${libraryName}" was updated.` : 'Library was updated.')
        : (libraryName ? `Library "${libraryName}" is ready.` : 'Library is ready.'),
    };
  }

  return null;
}
