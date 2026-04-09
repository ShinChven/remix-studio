import dns from 'node:dns/promises';
import net from 'node:net';
import type { ProviderType } from '../../src/types';

const ALLOWED_PROVIDER_HOSTS: Record<ProviderType, string[]> = {
  GoogleAI: ['generativelanguage.googleapis.com'],
  VertexAI: ['aiplatform.googleapis.com'],
  RunningHub: ['www.runninghub.ai', 'runninghub.ai'],
  OpenAI: ['api.openai.com'],
};

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);

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

function isPrivateIpv4(address: string) {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice(7));
  }

  return false;
}

function isBlockedAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

export function assertSafeProviderApiUrl(type: ProviderType, value?: string | null) {
  if (!value) return undefined;

  const parsed = parseUrlOrThrow(value, 'Provider API URL');
  if (parsed.protocol !== 'https:') {
    throw new Error('Provider API URL must use HTTPS');
  }

  const allowedHosts = ALLOWED_PROVIDER_HOSTS[type];
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`Provider API URL host is not allowed for ${type}`);
  }

  return parsed.toString();
}

export async function assertSafeReferenceImageUrl(value: string) {
  const parsed = parseUrlOrThrow(value, 'Reference image URL');
  if (parsed.protocol !== 'https:') {
    throw new Error('Reference image URLs must use HTTPS');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Reference image URL points to a blocked host');
  }

  if (net.isIP(hostname) && isBlockedAddress(hostname)) {
    throw new Error('Reference image URL points to a private or special-use IP');
  }

  if (!net.isIP(hostname)) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) {
      throw new Error('Reference image URL host did not resolve');
    }

    if (records.some((record) => isBlockedAddress(record.address))) {
      throw new Error('Reference image URL resolves to a private or special-use IP');
    }
  }
}
