/**
 * Run an async job over every entry with a bounded number in flight. Album
 * moves and renames touch three storage objects per item, so a selection of a
 * few hundred is thousands of round trips — sequentially that is minutes, and
 * unbounded `Promise.all` opens thousands of sockets at once.
 */
export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  run: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await run(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
