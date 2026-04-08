import crypto from 'crypto';

type DecodedValue = string | number | bigint | Uint8Array | DecodedValue[] | Map<DecodedValue, DecodedValue> | boolean | null;

export type PasskeyRegistrationCredential = {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
};

export type PasskeyAssertionCredential = {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string | null;
  };
};

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64');
}

export function bufferToBase64Url(value: Buffer | Uint8Array): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function readLength(buffer: Buffer, offset: number, additionalInfo: number) {
  if (additionalInfo < 24) return { value: additionalInfo, offset };
  if (additionalInfo === 24) return { value: buffer.readUInt8(offset), offset: offset + 1 };
  if (additionalInfo === 25) return { value: buffer.readUInt16BE(offset), offset: offset + 2 };
  if (additionalInfo === 26) return { value: buffer.readUInt32BE(offset), offset: offset + 4 };
  if (additionalInfo === 27) return { value: Number(buffer.readBigUInt64BE(offset)), offset: offset + 8 };
  throw new Error('Unsupported CBOR length encoding');
}

function decodeCborValue(buffer: Buffer, offset = 0): { value: DecodedValue; offset: number } {
  const initialByte = buffer[offset];
  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 31;
  let cursor = offset + 1;

  if (majorType === 0) {
    const result = readLength(buffer, cursor, additionalInfo);
    return { value: result.value, offset: result.offset };
  }

  if (majorType === 1) {
    const result = readLength(buffer, cursor, additionalInfo);
    return { value: -1 - result.value, offset: result.offset };
  }

  if (majorType === 2) {
    const result = readLength(buffer, cursor, additionalInfo);
    const nextOffset = result.offset + result.value;
    return { value: buffer.subarray(result.offset, nextOffset), offset: nextOffset };
  }

  if (majorType === 3) {
    const result = readLength(buffer, cursor, additionalInfo);
    const nextOffset = result.offset + result.value;
    return { value: buffer.toString('utf8', result.offset, nextOffset), offset: nextOffset };
  }

  if (majorType === 4) {
    const result = readLength(buffer, cursor, additionalInfo);
    cursor = result.offset;
    const values: DecodedValue[] = [];
    for (let index = 0; index < result.value; index += 1) {
      const decoded = decodeCborValue(buffer, cursor);
      values.push(decoded.value);
      cursor = decoded.offset;
    }
    return { value: values, offset: cursor };
  }

  if (majorType === 5) {
    const result = readLength(buffer, cursor, additionalInfo);
    cursor = result.offset;
    const map = new Map<DecodedValue, DecodedValue>();
    for (let index = 0; index < result.value; index += 1) {
      const key = decodeCborValue(buffer, cursor);
      const value = decodeCborValue(buffer, key.offset);
      map.set(key.value, value.value);
      cursor = value.offset;
    }
    return { value: map, offset: cursor };
  }

  if (majorType === 6) {
    const result = readLength(buffer, cursor, additionalInfo);
    return decodeCborValue(buffer, result.offset);
  }

  if (majorType === 7) {
    if (additionalInfo === 20) return { value: false, offset: cursor };
    if (additionalInfo === 21) return { value: true, offset: cursor };
    if (additionalInfo === 22) return { value: null, offset: cursor };
  }

  throw new Error('Unsupported CBOR value');
}

function mapToObject(map: Map<DecodedValue, DecodedValue>) {
  return Object.fromEntries(map.entries());
}

function parseClientData(clientDataJSON: string, expectedType: 'webauthn.create' | 'webauthn.get') {
  const clientDataBuffer = base64UrlToBuffer(clientDataJSON);
  const parsed = JSON.parse(clientDataBuffer.toString('utf8')) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };

  if (parsed.type !== expectedType) {
    throw new Error(`Unexpected WebAuthn ceremony type: ${parsed.type || 'unknown'}`);
  }

  if (!parsed.challenge || !parsed.origin) {
    throw new Error('Incomplete WebAuthn client data');
  }

  return { parsed, clientDataBuffer };
}

