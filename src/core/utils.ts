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

/** Query single element */
export const $ = (selector: string): Element | null =>
  document.querySelector(selector);

/** Query all elements */
export const $$ = (selector: string): Element[] => [
  ...document.querySelectorAll(selector),
];

/** Format elapsed milliseconds as "Xm Ys" */
export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};
