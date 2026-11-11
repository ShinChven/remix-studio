/** What went wrong, in the server's words when it gave any, otherwise `fallback`. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}
