import dgram from 'dgram';
import { CDS_TYPE, CMS_TYPE, DEVICE_TYPE, MRR_TYPE } from './xml';
import { LanInterface, interfaceFor, isLocalPeer } from '../net-utils';

/**
 * SSDP (UPnP discovery) for any number of MediaServer root devices: answers
 * M-SEARCH queries and announces devices with NOTIFY alive / byebye on every
 * LAN interface, so a TV finds the server without being told its address.
 */

const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const MAX_AGE_S = 1800;
/** Re-announce well inside max-age; UDP datagrams get lost. */
const ANNOUNCE_INTERVAL_MS = 10 * 60 * 1000;

export interface SsdpDevice {
  uuid: string;
  /** Path of the description document on the HTTP server, e.g. /dlna/<id>/description.xml */
  descriptionPath: string;
}

function targetsOf(device: SsdpDevice): { nt: string; usn: string }[] {
  const udn = `uuid:${device.uuid}`;
  return [
    { nt: 'upnp:rootdevice', usn: `${udn}::upnp:rootdevice` },
    { nt: udn, usn: udn },
    ...[DEVICE_TYPE, CDS_TYPE, CMS_TYPE, MRR_TYPE].map((type) => ({ nt: type, usn: `${udn}::${type}` })),
  ];
}

