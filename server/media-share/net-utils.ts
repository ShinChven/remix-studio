import net from 'net';
import os from 'os';
import type { Context } from 'hono';
import { getClientAddress } from '../utils/rate-limiter';

/** The address of the peer on the TCP connection (not a forwarded header). */
export function socketAddress(c: Context): string {
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return normalizeAddress(incoming?.socket?.remoteAddress || '');
}

/** The client's address for display: the forwarded one when proxies are trusted. */
export function clientAddress(c: Context): string {
  const forwarded = getClientAddress(c.req.raw);
  if (forwarded !== 'direct' && forwarded !== 'proxied-unknown') return forwarded;
  return socketAddress(c);
}

export function normalizeAddress(address: string): string {
  // IPv4 peers of a dual-stack socket arrive as ::ffff:a.b.c.d.
  return address.startsWith('::ffff:') && net.isIPv4(address.slice(7)) ? address.slice(7) : address;
}

/** Loopback, RFC 1918, CGNAT, link-local and IPv6 unique-local addresses. */
export function isPrivateAddress(raw: string): boolean {
  const address = normalizeAddress(raw);
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
  }
  return false;
}

export interface LanInterface {
  name: string;
  address: string;
  netmask: string;
}

/** Non-internal IPv4 interfaces, optionally limited to the names or addresses given. */
export function lanInterfaces(only?: string[]): LanInterface[] {
  const result: LanInterface[] = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (only && only.length > 0 && !only.includes(name) && !only.includes(entry.address)) continue;
      result.push({ name, address: entry.address, netmask: entry.netmask });
    }
  }
  return result;
}

function toInt(address: string): number {
  return address.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

/** The interface whose subnet contains the peer, if any. */
export function subnetInterface(peer: string, interfaces: LanInterface[]): LanInterface | undefined {
  const address = normalizeAddress(peer);
  if (!net.isIPv4(address)) return undefined;
  const peerInt = toInt(address);
  return interfaces.find((iface) => {
    const mask = toInt(iface.netmask);
    return (toInt(iface.address) & mask) === (peerInt & mask);
  });
}

/** Private addresses, plus anything on a directly attached subnet (some LANs use public ranges). */
export function isLocalPeer(peer: string, interfaces: LanInterface[] = lanInterfaces()): boolean {
  return isPrivateAddress(peer) || subnetInterface(peer, interfaces) !== undefined;
}

/** The interface on the same subnet as the peer, so the URLs we hand out are reachable from it. */
export function interfaceFor(peer: string, interfaces: LanInterface[]): LanInterface | undefined {
  return subnetInterface(peer, interfaces) ?? interfaces[0];
}
