export type RateLimiter = {
  /** Records an attempt for a key and reports whether it is still inside the window budget. */
  allow(key: string): boolean;
};

/**
 * Creates a fixed-budget sliding-window limiter for in-process use.
 *
 * @param limit allowed attempts per key per window
 * @param windowMs window length in milliseconds
 * @returns the limiter
 */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const attemptsByKey = new Map<string, number[]>();

  return {
    allow(key) {
      const now = Date.now();
      const attempts = (attemptsByKey.get(key) ?? []).filter((at) => now - at < windowMs);
      if (attempts.length >= limit) {
        attemptsByKey.set(key, attempts);
        return false;
      }
      attempts.push(now);
      attemptsByKey.set(key, attempts);
      if (attemptsByKey.size > 1_000) {
        for (const [candidate, timestamps] of attemptsByKey) {
          if (timestamps.every((at) => now - at >= windowMs)) attemptsByKey.delete(candidate);
        }
      }
      return true;
    },
  };
}
