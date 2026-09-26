import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { Hono, type Context } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import type { S3Storage } from '../../storage/s3-storage';
import type { MediaCatalog } from '../catalog';
import type { MediaDeviceAuth, ResolvedDevice } from '../device-auth';
import { serveStoredObject } from '../media-stream';
import { mimeTypeForKey } from '../media-types';
import { isLocalPeer, lanInterfaces, normalizeAddress, socketAddress } from '../net-utils';
import { ContentDirectory, DlnaError, MediaVariant, SOURCE_PROTOCOL_INFO, contentFeatures, keyFor } from './content-directory';
import { SsdpServer } from './ssdp';
import {
  CDS_SCPD, CDS_TYPE, CMS_SCPD, CMS_TYPE, MRR_SCPD, MRR_TYPE,
  deviceDescription, soapArg, soapFault, soapResponse, xmlEscape,
} from './xml';

/**
 * A UPnP/DLNA MediaServer per "DLNA server" the users created: TVs on the
 * LAN find them through SSDP and browse the albums in their own photo and
 * video apps.
 *
 * DLNA has no authentication. So nothing runs unless DLNA_ENABLED is set,
 * and the routes live on a listener of their own (DLNA_HTTP_PORT), apart
 * from the main port a reverse proxy publishes, answering LAN peers only.
 */

export const DLNA_ROOT = '/dlna';
const XML_TYPE = 'text/xml; charset="utf-8"';
const UPDATE_STAMP_TTL_MS = 5000;
const REFRESH_INTERVAL_MS = 60_000;
const VARIANTS: MediaVariant[] = ['original', 'optimized', 'thumbnail'];

export interface DlnaOptions {
  enabled: boolean;
  /** The port of the DLNA HTTP listener, which TVs connect to. */
  httpPort: number;
  /** Interface names or addresses to announce on; all LAN interfaces when empty. */
  interfaces: string[];
  version: string;
}

export function dlnaOptionsFromEnv(env: NodeJS.ProcessEnv, version: string): DlnaOptions {
  const flag = (env.DLNA_ENABLED || '').trim().toLowerCase();
  return {
    enabled: ['1', 'true', 'yes', 'on'].includes(flag),
    httpPort: Number(env.DLNA_HTTP_PORT) || Number(env.PORT || 3000) + 1,
    interfaces: (env.DLNA_INTERFACES || '').split(',').map((part) => part.trim()).filter(Boolean),
    version,
  };
}

type Variables = { dlnaDevice: ResolvedDevice };

export class DlnaService {
  private ssdp: SsdpServer;
  private startError: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingRefresh: NodeJS.Timeout | null = null;
  private stamps = new Map<string, { value: number; at: number }>();
  private httpServer: ServerType | null = null;
  private icons = new Map<string, Buffer>();

  constructor(
    private prisma: PrismaClient,
    private catalog: MediaCatalog,
    private auth: MediaDeviceAuth,
    private storage: S3Storage,
    private options: DlnaOptions,
  ) {
    this.ssdp = new SsdpServer(() => lanInterfaces(options.interfaces), options.httpPort, options.version);
  }

  status() {
    return {
      enabled: this.options.enabled,
      running: this.ssdp.running,
      error: this.startError,
      addresses: this.options.enabled
        ? lanInterfaces(this.options.interfaces).map((iface) => `${iface.address}:${this.options.httpPort}`)
        : [],
    };
  }

