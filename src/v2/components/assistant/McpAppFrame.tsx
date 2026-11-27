import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { McpUiHostContext, McpUiStyles } from '@modelcontextprotocol/ext-apps/app-bridge';
import {
  callAssistantAppTool,
  fetchAssistantAppResource,
  fetchAssistantAppToolResult,
  type AssistantAppResource,
  type AssistantAppToolResult,
} from '../../../api';
import { LoadingIndicator, Text } from '../../../m3';
import { useOptionalTheme } from '../../../m3/theme/ThemeProvider';

/**
 * Host for MCP Apps (`io.modelcontextprotocol/ui`) in the assistant chat: the
 * same views Claude and other MCP clients show next to a tool result, rendered
 * in a sandboxed frame. The frame has no same-origin access, so the view
 * reaches the app only through the bridge — read tools, links and its size.
 */

const resourceCache = new Map<string, Promise<AssistantAppResource>>();

function loadResource(uri: string): Promise<AssistantAppResource> {
  let pending = resourceCache.get(uri);
  if (!pending) {
    pending = fetchAssistantAppResource(uri).then((res) => res.resource);
    pending.catch(() => resourceCache.delete(uri));
    resourceCache.set(uri, pending);
  }
  return pending;
}

const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i;

/** Locks the view down to inline code plus media from the declared origins. */
function withContentSecurityPolicy(html: string, resourceDomains: string[] = []): string {
  const media = ['data:', 'blob:', ...resourceDomains.filter((domain) => ORIGIN_PATTERN.test(domain))].join(' ');
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `img-src ${media}`,
    `media-src ${media}`,
    'font-src data:',
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${meta}`) : `${meta}${html}`;
}

/** M3 system tokens, translated into the MCP Apps style variables. */
const STYLE_TOKENS: [keyof McpUiStyles, string][] = [
  ['--color-background-primary', '--md-sys-color-surface-container-low'],
  ['--color-background-secondary', '--md-sys-color-surface-container'],
  ['--color-background-tertiary', '--md-sys-color-surface-container-highest'],
  ['--color-background-inverse', '--md-sys-color-inverse-surface'],
  ['--color-background-info', '--md-sys-color-primary-container'],
  ['--color-background-warning', '--md-sys-color-tertiary-container'],
  ['--color-background-danger', '--md-sys-color-error-container'],
  ['--color-text-primary', '--md-sys-color-on-surface'],
  ['--color-text-secondary', '--md-sys-color-on-surface-variant'],
  ['--color-text-tertiary', '--md-sys-color-outline'],
  ['--color-text-inverse', '--md-sys-color-inverse-on-surface'],
  ['--color-text-info', '--md-sys-color-on-primary-container'],
  ['--color-text-warning', '--md-sys-color-on-tertiary-container'],
  ['--color-text-danger', '--md-sys-color-on-error-container'],
  ['--color-border-primary', '--md-sys-color-outline-variant'],
  ['--color-border-secondary', '--md-sys-color-surface-container-highest'],
  ['--color-ring-primary', '--md-sys-color-primary'],
  ['--font-sans', '--md-ref-typeface-plain'],
  ['--font-mono', '--md-ref-typeface-mono'],
];

function readHostStyles(element: Element): McpUiStyles {
  const computed = getComputedStyle(element);
  const variables: Partial<McpUiStyles> = {
    '--border-radius-xs': '4px',
    '--border-radius-sm': '8px',
    '--border-radius-md': '12px',
    '--border-radius-lg': '16px',
    '--border-radius-xl': '28px',
    '--border-radius-full': '9999px',
  };
  for (const [key, token] of STYLE_TOKENS) {
    const value = computed.getPropertyValue(token).trim();
    if (value) variables[key] = value;
  }
  return variables as McpUiStyles;
}

interface McpAppFrameProps {
  conversationId: string;
  toolCallId: string;
  resourceUri: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; html: string; args: Record<string, unknown>; result: AssistantAppToolResult; border: boolean };

export function McpAppFrame({ conversationId, toolCallId, resourceUri }: McpAppFrameProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const theme = useOptionalTheme();
  const mode = theme?.resolvedMode ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [height, setHeight] = useState<number | null>(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setHeight(null);
    Promise.all([loadResource(resourceUri), fetchAssistantAppToolResult(conversationId, toolCallId)])
      .then(([resource, found]) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          html: withContentSecurityPolicy(resource.text, resource._meta?.ui?.csp?.resourceDomains),
          args: (found.arguments ?? {}) as Record<string, unknown>,
          result: found.result,
          border: resource._meta?.ui?.prefersBorder !== false,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, toolCallId, resourceUri]);

  const hostContext = (): McpUiHostContext => ({
    theme: mode,
    locale: i18n.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: 'web',
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    containerDimensions: { maxWidth: containerRef.current?.clientWidth ?? undefined },
    deviceCapabilities: {
      touch: window.matchMedia('(pointer: coarse)').matches,
      hover: window.matchMedia('(hover: hover)').matches,
    },
    styles: containerRef.current ? { variables: readHostStyles(containerRef.current) } : undefined,
  });
  const hostContextRef = useRef(hostContext);
  hostContextRef.current = hostContext;

  useEffect(() => {
    if (state.status !== 'ready') return;
    const iframe = iframeRef.current;
    const target = iframe?.contentWindow;
    if (!iframe || !target) return;

    const bridge = new AppBridge(
      null,
      { name: 'Remix Studio', version: '1.0.0' },
      { openLinks: {}, serverTools: {} },
      { hostContext: hostContextRef.current() },
    );
    bridge.oncalltool = async (params) => {
      const { result } = await callAssistantAppTool(params.name, (params.arguments ?? {}) as Record<string, unknown>);
      return { ...result };
    };
    bridge.onopenlink = async ({ url }) => {
      try {
        const parsed = new URL(url, window.location.href);
        if (parsed.origin === window.location.origin) {
          navigateRef.current(`${parsed.pathname}${parsed.search}${parsed.hash}`);
        } else if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          window.open(parsed.href, '_blank', 'noopener,noreferrer');
        }
      } catch {
        // Not a URL: nothing to open.
      }
      return {};
    };
    bridge.onrequestdisplaymode = async () => ({ mode: 'inline' });
    bridge.onsizechange = ({ height: next }) => {
      if (typeof next === 'number' && next > 0) setHeight(Math.ceil(next));
    };
    bridge.oninitialized = () => {
      void bridge.sendToolInput({ arguments: state.args });
      void bridge.sendToolResult(state.result as Parameters<AppBridge['sendToolResult']>[0]);
    };

    let closed = false;
    bridgeRef.current = bridge;
    void bridge.connect(new PostMessageTransport(target, target)).then(() => {
      if (!closed) iframe.srcdoc = state.html;
    });
    return () => {
      closed = true;
      bridgeRef.current = null;
      void bridge.close();
    };
  }, [state]);

  // Theme, language and width follow the app while the view is open.
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const id = requestAnimationFrame(() => {
      const next = hostContextRef.current();
      bridge.setHostContext(next);
    });
    return () => cancelAnimationFrame(id);
  }, [mode, theme?.seed, theme?.variant, theme?.contrast, i18n.language]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    let last = container.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      if (width === last) return;
      last = width;
      bridgeRef.current?.setHostContext(hostContextRef.current());
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="v2-chat-app"
      data-border={state.status === 'ready' && !state.border ? 'none' : undefined}
    >
      {state.status === 'error' ? (
        <Text variant="body-small" className="v2-chat-app__note">
          {t('v2.assistant.appUnavailable', 'This view could not be shown.')}
        </Text>
      ) : (
        <>
          {state.status === 'loading' && (
            <div className="v2-chat-app__loading">
              <LoadingIndicator size={36} aria-label={t('assistant.loading', 'Loading…')} />
            </div>
          )}
          {state.status === 'ready' && (
            <iframe
              ref={iframeRef}
              key={toolCallId}
              className="v2-chat-app__frame"
              title={t('v2.assistant.appTitle', 'Tool view')}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              style={{ height: height ?? 360 }}
              data-ready=""
            />
          )}
        </>
      )}
    </div>
  );
}
