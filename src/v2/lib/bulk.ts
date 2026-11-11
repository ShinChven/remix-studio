import { errorText } from './errors';

export interface BulkResult {
  done: number;
  failed: number;
  /** Why the first failure happened, led by its name when several were tried. */
  reason: string;
}

/** Applies one change to several things, one at a time, and tallies how it went instead of stopping at the first failure. */
export async function runEach<T>(targets: readonly T[], change: (target: T) => Promise<unknown>, nameOf?: (target: T) => string): Promise<BulkResult> {
  let done = 0;
  let reason = '';
  for (const target of targets) {
    try {
      await change(target);
      done += 1;
    } catch (error) {
      console.error(error);
      const message = errorText(error, '');
      reason ||= nameOf && targets.length > 1 ? `${nameOf(target)}: ${message}` : message;
    }
  }
  return { done, failed: targets.length - done, reason };
}
