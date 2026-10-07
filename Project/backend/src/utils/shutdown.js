import logger from './logger.js';

export function registerShutdown(tasks, { signals = process, exit = (code) => process.exit(code), timeoutMs = 10000 } = {}) {
  let pending;
  const shutdown = (signal) => {
    if (pending) return pending;
    logger.info(`Received ${signal}; shutting down.`);
    const deadline = setTimeout(() => {
      logger.error('Shutdown deadline exceeded; unacknowledged fleet history remains pending for replay.');
      exit(1);
    }, timeoutMs);
    pending = Promise.resolve().then(async () => {
      let exitCode = 0;
      for (const [name, cleanup] of tasks) {
        try { await cleanup(); }
        catch {
          exitCode = 1;
          logger.error(`Shutdown cleanup failed: ${name}.`);
        }
      }
      clearTimeout(deadline);
      signals.off('SIGINT', shutdown);
      signals.off('SIGTERM', shutdown);
      exit(exitCode);
    });
    return pending;
  };
  signals.on('SIGINT', shutdown);
  signals.on('SIGTERM', shutdown);
  return shutdown;
}
