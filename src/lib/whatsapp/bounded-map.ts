export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const width = Math.max(1, Math.min(Math.trunc(concurrency), items.length));
  const output = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      output[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return output;
}
