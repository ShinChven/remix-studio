import type { WorkflowItem } from '../../src/types';

/** Extract bare S3 key from a presigned URL, or return the value as-is if already a key */
export function stripToKey(value: string | undefined, bucket: string): string | undefined {
  if (!value || !value.startsWith('http')) return value;
  try {
    const url = new URL(value);
    // Path-style: /bucket/key (used by MinIO/LocalStack)
    const prefix = `/${bucket}/`;
    if (url.pathname.startsWith(prefix)) {
      return decodeURIComponent(url.pathname.slice(prefix.length));
    }
    // Virtual-hosted style: bucket.host/key (used by AWS S3)
    if (url.hostname.startsWith(`${bucket}.`)) {
      return decodeURIComponent(url.pathname.slice(1));
    }
    return value;
  } catch {
    return value;
  }
}

export function normalizeWorkflowForStorage(workflow: WorkflowItem[], bucket: string): WorkflowItem[] {
  return workflow.map((item) => {
    if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
      return {
        ...item,
        value: stripToKey(item.value, bucket) || item.value,
        thumbnailUrl: stripToKey(item.thumbnailUrl, bucket),
        optimizedUrl: stripToKey(item.optimizedUrl, bucket),
      };
    }
    return item;
  });
}
