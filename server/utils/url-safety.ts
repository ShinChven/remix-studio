import net from 'node:net';
import type { ProviderType } from '../../src/types';


function parseUrlOrThrow(value: string, errorPrefix: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${errorPrefix}: invalid URL`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${errorPrefix}: credentials in URLs are not allowed`);
  }

  return parsed;
}


export function assertSafeProviderApiUrl(type: ProviderType, value?: string | null) {
  if (!value) return undefined;

  const parsed = parseUrlOrThrow(value, 'Provider API URL');
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Provider API URL must use HTTP or HTTPS');
  }

  // Restrictions removed: Users may need to use local proxies (http://127.0.0.1:...) 
  // or regional domains like .cn the app hasn't preemptively hardcoded.

  return parsed.toString();
}

export async function assertSafeReferenceImageUrl(value: string) {
  const parsed = parseUrlOrThrow(value, 'Reference image URL');
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Reference image URLs must use HTTP or HTTPS');
  }
}