function parseHeaders(message: string): { startLine: string; headers: Record<string, string> } {
  const lines = message.split(/\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { startLine: lines[0] || '', headers };
}

export class SsdpServer {
  private socket: dgram.Socket | null = null;
  private senders = new Map<string, dgram.Socket>();
  private devices = new Map<string, SsdpDevice>();
  private timer: NodeJS.Timeout | null = null;
  private bootId = Math.floor(Date.now() / 1000);
  private readonly serverHeader: string;

  constructor(
    private interfaces: () => LanInterface[],
    private httpPort: number,
    version: string,
  ) {
    this.serverHeader = `Node.js/${process.versions.node} UPnP/1.0 DLNADOC/1.50 RemixStudio/${version}`;
  }

  get running(): boolean {
    return this.socket !== null;
  }

  async start(): Promise<void> {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (msg, rinfo) => this.onMessage(msg.toString('utf8'), rinfo));
    socket.on('error', (error) => console.error('[DLNA] SSDP socket error:', error.message));
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(SSDP_PORT, () => {
        socket.off('error', reject);
        resolve();
      });
    });
    for (const iface of this.interfaces()) {
      try {
        socket.addMembership(SSDP_ADDRESS, iface.address);
      } catch (error) {
        console.warn(`[DLNA] Could not join SSDP multicast on ${iface.name} (${iface.address}):`, (error as Error).message);
      }
    }
    socket.setMulticastTTL(4);
    this.socket = socket;
    this.timer = setInterval(() => this.announceAll('ssdp:alive'), ANNOUNCE_INTERVAL_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.announceAll('ssdp:byebye');
    this.socket?.close();
    this.socket = null;
    for (const sender of this.senders.values()) sender.close();
    this.senders.clear();
  }

  /** Replaces the advertised set, announcing arrivals and departures. */
  setDevices(devices: SsdpDevice[]): void {
    const next = new Map(devices.map((device) => [device.uuid, device]));
    for (const [uuid, device] of this.devices) {
      if (!next.has(uuid)) void this.announce(device, 'ssdp:byebye');
    }
    const added = devices.filter((device) => !this.devices.has(device.uuid));
    this.devices = next;
    for (const device of added) void this.announceBurst(device);
  }

  async remove(uuid: string): Promise<void> {
    const device = this.devices.get(uuid);
    if (!device) return;
    this.devices.delete(uuid);
    await this.announce(device, 'ssdp:byebye');
  }

  private location(device: SsdpDevice, address: string): string {
    return `http://${address}:${this.httpPort}${device.descriptionPath}`;
  }

  /** New devices are announced three times, as UPnP recommends for lossy links. */
  private async announceBurst(device: SsdpDevice) {
    for (let i = 0; i < 3; i++) {
      if (!this.devices.has(device.uuid)) return;
      await this.announce(device, 'ssdp:alive');
      await new Promise((resolve) => setTimeout(resolve, 200 + i * 300));
    }
  }

  private async announceAll(nts: 'ssdp:alive' | 'ssdp:byebye') {
    for (const device of this.devices.values()) await this.announce(device, nts);
  }

  private async sender(iface: LanInterface): Promise<dgram.Socket | null> {
    const existing = this.senders.get(iface.address);
    if (existing) return existing;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', (error) => console.warn(`[DLNA] SSDP sender on ${iface.address}:`, error.message));
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, iface.address, () => {
          socket.off('error', reject);
          resolve();
        });
      });
      socket.setMulticastInterface(iface.address);
      socket.setMulticastTTL(4);
    } catch (error) {
      console.warn(`[DLNA] Cannot announce on ${iface.address}:`, (error as Error).message);
      socket.close();
      return null;
    }
    this.senders.set(iface.address, socket);
    return socket;
  }

  private async announce(device: SsdpDevice, nts: 'ssdp:alive' | 'ssdp:byebye') {
    if (!this.socket) return;
    for (const iface of this.interfaces()) {
      const sender = await this.sender(iface);
      if (!sender) continue;
      for (const { nt, usn } of targetsOf(device)) {
        const lines = [
          'NOTIFY * HTTP/1.1',
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
          `NT: ${nt}`,
          `NTS: ${nts}`,
          `USN: ${usn}`,
          `BOOTID.UPNP.ORG: ${this.bootId}`,
          'CONFIGID.UPNP.ORG: 1',
        ];
        if (nts === 'ssdp:alive') {
          lines.push(`CACHE-CONTROL: max-age=${MAX_AGE_S}`, `LOCATION: ${this.location(device, iface.address)}`, `SERVER: ${this.serverHeader}`);
        }
        const payload = Buffer.from(`${lines.join('\r\n')}\r\n\r\n`);
        await new Promise<void>((resolve) => sender.send(payload, SSDP_PORT, SSDP_ADDRESS, () => resolve()));
      }
    }
  }

  private onMessage(message: string, rinfo: dgram.RemoteInfo) {
    const { startLine, headers } = parseHeaders(message);
    if (!startLine.toUpperCase().startsWith('M-SEARCH')) return;
    if ((headers.man || '').replace(/"/g, '') !== 'ssdp:discover') return;
    const st = headers.st;
    if (!st || this.devices.size === 0) return;

    // Answer the LAN only: a reply to a spoofed internet source would make
    // this server an SSDP reflection amplifier.
    const interfaces = this.interfaces();
    if (!isLocalPeer(rinfo.address, interfaces)) return;
    const iface = interfaceFor(rinfo.address, interfaces);
    if (!iface) return;
    const mx = Math.min(5, Math.max(1, parseInt(headers.mx || '1', 10) || 1));

    const replies: { st: string; usn: string; device: SsdpDevice }[] = [];
    for (const device of this.devices.values()) {
      for (const target of targetsOf(device)) {
        if (st === 'ssdp:all' || st === target.nt) replies.push({ st: target.nt, usn: target.usn, device });
      }
    }
    if (replies.length === 0) return;

    // Spread replies over part of MX so many servers do not answer at once.
    const delay = Math.floor(Math.random() * Math.min(mx * 1000, 1000) * 0.5);
    setTimeout(() => {
      for (const reply of replies) {
        const lines = [
          'HTTP/1.1 200 OK',
          `CACHE-CONTROL: max-age=${MAX_AGE_S}`,
          `DATE: ${new Date().toUTCString()}`,
          'EXT:',
          `LOCATION: ${this.location(reply.device, iface.address)}`,
          `SERVER: ${this.serverHeader}`,
          `ST: ${reply.st}`,
          `USN: ${reply.usn}`,
          `BOOTID.UPNP.ORG: ${this.bootId}`,
          'CONFIGID.UPNP.ORG: 1',
        ];
        this.socket?.send(Buffer.from(`${lines.join('\r\n')}\r\n\r\n`), rinfo.port, rinfo.address);
      }
    }, delay);
  }
}
