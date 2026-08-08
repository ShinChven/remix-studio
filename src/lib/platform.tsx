import React from 'react';
import { Globe } from 'lucide-react';
// lucide-react 1.x dropped its brand icons; react-icons still carries them.
import { FaInstagram, FaLinkedin, FaFacebook } from 'react-icons/fa6';
import { XIcon } from '../components/XIcon';
import { ThreadsIcon } from '../components/ThreadsIcon';

/** Shared platform icon used across campaign/channel views. */
export function getPlatformIcon(platform = '', className = 'h-4 w-4') {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return <XIcon className={className} />;
    case 'threads':
      return <ThreadsIcon className={className} />;
    case 'instagram':
      return <FaInstagram className={className} />;
    case 'linkedin':
      return <FaLinkedin className={className} />;
    case 'facebook':
      return <FaFacebook className={className} />;
    default:
      return <Globe className={className} />;
  }
}

/** Human-readable label for a platform key. */
export function platformLabel(platform = '') {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return 'X';
    case 'threads':
      return 'Threads';
    case 'instagram':
      return 'Instagram';
    case 'linkedin':
      return 'LinkedIn';
    case 'facebook':
      return 'Facebook';
    default:
      return platform;
  }
}

/** The OAuth connect endpoint for a platform. */
export function platformConnectUrl(platform = '') {
  const key = platform.toLowerCase();
  const slug = key === 'x' ? 'twitter' : key;
  return `/api/social/${slug}/connect`;
}

/**
 * Best-effort external URL for a published post when the channel did not return
 * a canonical permalink. Threads is intentionally omitted: its permalink is
 * stored on PostExecution.externalUrl and must not be synthesized.
 */
export function fallbackExternalUrl(platform = '', externalId = ''): string | undefined {
  if (!externalId) return undefined;
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return `https://x.com/i/web/status/${externalId}`;
    case 'linkedin':
      return `https://www.linkedin.com/feed/update/${externalId}`;
    default:
      return undefined;
  }
}
