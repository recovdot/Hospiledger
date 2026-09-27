import { backendJobs, type BackendJobKind, type Database } from "@hospiledger/db";
import { ANCHOR_BACKOFF_BASE_MS, ANCHOR_RETRY_LIMIT } from "@hospiledger/shared";
import { and, eq, gt, lte, or, sql } from "drizzle-orm";

import { AnchorError } from "../chain/client";
import { AiInspectionError } from "../ai/types";
import type { DbHandle } from "../db";
import type { Logger } from "../logger";

export type { BackendJobKind } from "@hospiledger/db";

export class JobLeaseLostError extends Error {
  constructor() {
    super("Job lease is no longer current.");
    this.name = "JobLeaseLostError";
  }
}

export type JobLease = {
  readonly id: string;
  readonly owner: string;
  readonly attempt: number;
  /** Call first inside every domain-write transaction, before locking domain rows. */
  assertCurrent(db: DbHandle): Promise<void>;
};

/** Takes a row lock until the caller's transaction commits, fencing off expired/old workers. */
export async function assertJobLease(db: DbHandle, lease: JobLease): Promise<void> {
  const [current] = await db
    .select({ id: backendJobs.id })
    .from(backendJobs)
    .where(and(
      eq(backendJobs.id, lease.id),
      eq(backendJobs.leaseOwner, lease.owner),
      eq(backendJobs.attempts, lease.attempt),
      eq(backendJobs.status, "running"),
      gt(backendJobs.leaseUntil, sql`now()`),
    ))
    .for("update")
    .limit(1);
  if (!current) throw new JobLeaseLostError();
}

/** Call inside the same transaction that first makes the domain work eligible. Duplicates do nothing. */
export async function enqueueBackendJob(db: DbHandle, kind: BackendJobKind, targetId: string): Promise<void> {
  await db.insert(backendJobs).values({ kind, targetId }).onConflictDoNothing({
    target: [backendJobs.kind, backendJobs.targetId],
  });
}

/** Explicit seller/operator retry: preserve the anchor signature candidate for reconciliation. */
export async function retryBackendJob(db: DbHandle, kind: BackendJobKind, targetId: string): Promise<void> {
  await db.insert(backendJobs).values({ kind, targetId }).onConflictDoUpdate({
    target: [backendJobs.kind, backendJobs.targetId],
    set: {
      status: "pending",
      attempts: 0,
      runAfter: sql`now()`,
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: sql`now()`,
    },
    setWhere: eq(backendJobs.status, "failed"),
  });
}

type ClaimedJob = typeof backendJobs.$inferSelect & {
  attempts: number;
  leaseOwner: string;
  exhaustedBeforeClaim: boolean;
};

export type JobHandler = (targetId: string, lease: JobLease) => Promise<void>;
export type JobHandlers = Record<BackendJobKind, {
  run: JobHandler;
  /** Runs in the worker's lease-guarded transaction with the failed-job update. */
  onExhausted?: (targetId: string, lease: JobLease, tx: DbHandle, category: string) => Promise<void>;
}>;

export type JobRunner = {
  start(): void;
  /** Stops polling/claiming and waits for any active handler and heartbeat to settle. */
  stop(): Promise<void>;
  /** Waits only for currently active work; it does not consume queued/future retries. */
  drain(): Promise<void>;
  /** Claims and executes at most one due job; useful for deterministic worker tests. */
  workOnce(): Promise<boolean>;
};

const POLL_MS = 1_000;
const LEASE_MS = 60_000;
const HEARTBEAT_MS = 15_000;
const MAX_ATTEMPTS: Record<BackendJobKind, number> = {
  inspection: 2,
  anchor: ANCHOR_RETRY_LIMIT,
  delete_photo: 3,
};

function errorCategory(kind: BackendJobKind, error: unknown): string {
  if (error instanceof AiInspectionError) return error.retryable ? "inspection_unavailable" : "inspection_validation";
  if (error instanceof JobLeaseLostError) return "lease_lost";
  return kind === "anchor" ? "chain_unavailable" : kind === "delete_photo" ? "storage_unavailable" : "inspection_unavailable";
}

/** Nonretryable AI validation or an ambiguous/invalid chain candidate must fail closed. */
function isTerminal(kind: BackendJobKind, error: unknown): boolean {
  return (kind === "inspection" && error instanceof AiInspectionError && !error.retryable) ||
    (kind === "anchor" && error instanceof AnchorError && !error.retryable);
}

