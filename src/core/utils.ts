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
 * Retry a function with exponential backoff.
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export const retryWithBackoff = async <T>(
  fn: () => T | Promise<T>,
  options: {
    maxRetries?: number
    baseDelay?: number
    maxDelay?: number
    factor?: number
  } = {},
): Promise<T> => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30_000,
    factor = 2,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries) break;

      const delay = Math.min(baseDelay * factor ** attempt, maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);

      console.warn(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(jitter)}ms...`,
        err,
      );

      await sleep(jitter);
    }
  }

  throw lastError;
};
