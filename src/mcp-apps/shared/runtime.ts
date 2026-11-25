import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyDocumentTheme,
  useApp,
  useHostStyles,
  type App,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/react';
import { createTranslator, type Translator } from './i18n';

/** Must match MEDIA_URLS_META_KEY in server/mcp/apps/mcp-apps.ts. */
const MEDIA_URLS_META_KEY = 'remix-studio/mediaUrls';

type ToolResultLike = {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

export interface ToolViewState<T> {
  data?: T;
  /** Presigned URL per storage key, signed by the server for this result. */
  mediaUrls: Record<string, string>;
  error?: string;
  /** True until the first result arrives, and while a refetch is in flight. */
  pending: boolean;
}

function textOf(result: ToolResultLike): string {
  return (result.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function readResult<T>(result: ToolResultLike): ToolViewState<T> {
  const text = textOf(result);
  let data = result.structuredContent as T | undefined;
  if (data === undefined && text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      // Plain-text result: nothing structured to render.
    }
  }
  if (result.isError) {
    const message = (data as { error?: string } | undefined)?.error;
    return { mediaUrls: {}, pending: false, error: message || text || 'Error' };
  }
  const urls = result._meta?.[MEDIA_URLS_META_KEY];
  return {
    data,
    mediaUrls: urls && typeof urls === 'object' ? (urls as Record<string, string>) : {},
    pending: false,
  };
}

export interface ToolView<T> extends ToolViewState<T> {
  app: App | null;
  t: Translator;
  /** Arguments the host called the tool with, for refetching with changes. */
  toolArgs: Record<string, unknown>;
  /** Whether the host lets this view call server tools (paging, refresh). */
  canCallTools: boolean;
  /** Calls a server tool and shows its result in place of the current one. */
  refetch: (toolName: string, args: Record<string, unknown>) => Promise<void>;
  openLink: (url: string) => void;
}

/**
 * Connects to the host and tracks the tool result this view renders. Handlers
 * are attached in onAppCreated, before the handshake, so the result the host
 * sends right after connecting is not missed.
 */
export function useToolView<T>(viewName: string): ToolView<T> {
  const [state, setState] = useState<ToolViewState<T>>({ mediaUrls: {}, pending: true });
  const [toolArgs, setToolArgs] = useState<Record<string, unknown>>({});
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const requestId = useRef(0);

  const { app, isConnected, error } = useApp({
    appInfo: { name: `remix-studio-${viewName}`, version: '1.0.0' },
    capabilities: {},
    onAppCreated: (created) => {
      created.addEventListener('toolinput', (params) => {
        setToolArgs((params.arguments as Record<string, unknown>) ?? {});
      });
      created.addEventListener('toolresult', (params) => {
        requestId.current += 1;
        setState(readResult<T>(params as ToolResultLike));
      });
      created.addEventListener('toolcancelled', () => {
        setState({ mediaUrls: {}, pending: false, error: 'Cancelled' });
      });
      created.addEventListener('hostcontextchanged', (params) => {
        setHostContext((previous) => ({ ...previous, ...params }));
      });
    },
  });

  useEffect(() => {
    if (isConnected && app) setHostContext(app.getHostContext());
  }, [app, isConnected]);

  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    if (hostContext?.theme) applyDocumentTheme(hostContext.theme);
  }, [hostContext?.theme]);

  const refetch = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      if (!app) return;
      const id = ++requestId.current;
      setState((previous) => ({ ...previous, pending: true }));
      setToolArgs(args);
      try {
        const result = await app.callServerTool({ name: toolName, arguments: args });
        if (id === requestId.current) setState(readResult<T>(result as ToolResultLike));
      } catch (err) {
        if (id === requestId.current) {
          setState((previous) => ({
            ...previous,
            pending: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      }
    },
    [app],
  );

  const openLink = useCallback(
    (url: string) => {
      if (app) {
        app.openLink({ url }).catch(() => window.open(url, '_blank', 'noopener'));
      } else {
        window.open(url, '_blank', 'noopener');
      }
    },
    [app],
  );

  const locale = hostContext?.locale || (typeof navigator !== 'undefined' ? navigator.language : 'en');

  return {
    ...state,
    error: state.error ?? error?.message,
    app,
    t: createTranslator(locale),
    toolArgs,
    canCallTools: Boolean(isConnected && app?.getHostCapabilities()?.serverTools),
    refetch,
    openLink,
  };
}
