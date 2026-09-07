/**
 * Resolves an assistant tool call into the workspace entity it changed.
 *
 * The assistant sidebar lists these as "resources this conversation changed",
 * so detection runs server-side (right after a tool succeeds) and the result is
 * persisted — the UI never has to re-derive it from raw tool payloads.
 *
 * Only tools that write are passed in: the runner skips `category: 'read'`, so
 * merely looking a library up does not put it in the list. Every call reaching
 * this module therefore either created its entity or changed an existing one.
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

/**
 * `created` is the tool that brings the entity into existence, not any tool
 * whose name starts with "create" — `create_prompt` creates a prompt, but what
 * it does to the library it lands in is an update.
 */
function summarize(kind: string, name: string | null, created: boolean): string {
  const subject = name ? `${kind} "${name}"` : kind;
  return created ? `${subject} is ready.` : `${subject} was updated.`;
}

const POST_TOOL_NAMES = new Set([
  'create_post',
  'update_post',
  'update_post_text',
  'add_media_to_post',
  'schedule_post',
]);

const CAMPAIGN_TOOL_NAMES = new Set(['create_campaign', 'update_campaign']);

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
      // A post has no name of its own unless it carries a title, and the id
      // slice is a display label rather than something to quote in a sentence.
      name: getStringField(result, 'title') ?? `Post ${postId.slice(0, 8)}`,
      subType: null,
      href: `/campaigns/${postCampaignId}/posts/edit/${postId}`,
      summary: summarize('Post', null, name === 'create_post'),
    };
  }

  const campaignId = getStringField(result, 'campaignId')
    ?? getStringField(args, 'campaignId')
    ?? (CAMPAIGN_TOOL_NAMES.has(name) ? getStringField(result, 'id') : null);
  if (campaignId) {
    const campaignName = getStringField(result, 'name')
      ?? getStringField(result, 'campaignName')
      ?? getStringField(args, 'name');
    return {
      entityType: 'campaign',
      entityId: campaignId,
      name: campaignName,
      subType: null,
      href: `/campaigns/${campaignId}`,
      summary: summarize('Campaign', campaignName, name === 'create_campaign'),
    };
  }

  // Checked before libraries: the job and project tools carry both ids, and it
  // is the project they change — the library is only the source they read from.
  const projectId = getStringField(result, 'projectId') ?? getStringField(args, 'projectId');
  if (projectId) {
    // Tools that act on a project rather than rename it report it as
    // `projectName`, since `name` in their payload means something else.
    const projectName = getStringField(result, 'name')
      ?? getStringField(result, 'projectName')
      ?? getStringField(args, 'name');
    return {
      entityType: 'project',
      entityId: projectId,
      name: projectName,
      subType: getStringField(result, 'type') ?? getStringField(args, 'type'),
      href: `/project/${projectId}`,
      summary: summarize('Project', projectName, name === 'create_project_with_workflow'),
    };
  }

  const libraryName = getStringField(result, 'name')
    ?? getStringField(result, 'libraryName')
    ?? getStringField(args, 'name')
    ?? getStringField(args, 'libraryName');
  const librarySubType = getStringField(result, 'type') ?? getStringField(args, 'type');

  if (name === 'create_library') {
    const id = getStringField(result, 'id');
    if (!id) return null;
    return {
      entityType: 'library',
      entityId: id,
      name: libraryName,
      subType: librarySubType,
      href: `/library/${id}`,
      summary: summarize('Library', libraryName, true),
    };
  }

  const libraryId = getStringField(result, 'library_id')
    ?? getStringField(result, 'libraryId')
    ?? getStringField(args, 'library_id')
    ?? getStringField(args, 'libraryId');
  if (libraryId) {
    return {
      entityType: 'library',
      entityId: libraryId,
      name: libraryName,
      subType: librarySubType,
      href: `/library/${libraryId}`,
      summary: summarize('Library', libraryName, false),
    };
  }

  return null;
}
