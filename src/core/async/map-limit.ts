/**
 * Runs an async function over items with at most `limit` calls in flight, keeping input order.
 * Used wherever many files or repos are touched at once, so a big corpus never opens thousands of
 * file handles together.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const jobs = items.map((item, index) => ({ item, index }));
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  /* Each worker takes the next job when its current one settles; recursion instead of a loop keeps
     exactly one await in flight per worker. */
  const worker = async (): Promise<void> => {
    const job = jobs[next++];
    if (!job) return;
    results[job.index] = await fn(job.item, job.index);
    await worker();
  };
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}

/** Splits items into consecutive chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
