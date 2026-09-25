/**
 * Static and generated XML for the UPnP MediaServer: device description,
 * service descriptions (SCPD) and SOAP envelopes.
 */

export const DEVICE_TYPE = 'urn:schemas-upnp-org:device:MediaServer:1';
export const CDS_TYPE = 'urn:schemas-upnp-org:service:ContentDirectory:1';
export const CMS_TYPE = 'urn:schemas-upnp-org:service:ConnectionManager:1';
export const MRR_TYPE = 'urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1';

export function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]!));
}

export function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** Reads one argument out of a SOAP action body, whatever namespace prefix it uses. */
export function soapArg(body: string, name: string): string | undefined {
  const match = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`).exec(body);
  if (match) return xmlUnescape(match[1].trim());
  return new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?/>`).test(body) ? '' : undefined;
}

export function soapResponse(serviceType: string, action: string, values: Record<string, string | number>): string {
  const args = Object.entries(values)
    .map(([key, value]) => `<${key}>${xmlEscape(String(value))}</${key}>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action}Response xmlns:u="${serviceType}">${args}</u:${action}Response></s:Body></s:Envelope>`;
}

export function soapFault(code: number, description: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${xmlEscape(description)}</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`;
}

export function deviceDescription(opts: {
  base: string;
  udn: string;
  friendlyName: string;
  version: string;
  serial: string;
}): string {
  const { base } = opts;
  const icon = (mime: string, size: number, file: string) =>
    `<icon><mimetype>${mime}</mimetype><width>${size}</width><height>${size}</height><depth>24</depth><url>${base}/${file}</url></icon>`;
  const service = (type: string, id: string, name: string) =>
    `<service><serviceType>${type}</serviceType><serviceId>${id}</serviceId><SCPDURL>${base}/${name}.xml</SCPDURL><controlURL>${base}/control/${name}</controlURL><eventSubURL>${base}/event/${name}</eventSubURL></service>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:dlna="urn:schemas-dlna-org:device-1-0" xmlns:sec="http://www.sec.co.kr/dlna">
<specVersion><major>1</major><minor>0</minor></specVersion>
<device>
<deviceType>${DEVICE_TYPE}</deviceType>
<friendlyName>${xmlEscape(opts.friendlyName)}</friendlyName>
<manufacturer>Remix Studio</manufacturer>
<manufacturerURL>https://github.com/ShinChven/remix-studio</manufacturerURL>
<modelDescription>Remix Studio album server</modelDescription>
<modelName>Remix Studio</modelName>
<modelNumber>${xmlEscape(opts.version)}</modelNumber>
<modelURL>https://github.com/ShinChven/remix-studio</modelURL>
<serialNumber>${xmlEscape(opts.serial)}</serialNumber>
<UDN>${opts.udn}</UDN>
<dlna:X_DLNADOC>DMS-1.50</dlna:X_DLNADOC>
<sec:ProductCap>smi,DCM10,getMediaInfo.sec,getCaptionInfo.sec</sec:ProductCap>
<iconList>${icon('image/png', 120, 'icon-120.png')}${icon('image/png', 48, 'icon-48.png')}${icon('image/jpeg', 120, 'icon-120.jpg')}${icon('image/jpeg', 48, 'icon-48.jpg')}</iconList>
<serviceList>${service(CDS_TYPE, 'urn:upnp-org:serviceId:ContentDirectory', 'cds')}${service(CMS_TYPE, 'urn:upnp-org:serviceId:ConnectionManager', 'cms')}${service(MRR_TYPE, 'urn:microsoft.com:serviceId:X_MS_MediaReceiverRegistrar', 'mrr')}</serviceList>
</device>
</root>`;
}

type Arg = [name: string, direction: 'in' | 'out', variable: string];
type StateVar = [name: string, type: string, sendEvents?: boolean, allowed?: string[]];

function scpd(actions: Record<string, Arg[]>, variables: StateVar[]): string {
  const actionXml = Object.entries(actions)
    .map(([name, args]) => `<action><name>${name}</name><argumentList>${args
      .map(([arg, dir, variable]) => `<argument><name>${arg}</name><direction>${dir}</direction><relatedStateVariable>${variable}</relatedStateVariable></argument>`)
      .join('')}</argumentList></action>`)
    .join('');
  const varXml = variables
    .map(([name, type, events, allowed]) => `<stateVariable sendEvents="${events ? 'yes' : 'no'}"><name>${name}</name><dataType>${type}</dataType>${allowed ? `<allowedValueList>${allowed.map((v) => `<allowedValue>${v}</allowedValue>`).join('')}</allowedValueList>` : ''}</stateVariable>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<scpd xmlns="urn:schemas-upnp-org:service-1-0"><specVersion><major>1</major><minor>0</minor></specVersion><actionList>${actionXml}</actionList><serviceStateTable>${varXml}</serviceStateTable></scpd>`;
}

export const CDS_SCPD = scpd(
  {
    GetSearchCapabilities: [['SearchCaps', 'out', 'SearchCapabilities']],
    GetSortCapabilities: [['SortCaps', 'out', 'SortCapabilities']],
    GetSystemUpdateID: [['Id', 'out', 'SystemUpdateID']],
    Browse: [
      ['ObjectID', 'in', 'A_ARG_TYPE_ObjectID'],
      ['BrowseFlag', 'in', 'A_ARG_TYPE_BrowseFlag'],
      ['Filter', 'in', 'A_ARG_TYPE_Filter'],
      ['StartingIndex', 'in', 'A_ARG_TYPE_Index'],
      ['RequestedCount', 'in', 'A_ARG_TYPE_Count'],
      ['SortCriteria', 'in', 'A_ARG_TYPE_SortCriteria'],
      ['Result', 'out', 'A_ARG_TYPE_Result'],
      ['NumberReturned', 'out', 'A_ARG_TYPE_Count'],
      ['TotalMatches', 'out', 'A_ARG_TYPE_Count'],
      ['UpdateID', 'out', 'A_ARG_TYPE_UpdateID'],
    ],
    Search: [
      ['ContainerID', 'in', 'A_ARG_TYPE_ObjectID'],
      ['SearchCriteria', 'in', 'A_ARG_TYPE_SearchCriteria'],
      ['Filter', 'in', 'A_ARG_TYPE_Filter'],
      ['StartingIndex', 'in', 'A_ARG_TYPE_Index'],
      ['RequestedCount', 'in', 'A_ARG_TYPE_Count'],
      ['SortCriteria', 'in', 'A_ARG_TYPE_SortCriteria'],
      ['Result', 'out', 'A_ARG_TYPE_Result'],
      ['NumberReturned', 'out', 'A_ARG_TYPE_Count'],
      ['TotalMatches', 'out', 'A_ARG_TYPE_Count'],
      ['UpdateID', 'out', 'A_ARG_TYPE_UpdateID'],
    ],
    X_GetFeatureList: [['FeatureList', 'out', 'A_ARG_TYPE_Featurelist']],
  },
  [
    ['SearchCapabilities', 'string'],
    ['SortCapabilities', 'string'],
    ['SystemUpdateID', 'ui4', true],
    ['ContainerUpdateIDs', 'string', true],
    ['TransferIDs', 'string', true],
    ['A_ARG_TYPE_ObjectID', 'string'],
    ['A_ARG_TYPE_Result', 'string'],
    ['A_ARG_TYPE_SearchCriteria', 'string'],
    ['A_ARG_TYPE_BrowseFlag', 'string', false, ['BrowseMetadata', 'BrowseDirectChildren']],
    ['A_ARG_TYPE_Filter', 'string'],
    ['A_ARG_TYPE_SortCriteria', 'string'],
    ['A_ARG_TYPE_Index', 'ui4'],
    ['A_ARG_TYPE_Count', 'ui4'],
    ['A_ARG_TYPE_UpdateID', 'ui4'],
    ['A_ARG_TYPE_Featurelist', 'string'],
  ],
);

export const CMS_SCPD = scpd(
  {
    GetProtocolInfo: [['Source', 'out', 'SourceProtocolInfo'], ['Sink', 'out', 'SinkProtocolInfo']],
    GetCurrentConnectionIDs: [['ConnectionIDs', 'out', 'CurrentConnectionIDs']],
    GetCurrentConnectionInfo: [
      ['ConnectionID', 'in', 'A_ARG_TYPE_ConnectionID'],
      ['RcsID', 'out', 'A_ARG_TYPE_RcsID'],
      ['AVTransportID', 'out', 'A_ARG_TYPE_AVTransportID'],
      ['ProtocolInfo', 'out', 'A_ARG_TYPE_ProtocolInfo'],
      ['PeerConnectionManager', 'out', 'A_ARG_TYPE_ConnectionManager'],
      ['PeerConnectionID', 'out', 'A_ARG_TYPE_ConnectionID'],
      ['Direction', 'out', 'A_ARG_TYPE_Direction'],
      ['Status', 'out', 'A_ARG_TYPE_ConnectionStatus'],
    ],
  },
  [
    ['SourceProtocolInfo', 'string', true],
    ['SinkProtocolInfo', 'string', true],
    ['CurrentConnectionIDs', 'string', true],
    ['A_ARG_TYPE_ConnectionStatus', 'string', false, ['OK', 'ContentFormatMismatch', 'InsufficientBandwidth', 'UnreliableChannel', 'Unknown']],
    ['A_ARG_TYPE_ConnectionManager', 'string'],
    ['A_ARG_TYPE_Direction', 'string', false, ['Input', 'Output']],
    ['A_ARG_TYPE_ProtocolInfo', 'string'],
    ['A_ARG_TYPE_ConnectionID', 'i4'],
    ['A_ARG_TYPE_AVTransportID', 'i4'],
    ['A_ARG_TYPE_RcsID', 'i4'],
  ],
);

export const MRR_SCPD = scpd(
  {
    IsAuthorized: [['DeviceID', 'in', 'A_ARG_TYPE_DeviceID'], ['Result', 'out', 'A_ARG_TYPE_Result']],
    IsValidated: [['DeviceID', 'in', 'A_ARG_TYPE_DeviceID'], ['Result', 'out', 'A_ARG_TYPE_Result']],
    RegisterDevice: [['RegistrationReqMsg', 'in', 'A_ARG_TYPE_RegistrationReqMsg'], ['RegistrationRespMsg', 'out', 'A_ARG_TYPE_RegistrationRespMsg']],
  },
  [
    ['A_ARG_TYPE_DeviceID', 'string'],
    ['A_ARG_TYPE_Result', 'int'],
    ['A_ARG_TYPE_RegistrationReqMsg', 'bin.base64'],
    ['A_ARG_TYPE_RegistrationRespMsg', 'bin.base64'],
    ['AuthorizationGrantedUpdateID', 'ui4', true],
    ['AuthorizationDeniedUpdateID', 'ui4', true],
    ['ValidationSucceededUpdateID', 'ui4', true],
    ['ValidationRevokedUpdateID', 'ui4', true],
  ],
);
