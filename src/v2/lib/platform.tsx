import { FaFacebook, FaInstagram, FaLinkedin } from 'react-icons/fa6';
import { Icon } from '../../m3';


/** A social platform's mark, sized in px. */
export function PlatformIcon({ platform = '', size = 16, className }: { platform?: string; size?: number; className?: string }) {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden className={className}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'threads':
      return (
        <svg viewBox="0 0 192 192" width={size} height={size} fill="currentColor" aria-hidden className={className}>
          <path d="M141.537 88.988c-.827-.396-1.667-.778-2.518-1.143-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.451 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.141-23.82 1.372-39.134 15.265-38.105 34.569.522 9.792 5.4 18.216 13.735 23.719 7.048 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.631-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.171 40.526 7.521 52.171 21.848 5.71 7.026 10.015 15.861 12.853 26.163l16.147-4.308c-3.44-12.68-8.853-23.607-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.194 47.292 9.642 32.788 28.079 19.882 44.486 13.224 67.316 13.001 95.932L13 96l.001.067c.223 28.617 6.881 51.447 19.787 67.854C47.292 182.358 68.882 191.806 96.957 192h.113c24.96-.173 42.554-6.708 57.048-21.189 18.963-18.945 18.392-42.692 12.142-57.27-4.484-10.454-13.033-18.945-24.723-24.553zM98.44 129.507c-10.44.588-21.286-4.098-21.821-14.135-.396-7.442 5.296-15.746 22.462-16.735 1.966-.114 3.895-.169 5.79-.169 6.235 0 12.068.606 17.371 1.765-1.978 24.702-13.58 28.713-23.802 29.274z" />
        </svg>
      );
    case 'instagram':
      return <FaInstagram size={size} className={className} />;
    case 'linkedin':
      return <FaLinkedin size={size} className={className} />;
    case 'facebook':
      return <FaFacebook size={size} className={className} />;
    default:
      return <Icon name="public" size={size} className={className} />;
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