function expectedRpIdHash(rpId: string) {
  return crypto.createHash('sha256').update(rpId).digest();
}

function verifyOriginAndChallenge(
  actualChallenge: string,
  expectedChallenge: string,
  actualOrigin: string,
  expectedOrigin: string
) {
  if (actualChallenge !== expectedChallenge) {
    throw new Error('WebAuthn challenge mismatch');
  }

  if (actualOrigin !== expectedOrigin) {
    throw new Error('WebAuthn origin mismatch');
  }
}

function parseAuthenticatorData(authData: Buffer) {
  if (authData.length < 37) {
    throw new Error('Authenticator data is too short');
  }

  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const counter = authData.readUInt32BE(33);

  return {
    rpIdHash,
    flags,
    counter,
    attestedCredentialDataIncluded: (flags & 0x40) !== 0,
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    authData,
  };
}

function decodeCredentialPublicKey(coseKeyBuffer: Buffer) {
  const decoded = decodeCborValue(coseKeyBuffer);
  if (!(decoded.value instanceof Map)) {
    throw new Error('Invalid COSE key');
  }

  const key = mapToObject(decoded.value);
  const kty = Number(key[1]);
  const alg = Number(key[3]);

  if (kty === 2) {
    const x = key[-2];
    const y = key[-3];
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
      throw new Error('Invalid EC key coordinates');
    }

    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: bufferToBase64Url(Buffer.from(x)),
      y: bufferToBase64Url(Buffer.from(y)),
      ext: true,
      key_ops: ['verify'],
    };

    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return {
      publicKey: keyObject.export({ type: 'spki', format: 'der' }).toString('base64'),
      algorithm: alg === -7 ? 'ES256' : String(alg),
    };
  }

  if (kty === 3) {
    const n = key[-1];
    const e = key[-2];
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) {
      throw new Error('Invalid RSA key components');
    }

    const jwk = {
      kty: 'RSA',
      n: bufferToBase64Url(Buffer.from(n)),
      e: bufferToBase64Url(Buffer.from(e)),
      ext: true,
      key_ops: ['verify'],
    };

    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return {
      publicKey: keyObject.export({ type: 'spki', format: 'der' }).toString('base64'),
      algorithm: alg === -257 ? 'RS256' : String(alg),
    };
  }

  throw new Error(`Unsupported COSE key type: ${kty}`);
}

export function getWebAuthnConfig(origin: string) {
  const url = new URL(origin);
  return {
    origin,
    rpId: process.env.WEBAUTHN_RP_ID || url.hostname,
    rpName: process.env.WEBAUTHN_RP_NAME || 'Remix Studio',
  };
}

