import type { Logger } from "../logger";

export type JobOptions = {
  /** Total attempts before the job is abandoned; defaults to 1. */
  attempts?: number;
  /** Base delay for exponential backoff between attempts; defaults to no delay. */
  backoffMs?: number;
  /** Runs once after the final attempt fails; use it to persist a failed state. */
  onExhausted?: (error: unknown) => Promise<void> | void;
};

export type JobRunner = {
  /** Schedules a job and returns immediately; the caller never waits for work. */
  enqueue(name: string, run: () => Promise<void>, options?: JobOptions): void;
  /** Awaits every scheduled job, including retries. Used by tests and graceful shutdown. */
  drain(): Promise<void>;
};

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * Creates an in-process job runner.
 *
 * Jobs start on a macrotask so a request handler never performs inspection or anchor work inline.
 * Retries use exponential backoff; the last failure is logged, never thrown.
 *
 * @param logger structured logger for job lifecycle events
 * @returns the job runner
 */
export function createJobRunner(logger: Logger): JobRunner {
  const inFlight = new Set<Promise<void>>();

  const runWithRetries = async (name: string, run: () => Promise<void>, options: JobOptions): Promise<void> => {
    const attempts = Math.max(1, options.attempts ?? 1);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await run();
        return;
      } catch (error) {
        const lastAttempt = attempt === attempts;
        logger[lastAttempt ? "error" : "warn"](
          lastAttempt ? "Job gagal setelah semua percobaan." : "Job gagal, mencoba ulang.",
          { job: name, attempt, attempts, error: error instanceof Error ? error.message : String(error) },
        );
        if (lastAttempt) {
          await options.onExhausted?.(error);
          return;
        }
        const backoffMs = (options.backoffMs ?? 0) * 2 ** (attempt - 1);
        if (backoffMs > 0) await sleep(backoffMs);
      }
    }
  };

  return {
    enqueue(name, run, options = {}) {
      const { promise: scheduled, resolve } = Promise.withResolvers<void>();
      setTimeout(() => {
        void runWithRetries(name, run, options).then(resolve, resolve);
      }, 0);
      inFlight.add(scheduled);
      void scheduled.finally(() => inFlight.delete(scheduled));
    },
    async drain() {
      while (inFlight.size > 0) {
        await Promise.all([...inFlight]);
      }
    },
  };
}
