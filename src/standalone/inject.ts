/**
 * Standalone script — paste the built IIFE into Chrome DevTools console.
 */
import { DeleteEngine, formatElapsed } from '../core';

(async () => {
  const maxCount = 10_000;

  console.log(
    '%c🗑️ Google Photos Delete Tool',
    'font-size: 16px; font-weight: bold; color: #1976d2',
  );
  console.log(`Deleting up to ${maxCount.toLocaleString()} photos...`);
  console.log('To stop early, run: window.__gpdt_stop()');

  const engine = new DeleteEngine({ maxCount }, (progress) => {
    const { deleted, status, startedAt } = progress;
    if (deleted > 0) {
      const elapsed = Date.now() - startedAt;
      const rate = (deleted / (elapsed / 60_000)).toFixed(0);
      console.log(
        `[Progress] ${status} | ${deleted} deleted | ${rate}/min | ${formatElapsed(elapsed)}`,
      );
    }
  });

  // Expose stop function globally
  (window as unknown as Record<string, unknown>).__gpdt_stop = () => engine.abort();

  const result = await engine.run();

  console.log(
    `%c✅ Done! Deleted ${result.deleted} photos in ${formatElapsed(Date.now() - result.startedAt)}`,
    'font-size: 14px; color: #43a047',
  );

  if (result.error) {
    console.error('Finished with error:', result.error);
  }
})();
