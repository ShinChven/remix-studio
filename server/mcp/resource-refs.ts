/**
 * How to read the item references the web app's "Copy ID for AI" button puts
 * on the clipboard (built by `resourceRef` in src/lib/resource-ref.ts — keep
 * the shapes in step). Shared by the in-app assistant's system prompt and the
 * MCP server's instructions, since both receive them pasted into a message.
 */
export const RESOURCE_REF_GUIDE = `The user may paste item references copied from Remix Studio. Each names its ids by kind, parent first:
- \`library:<libraryId>/item:<itemId>\` — a library item: pass \`library_id\` and \`item_id\`.
- \`project:<projectId>/album-item:<itemId>\` — an album item: pass \`project_id\`, and the item id in \`item_ids\` or \`updates[].item_id\`.
- \`campaign:<campaignId>/post:<postId>\` — a campaign post: pass \`postId\` (and \`campaignId\` where a tool asks for it).
Use these ids exactly as written instead of searching for the item by name.`;
