/**
 * Copyable references to individual records, meant to be pasted into an AI chat.
 *
 * A bare item id is not enough to act on: every tool that reads or changes an
 * item also needs the library, project or campaign that holds it. So a
 * reference names each id by its kind, parent first, e.g.
 * `library:<libraryId>/item:<itemId>`. The server-side system prompt and MCP
 * instructions describe the same shapes, so keep the three in step.
 */
export const resourceRef = {
  libraryItem: (libraryId: string, itemId: string) => `library:${libraryId}/item:${itemId}`,
  albumItem: (projectId: string, itemId: string) => `project:${projectId}/album-item:${itemId}`,
  post: (campaignId: string, postId: string) => `campaign:${campaignId}/post:${postId}`,
};

/**
 * Writes text to the clipboard. The async Clipboard API only exists in secure
 * contexts, and the app is also served over plain HTTP on a LAN, so fall back
 * to a hidden textarea and execCommand there.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected');
  } finally {
    document.body.removeChild(textarea);
  }
}