export function buildRegistrationOptions(args: {
  origin: string;
  userId: string;
  userEmail: string;
  challenge: string;
  excludeCredentialIds: string[];
}) {
  const { rpId, rpName } = getWebAuthnConfig(args.origin);

  return {
    challenge: args.challenge,
    rp: {
      id: rpId,
      name: rpName,
    },
    user: {
      id: bufferToBase64Url(Buffer.from(args.userId, 'utf8')),
      name: args.userEmail,
      displayName: args.userEmail,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60000,
    attestation: 'none' as const,
    authenticatorSelection: {
      residentKey: 'required' as const,
      userVerification: 'preferred' as const,
    },
    excludeCredentials: args.excludeCredentialIds.map((credentialId) => ({
      id: credentialId,
      type: 'public-key' as const,
    })),
  };
}

export function buildAuthenticationOptions(args: {
  origin: string;
  challenge: string;
  allowCredentialIds?: string[];
}) {
  const { rpId } = getWebAuthnConfig(args.origin);

  return {
    challenge: args.challenge,
    rpId,
    timeout: 60000,
    userVerification: 'preferred' as const,
    allowCredentials: (args.allowCredentialIds || []).map((credentialId) => ({
      id: credentialId,
      type: 'public-key' as const,
    })),
  };
}

export function verifyRegistrationResponse(args: {
  origin: string;
  expectedChallenge: string;
  credential: PasskeyRegistrationCredential;
}) {
  if (args.credential.type !== 'public-key') {
    throw new Error('Unsupported credential type');
  }

  const { parsed, clientDataBuffer } = parseClientData(args.credential.response.clientDataJSON, 'webauthn.create');
  verifyOriginAndChallenge(parsed.challenge!, args.expectedChallenge, parsed.origin!, args.origin);

  const attestationObject = base64UrlToBuffer(args.credential.response.attestationObject);
  const decodedAttestation = decodeCborValue(attestationObject);
  if (!(decodedAttestation.value instanceof Map)) {
    throw new Error('Invalid attestation object');
  }

  const attestation = mapToObject(decodedAttestation.value);
  const authData = attestation.authData;
  if (!(authData instanceof Uint8Array)) {
    throw new Error('Missing attestation authData');
  }

  const parsedAuthData = parseAuthenticatorData(Buffer.from(authData));
  const { rpId } = getWebAuthnConfig(args.origin);

  if (!parsedAuthData.userPresent) {
    throw new Error('User presence is required');
  }

  if (!parsedAuthData.rpIdHash.equals(expectedRpIdHash(rpId))) {
    throw new Error('RP ID hash mismatch');
  }

  if (!parsedAuthData.attestedCredentialDataIncluded) {
    throw new Error('Missing attested credential data');
  }

  let offset = 37;
  offset += 16;
  const credentialIdLength = parsedAuthData.authData.readUInt16BE(offset);
  offset += 2;
  const credentialId = parsedAuthData.authData.subarray(offset, offset + credentialIdLength);
  offset += credentialIdLength;

  const coseKeyBuffer = parsedAuthData.authData.subarray(offset);
  const { publicKey, algorithm } = decodeCredentialPublicKey(coseKeyBuffer);

  return {
    credentialId: bufferToBase64Url(credentialId),
    publicKey,
    algorithm,
    counter: parsedAuthData.counter,
    clientDataHash: crypto.createHash('sha256').update(clientDataBuffer).digest('base64'),
    transports: args.credential.response.transports || [],
  };
}

export function verifyAuthenticationResponse(args: {
  origin: string;
  expectedChallenge: string;
  credential: PasskeyAssertionCredential;
  storedCredentialId: string;
  publicKey: string;
  algorithm: string;
  previousCounter: number;
}) {
  if (args.credential.type !== 'public-key') {
    throw new Error('Unsupported credential type');
  }

  if (args.credential.rawId !== args.storedCredentialId && args.credential.id !== args.storedCredentialId) {
    throw new Error('Credential ID mismatch');
  }

  const { parsed, clientDataBuffer } = parseClientData(args.credential.response.clientDataJSON, 'webauthn.get');
  verifyOriginAndChallenge(parsed.challenge!, args.expectedChallenge, parsed.origin!, args.origin);

  const authenticatorData = base64UrlToBuffer(args.credential.response.authenticatorData);
  const signature = base64UrlToBuffer(args.credential.response.signature);
  const parsedAuthData = parseAuthenticatorData(authenticatorData);
  const { rpId } = getWebAuthnConfig(args.origin);

  if (!parsedAuthData.userPresent) {
    throw new Error('User presence is required');
  }

  if (!parsedAuthData.rpIdHash.equals(expectedRpIdHash(rpId))) {
    throw new Error('RP ID hash mismatch');
  }

  if (parsedAuthData.counter < args.previousCounter) {
    throw new Error('Passkey signature counter regressed');
  }

  const verificationData = Buffer.concat([
    authenticatorData,
    crypto.createHash('sha256').update(clientDataBuffer).digest(),
  ]);

  const keyObject = crypto.createPublicKey({
    key: Buffer.from(args.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const algorithm = args.algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256';
  const verified = crypto.verify(algorithm, verificationData, keyObject, signature);
  if (!verified) {
    throw new Error('Invalid passkey signature');
  }

  return {
    counter: parsedAuthData.counter,
    userVerified: parsedAuthData.userVerified,
  };
}
