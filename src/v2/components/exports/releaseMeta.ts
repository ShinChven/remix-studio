import type { Tone } from '../../ui/Stat';

/** Presentation of each destination a release can land on. */
const PLATFORMS: Record<string, { label: string; icon: string; tone: Tone }> = {
  gumroad: { label: 'Gumroad', icon: 'storefront', tone: 'tertiary' },
  'google-drive': { label: 'Google Drive', icon: 'add_to_drive', tone: 'success' },
  onedrive: { label: 'OneDrive', icon: 'cloud', tone: 'secondary' },
  // MEGA can no longer be connected; releases made before it was removed still show by name.
  mega: { label: 'MEGA', icon: 'cloud', tone: 'error' },
};

export function platformMeta(platform: string) {
  return PLATFORMS[platform] ?? { label: platform, icon: 'cloud', tone: 'neutral' as Tone };
}

/** Drive icon by provider id. */
export function driveIcon(platform: string) {
  return platform === 'google-drive' ? 'add_to_drive' : 'cloud';
}