  async start(): Promise<void> {
    if (!this.options.enabled) return;
    const interfaces = lanInterfaces(this.options.interfaces);
    if (interfaces.length === 0) {
      this.startError = 'No LAN interface found; run the container with host networking.';
      console.warn(`[DLNA] ${this.startError}`);
      return;
    }
    try {
      await this.listen();
    } catch (error) {
      this.startError = `Port ${this.options.httpPort} is not available: ${(error as Error).message}`;
      console.error(`[DLNA] ${this.startError}`);
      return;
    }
    try {
      await this.ssdp.start();
    } catch (error) {
      this.startError = `SSDP could not start: ${(error as Error).message}`;
      console.error(`[DLNA] ${this.startError}`);
      this.httpServer?.close();
      this.httpServer = null;
      return;
    }
    console.log(`[DLNA] Announcing on ${interfaces.map((iface) => `${iface.name} ${iface.address}`).join(', ')} (port ${this.options.httpPort})`);
    await this.reload();
    this.refreshTimer = setInterval(() => void this.reload(), REFRESH_INTERVAL_MS);
    this.refreshTimer.unref();
    // Say goodbye on shutdown so TVs drop the server at once instead of
    // listing it until max-age runs out, then let the signal do its work.
    const shutdown = (signal: NodeJS.Signals) => {
      void this.stop().catch(() => {}).finally(() => process.kill(process.pid, signal));
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.ssdp.stop();
    this.httpServer?.close();
    this.httpServer = null;
  }

  private listen(): Promise<void> {
    const app = this.router();
    return new Promise((resolve, reject) => {
      const server = serve({ fetch: app.fetch, port: this.options.httpPort, hostname: '0.0.0.0' }, () => resolve());
      server.once('error', reject);
      this.httpServer = server;
    });
  }

  /** Re-reads the DLNA servers to advertise; call after one is created or changed. */
  refresh(): void {
    if (!this.ssdp.running) return;
    if (this.pendingRefresh) clearTimeout(this.pendingRefresh);
    this.pendingRefresh = setTimeout(() => {
      this.pendingRefresh = null;
      void this.reload();
    }, 100);
  }

  /** Says goodbye for a server that is about to be deleted. */
  async retire(deviceId: string): Promise<void> {
    await this.ssdp.remove(deviceId);
  }

  private async reload() {
    try {
      const devices = await this.prisma.mediaDevice.findMany({
        where: { kind: 'dlna', user: { status: { not: 'disabled' } } },
        select: { id: true },
      });
      this.ssdp.setDevices(devices.map((device) => ({ uuid: device.id, descriptionPath: `${DLNA_ROOT}/${device.id}/description.xml` })));
    } catch (error) {
      console.error('[DLNA] Failed to load servers:', error);
    }
  }

  private async updateStamp(device: ResolvedDevice): Promise<number> {
    const cached = this.stamps.get(device.device.id);
    if (cached && Date.now() - cached.at < UPDATE_STAMP_TTL_MS) return cached.value;
    const value = await this.catalog.updateStamp(device.userId, device.scope);
    this.stamps.set(device.device.id, { value, at: Date.now() });
    return value;
  }

  private async icon(name: string): Promise<Buffer | null> {
    const cached = this.icons.get(name);
    if (cached) return cached;
    const match = /^icon-(48|120)\.(png|jpg)$/.exec(name);
    if (!match) return null;
    const source = ['dist/icons/android-chrome-192x192.png', 'public/icons/android-chrome-192x192.png']
      .map((file) => path.join(process.cwd(), file))
      .find((file) => fs.existsSync(file));
    if (!source) return null;
    const size = Number(match[1]);
    const image = sharp(source).resize(size, size).flatten({ background: '#09090b' });
    const buffer = match[2] === 'png' ? await image.png().toBuffer() : await image.jpeg({ quality: 90 }).toBuffer();
    this.icons.set(name, buffer);
    return buffer;
  }

  /** The DLNA routes; exported for tests, served by `listen`. */
  router() {
    const router = new Hono<{ Variables: Variables }>();
    const base = (c: Context) => `http://${c.req.header('host') || `127.0.0.1:${this.options.httpPort}`}${DLNA_ROOT}/${c.req.param('id')}`;
    const xml = (body: string, status = 200) =>
      new Response(body, { status, headers: { 'Content-Type': XML_TYPE, EXT: '', Server: `UPnP/1.0 DLNADOC/1.50 RemixStudio/${this.options.version}` } });

    router.use(`${DLNA_ROOT}/:id/*`, async (c, next) => {
      if (!this.options.enabled) return c.text('DLNA is disabled', 404);
      const peer = socketAddress(c);
      // TVs connect directly. A proxied request, even from a private
      // address, may have come from anywhere.
      const proxied = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'via'].some((name) => c.req.header(name));
      if (proxied || !isLocalPeer(peer, lanInterfaces(this.options.interfaces))) {
        return c.text('DLNA is only available on the local network', 403);
      }
      const device = await this.auth.resolveDlnaServer(c.req.param('id') || '', peer);
      if (!device) return c.text('Not found', 404);
      c.set('dlnaDevice', device);
      await next();
    });

    router.get(`${DLNA_ROOT}/:id/description.xml`, (c) => {
      const { device } = c.get('dlnaDevice');
      return xml(deviceDescription({
        base: base(c),
        udn: `uuid:${device.id}`,
        friendlyName: device.name,
        version: this.options.version,
        serial: device.id.slice(0, 8),
      }));
    });
    router.get(`${DLNA_ROOT}/:id/cds.xml`, () => xml(CDS_SCPD));
    router.get(`${DLNA_ROOT}/:id/cms.xml`, () => xml(CMS_SCPD));
    router.get(`${DLNA_ROOT}/:id/mrr.xml`, () => xml(MRR_SCPD));

    router.get(`${DLNA_ROOT}/:id/:icon{icon-(?:48|120)\\.(?:png|jpg)}`, async (c) => {
      const name = c.req.param('icon');
      const buffer = await this.icon(name);
      if (!buffer) return c.text('Not found', 404);
      return new Response(new Uint8Array(buffer), {
        headers: { 'Content-Type': name.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
      });
    });

    router.post(`${DLNA_ROOT}/:id/control/:service`, async (c) => {
      const device = c.get('dlnaDevice');
      const service = c.req.param('service');
      const soapAction = (c.req.header('soapaction') || '').replace(/"/g, '');
      const action = soapAction.slice(soapAction.lastIndexOf('#') + 1);
      const body = await c.req.text();
      try {
        if (service === 'cds') return xml(await this.contentDirectoryAction(c, device, action, body));
        if (service === 'cms') return xml(this.connectionManagerAction(action));
        if (service === 'mrr') return xml(this.registrarAction(action));
        return c.text('Not found', 404);
      } catch (error) {
        if (error instanceof DlnaError) return xml(soapFault(error.code, error.message), 500);
        console.error(`[DLNA] ${service}#${action} failed:`, error);
        return xml(soapFault(501, 'Action failed'), 500);
      }
    });

    // Event subscriptions: accepted, with the initial event sent once. The
    // content changes rarely enough that clients re-browse on their own.
    router.on('SUBSCRIBE', `${DLNA_ROOT}/:id/event/:service`, async (c) => {
      const existing = c.req.header('sid');
      const sid = existing || `uuid:${crypto.randomUUID()}`;
      const headers = { SID: sid, TIMEOUT: 'Second-1800', Server: `UPnP/1.0 DLNADOC/1.50 RemixStudio/${this.options.version}`, 'Content-Length': '0' };
      if (!existing) {
        const callback = /<([^>]+)>/.exec(c.req.header('callback') || '')?.[1];
        if (callback) void this.sendInitialEvent(c, c.get('dlnaDevice'), c.req.param('service') || '', callback, sid);
      }
      return new Response(null, { status: 200, headers });
    });
    router.on('UNSUBSCRIBE', `${DLNA_ROOT}/:id/event/:service`, () => new Response(null, { status: 200 }));

    router.on(['GET', 'HEAD'], `${DLNA_ROOT}/:id/media/:itemId/:file`, async (c) => {
      const device = c.get('dlnaDevice');
      const variant = c.req.param('file').split('.')[0] as MediaVariant;
      if (!VARIANTS.includes(variant)) return c.text('Not found', 404);
      const entry = await this.catalog.getItem(device.userId, device.scope, c.req.param('itemId'));
      if (!entry) return c.text('Not found', 404);
      const key = keyFor(entry, variant);
      const mimeType = variant === 'original' ? entry.mimeType : mimeTypeForKey(key);
      const features = contentFeatures(mimeType, variant);
      return serveStoredObject(this.storage, key, {
        method: c.req.method,
        mimeType,
        rangeHeader: c.req.header('range'),
        ifNoneMatch: c.req.header('if-none-match'),
        headers: {
          'transferMode.dlna.org': mimeType.startsWith('image/') ? 'Interactive' : 'Streaming',
          'contentFeatures.dlna.org': features,
          'realTimeInfo.dlna.org': 'DLNA.ORG_TLAG=*',
        },
      });
    });

    return router;
  }

  private async contentDirectoryAction(c: Context, device: ResolvedDevice, action: string, body: string): Promise<string> {
    const directory = new ContentDirectory(
      this.catalog,
      device.userId,
      device.scope,
      (itemId, variant, key) => {
        const ext = variant === 'original' ? (key.split('.').pop() || 'bin') : 'jpg';
        return `http://${c.req.header('host')}${DLNA_ROOT}/${device.device.id}/media/${itemId}/${variant}.${ext}`;
      },
      device.device.name,
    );
    const index = (name: string) => Math.max(0, parseInt(soapArg(body, name) || '0', 10) || 0);

    switch (action) {
      case 'Browse': {
        const objectId = soapArg(body, 'ObjectID') ?? '0';
        const flag = soapArg(body, 'BrowseFlag');
        let result;
        if (flag === 'BrowseMetadata') result = await directory.metadata(objectId);
        else if (flag === 'BrowseDirectChildren') result = await directory.children(objectId, index('StartingIndex'), index('RequestedCount'));
        else throw new DlnaError(402, 'Invalid BrowseFlag');
        return soapResponse(CDS_TYPE, 'Browse', {
          Result: result.didl,
          NumberReturned: result.returned,
          TotalMatches: result.total,
          UpdateID: await this.updateStamp(device),
        });
      }
      case 'Search': {
        const result = await directory.search(soapArg(body, 'SearchCriteria') || '*', index('StartingIndex'), index('RequestedCount'));
        return soapResponse(CDS_TYPE, 'Search', {
          Result: result.didl,
          NumberReturned: result.returned,
          TotalMatches: result.total,
          UpdateID: await this.updateStamp(device),
        });
      }
      case 'GetSearchCapabilities':
        return soapResponse(CDS_TYPE, action, { SearchCaps: 'upnp:class' });
      case 'GetSortCapabilities':
        return soapResponse(CDS_TYPE, action, { SortCaps: '' });
      case 'GetSystemUpdateID':
        return soapResponse(CDS_TYPE, action, { Id: await this.updateStamp(device) });
      case 'X_GetFeatureList':
        // Samsung TVs look for these root containers before browsing.
        return soapResponse(CDS_TYPE, action, {
          FeatureList: '<?xml version="1.0" encoding="utf-8"?><Features xmlns="urn:schemas-upnp-org:av:avs" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:schemas-upnp-org:av:avs http://www.upnp.org/schemas/av/avs.xsd"><Feature name="samsung.com_BASICVIEW" version="1"><container id="0" type="object.item.imageItem"/><container id="0" type="object.item.audioItem"/><container id="0" type="object.item.videoItem"/></Feature></Features>',
        });
      default:
        throw new DlnaError(401, 'Invalid Action');
    }
  }

  private connectionManagerAction(action: string): string {
    switch (action) {
      case 'GetProtocolInfo':
        return soapResponse(CMS_TYPE, action, { Source: SOURCE_PROTOCOL_INFO, Sink: '' });
      case 'GetCurrentConnectionIDs':
        return soapResponse(CMS_TYPE, action, { ConnectionIDs: '0' });
      case 'GetCurrentConnectionInfo':
        return soapResponse(CMS_TYPE, action, {
          RcsID: -1, AVTransportID: -1, ProtocolInfo: '', PeerConnectionManager: '', PeerConnectionID: -1, Direction: 'Output', Status: 'OK',
        });
      default:
        throw new DlnaError(401, 'Invalid Action');
    }
  }

  /** Windows Media Player and Xbox ask this before they browse. */
  private registrarAction(action: string): string {
    if (action === 'IsAuthorized' || action === 'IsValidated') return soapResponse(MRR_TYPE, action, { Result: 1 });
    if (action === 'RegisterDevice') return soapResponse(MRR_TYPE, action, { RegistrationRespMsg: '' });
    throw new DlnaError(401, 'Invalid Action');
  }

  private async sendInitialEvent(c: Context, device: ResolvedDevice, service: string, callback: string, sid: string) {
    let url: URL;
    try {
      url = new URL(callback);
    } catch {
      return;
    }
    // Only call back the subscriber itself, never a third host.
    if (url.protocol !== 'http:' || normalizeAddress(url.hostname) !== socketAddress(c)) return;
    const properties: Record<string, string> = service === 'cds'
      ? { SystemUpdateID: String(await this.updateStamp(device)), ContainerUpdateIDs: '', TransferIDs: '' }
      : service === 'cms'
        ? { SourceProtocolInfo: SOURCE_PROTOCOL_INFO, SinkProtocolInfo: '', CurrentConnectionIDs: '0' }
        : {};
    const body = `<?xml version="1.0" encoding="utf-8"?>\n<e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0">${Object.entries(properties)
      .map(([name, value]) => `<e:property><${name}>${xmlEscape(value)}</${name}></e:property>`)
      .join('')}</e:propertyset>`;
    // Give the subscriber a moment to read the SUBSCRIBE response first.
    setTimeout(() => {
      const request = http.request(url, {
        method: 'NOTIFY',
        headers: { 'Content-Type': XML_TYPE, NT: 'upnp:event', NTS: 'upnp:propchange', SID: sid, SEQ: '0', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      });
      request.on('error', () => {});
      request.on('timeout', () => request.destroy());
      request.end(body);
    }, 200);
  }
}
