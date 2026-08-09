/** Sleep for given milliseconds */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until condition returns truthy, or throw on timeout */
export const waitUntil = async <T>(
  condition: () => T | Promise<T>,
  timeout: number,
  pollDelay: number,
): Promise<NonNullable<T>> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await condition();
    if (result) return result as NonNullable<T>;
    await sleep(pollDelay);
  }
  throw new Error(`Timed out after ${timeout}ms`);
};

/** Format elapsed milliseconds as "Xm Ys" */
export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

/** Format milliseconds as human-friendly ETA string */
export const formatEta = (ms: number): string => {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

/**
 * Cap label/text logs so a large tooltip or aria-label can't flood the
 * console. Single helper used by the engine and the empty-trash flow.
 */
const LABEL_LOG_CAP = 60;

/** One-line description of a button for diagnostic logs. */
export function describeButton(el: unknown): string {
  const node = el as { getAttribute?: (name: string) => string | null; textContent?: string | null } | null;
  const label = (node?.getAttribute?.('aria-label') ?? '').slice(0, LABEL_LOG_CAP);
  const text = (node?.textContent ?? '').trim().slice(0, LABEL_LOG_CAP);
  return `aria-label="${label}" text="${text}"`;
}
