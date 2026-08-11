/**
 * Shared helpers for the MiniMax platform (https://api.minimax.io).
 *
 * The MiniMax M-series models always reason before answering. With
 * `reasoning_split: true` the thinking is returned in `reasoning_details` and
 * `content` holds the answer alone, but the flag is only honoured on the
 * OpenAI-compatible Chat Completions endpoint, and a model that ignores it
 * falls back to wrapping its reasoning in `<think>` tags inside `content`.
 * Both call sites strip the tags so the workspace never stores them.
 */
export const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1';

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;
/** An unterminated block, which is what a response truncated by the token limit leaves behind. */
const UNCLOSED_THINK_BLOCK = /<think>[\s\S]*$/i;

export function stripThinkTags(text: string): string {
  if (!text.includes('<think>')) return text;
  return text.replace(THINK_BLOCK, '').replace(UNCLOSED_THINK_BLOCK, '').trim();
}

/**
 * Trims a provider base URL back to the API root MiniMax expects
 * (`https://host/v1`), accepting a bare host or a full endpoint URL.
 */
export function normalizeMiniMaxBaseUrl(apiUrl?: string | null): string {
  if (!apiUrl) return MINIMAX_DEFAULT_BASE_URL;

  try {
    const parsed = new URL(apiUrl);
    let pathname = parsed.pathname.replace(/\/+$/, '');

    // Drop a known endpoint path so a pasted endpoint URL still resolves.
    pathname = pathname.replace(
      /\/(chat\/completions|image_generation|music_generation|video_generation|t2a_v2|files\/upload)$/,
      '',
    );

    if (!/\/v[12]$/.test(pathname)) {
      pathname = `${pathname}/v1`;
    }

    parsed.pathname = pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return MINIMAX_DEFAULT_BASE_URL;
  }
}

/**
 * The video API lives under `/v2` while everything else is `/v1`, so the video
 * generator derives its own root from whatever version the provider carries.
 */
export function miniMaxApiRoot(baseUrl: string, version: 'v1' | 'v2'): string {
  return baseUrl.replace(/\/v[12]$/, `/${version}`);
}

/** `base_resp.status_code` is 0 on success; anything else carries the failure. */
export interface MiniMaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

export function miniMaxBaseRespError(baseResp?: MiniMaxBaseResp): string | undefined {
  if (!baseResp) return undefined;
  const code = baseResp.status_code;
  if (code === undefined || code === 0) return undefined;
  return baseResp.status_msg
    ? `MiniMax error ${code}: ${baseResp.status_msg}`
    : `MiniMax error ${code}`;
}
