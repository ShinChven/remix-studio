/**
 * Centralized error handling for storage operations.
 * Maps specific storage provider error codes to user-friendly messages.
 */

export const STORAGE_FULL_ERROR = 'The server\'s physical storage is full. Please contact the administrator.';
export const QUOTA_EXCEEDED_ERROR = 'Your storage quota has been exceeded.';

export function formatError(e: any, defaultMessage: string): string {
  if (!e) return defaultMessage;

  const message = e.message?.toLowerCase() || '';
  const code = e.code || e.name || '';

  // 1. Physical Storage Full (MinIO/S3)
  // XMinioStorageFull is the specific code reported by the user for MinIO
  // InsufficientStorageSpace is the AWS S3 equivalent
  if (
    code === 'XMinioStorageFull' || 
    code === 'InsufficientStorageSpace' ||
    message.includes('storage full') || 
    message.includes('no space left on device')
  ) {
    return STORAGE_FULL_ERROR;
  }

  // 2. User Quota Exceeded (Internal)
  if (message.includes('storage quota exceeded') || message.includes('limit exceeded')) {
    return QUOTA_EXCEEDED_ERROR;
  }

  // 3. Fallback to the real error message if it's considered "safe" or has been formatted
  if (e.message && e.message.length < 200 && !message.includes('database') && !message.includes('prisma')) {
    return e.message;
  }

  return defaultMessage;
}