/** Polls persistent descriptors; a second server can reclaim an expired claim after restart. */
export function createJobRunner(db: Database, logger: Logger, handlers: JobHandlers): JobRunner {
  const owner = crypto.randomUUID();
  let interval: ReturnType<typeof setInterval> | undefined;
  let active: Promise<boolean> | undefined;
  let stopping = false;

  async function claim(): Promise<ClaimedJob | null> {
    return db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(backendJobs)
        .where(or(
          and(eq(backendJobs.status, "pending"), lte(backendJobs.runAfter, sql`now()`)),
          and(eq(backendJobs.status, "running"), lte(backendJobs.leaseUntil, sql`now()`)),
        ))
        .orderBy(backendJobs.runAfter, backendJobs.createdAt)
        .for("update", { skipLocked: true })
        .limit(1);
      if (!job || stopping) return null;
      const exhaustedBeforeClaim = job.attempts >= MAX_ATTEMPTS[job.kind];
      const attempts = job.attempts + (exhaustedBeforeClaim ? 0 : 1);
      const leaseOwner = `${owner}:${crypto.randomUUID()}`;
      await tx.update(backendJobs).set({
        status: "running",
        attempts,
        leaseOwner,
        leaseUntil: sql`now() + (${LEASE_MS} * interval '1 millisecond')`,
        updatedAt: sql`now()`,
      }).where(eq(backendJobs.id, job.id));
      return { ...job, attempts, leaseOwner, exhaustedBeforeClaim };
    });
  }

  async function finish(lease: JobLease): Promise<void> {
    await db.transaction(async (tx) => {
      await lease.assertCurrent(tx);
      await tx.update(backendJobs).set({
        status: "complete",
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: sql`now()`,
      }).where(eq(backendJobs.id, lease.id));
    });
  }

  async function failOrRetry(job: ClaimedJob, lease: JobLease, category: string, terminal: boolean) {
    const exhausted = terminal || job.attempts >= MAX_ATTEMPTS[job.kind];
    await db.transaction(async (tx) => {
      await lease.assertCurrent(tx);
      if (exhausted) {
        await handlers[job.kind].onExhausted?.(job.targetId, lease, tx, category);
      }
      const backoffMs = (job.kind === "anchor" ? ANCHOR_BACKOFF_BASE_MS : 1_000) * 2 ** Math.max(0, job.attempts - 1);
      await tx.update(backendJobs).set({
        status: exhausted ? "failed" : "pending",
        runAfter: exhausted ? job.runAfter : sql`now() + (${backoffMs} * interval '1 millisecond')`,
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: sql`now()`,
      }).where(eq(backendJobs.id, lease.id));
    });
    logger[exhausted ? "error" : "warn"](
      exhausted ? "Backend job exhausted." : "Backend job queued for retry.",
      { kind: job.kind, targetId: job.targetId, attempt: job.attempts, category },
    );
  }

  async function execute(): Promise<boolean> {
    const job = await claim();
    if (!job) return false;
    const lease: JobLease = {
      id: job.id,
      owner: job.leaseOwner,
      attempt: job.attempts,
      assertCurrent(tx) { return assertJobLease(tx, this); },
    };
    // A crashed handler has already spent its final claim. Reconcile its domain failure
    // under a new lease instead of performing a forbidden extra external call.
    if (job.exhaustedBeforeClaim) {
      await failOrRetry(job, lease, "lease_expired", true);
      return true;
    }

    let heartbeat: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (heartbeat) return;
      heartbeat = db.update(backendJobs).set({
        leaseUntil: sql`now() + (${LEASE_MS} * interval '1 millisecond')`,
        updatedAt: sql`now()`,
      }).where(and(
        eq(backendJobs.id, lease.id),
        eq(backendJobs.status, "running"),
        eq(backendJobs.leaseOwner, lease.owner),
        eq(backendJobs.attempts, lease.attempt),
        gt(backendJobs.leaseUntil, sql`now()`),
      )).returning({ id: backendJobs.id }).then((rows) => {
        if (rows.length === 0) throw new JobLeaseLostError();
      }).catch((error: unknown) => {
        logger.warn("Backend job heartbeat failed.", {
          kind: job.kind, targetId: job.targetId, category: errorCategory(job.kind, error),
        });
      }).finally(() => { heartbeat = undefined; });
    }, HEARTBEAT_MS);
    try {
      await handlers[job.kind].run(job.targetId, lease);
      clearInterval(timer);
      if (heartbeat) await heartbeat;
      await finish(lease);
    } catch (error) {
      clearInterval(timer);
      if (heartbeat) await heartbeat;
      if (error instanceof JobLeaseLostError) {
        logger.warn("Backend job lease lost.", { kind: job.kind, targetId: job.targetId, attempt: job.attempts, category: "lease_lost" });
        return true;
      }
      try {
        await failOrRetry(job, lease, errorCategory(job.kind, error), isTerminal(job.kind, error));
      } catch (failure) {
        if (failure instanceof JobLeaseLostError) {
          logger.warn("Backend job lease lost.", { kind: job.kind, targetId: job.targetId, attempt: job.attempts, category: "lease_lost" });
          return true;
        }
        throw failure;
      }
    }
    return true;
  }

  return {
    start() {
      if (interval) return;
      stopping = false;
      const poll = () => { void this.workOnce().catch(() => {
        logger.error("Backend worker polling failed.", { category: "database_unavailable" });
      }); };
      interval = setInterval(poll, POLL_MS);
      poll();
    },
    async stop() {
      stopping = true;
      clearInterval(interval);
      interval = undefined;
      await this.drain();
    },
    async drain() {
      if (active) await active;
    },
    async workOnce() {
      if (stopping || active) return false;
      const task = execute();
      active = task;
      try {
        return await task;
      } finally {
        if (active === task) active = undefined;
      }
    },
  };
}
