/**
 * Builders for browser-facing Remix Studio links returned by tools.
 *
 * Tools hand back these absolute URLs alongside the raw ids so an MCP client
 * (or the in-app assistant) can show the user a clickable link to the library,
 * project, campaign, or post it just read or wrote.
 *
 * The public origin comes from `APP_URL` when configured — it is the documented
 * browser-visible origin — otherwise from the incoming request (MCP transport)
 * and finally from the local dev default.
 */

const DEFAULT_APP_URL = 'http://localhost:3000';

export function resolveAppBaseUrl(requestOrigin?: string | null): string {
  const raw = process.env.APP_URL?.trim() || requestOrigin?.trim() || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, '');
}

export interface AppUrlBuilder {
  /** Normalized public origin, without a trailing slash. */
  base: string;
  library(libraryId: string): string;
  project(projectId: string): string;
  campaign(campaignId: string): string;
  campaignPost(campaignId: string, postId: string): string;
}

export function createAppUrlBuilder(requestOrigin?: string | null): AppUrlBuilder {
  const base = resolveAppBaseUrl(requestOrigin);
  const seg = (value: string) => encodeURIComponent(value);
  return {
    base,
    library: (libraryId) => `${base}/library/${seg(libraryId)}`,
    project: (projectId) => `${base}/project/${seg(projectId)}`,
    campaign: (campaignId) => `${base}/campaigns/${seg(campaignId)}`,
    campaignPost: (campaignId, postId) => `${base}/campaigns/${seg(campaignId)}/posts/${seg(postId)}`,
  };
}
