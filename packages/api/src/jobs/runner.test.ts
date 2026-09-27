import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { backendJobs, createDb, type Database } from "@hospiledger/db";
import { eq, inArray, sql } from "drizzle-orm";

import { AiInspectionError } from "../ai/types";
import type { Logger } from "../logger";
import { createJobRunner, enqueueBackendJob, JobLeaseLostError, retryBackendJob, type JobHandler, type JobHandlers } from "./runner";

// Never run a worker test against the request-serving database.
const testUrl = process.env.TEST_DATABASE_URL;
const isolated = testUrl && testUrl !== process.env.DATABASE_URL && /(?:^|[_-])test(?:[_-]|$)/i.test(new URL(testUrl).pathname);
const databaseTests = isolated ? describe : describe.skip;

function recordingLogger() {
  const lines: { level: string; fields?: Record<string, unknown> }[] = [];
  const logger: Logger = {
    info: (_message, fields) => { lines.push({ level: "info", fields }); },
    warn: (_message, fields) => { lines.push({ level: "warn", fields }); },
    error: (_message, fields) => { lines.push({ level: "error", fields }); },
  };
  return { logger, lines };
}

function inspectionHandlers(run: JobHandler, onExhausted?: JobHandlers["inspection"]["onExhausted"]): JobHandlers {
  return {
    inspection: { run, onExhausted },
    anchor: { run: async () => { throw new Error("Unexpected anchor claim"); } },
    delete_photo: { run: async () => { throw new Error("Unexpected photo claim"); } },
  };
}

databaseTests("Postgres-backed job runner", () => {
  let db: Database;
  const targets = new Set<string>();
  function targetId() {
    const id = `worker-test:${crypto.randomUUID()}`;
    targets.add(id);
    return id;
  }
  async function jobFor(target: string) {
    const [job] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, target));
    if (!job) throw new Error(`Missing job ${target}`);
    return job;
  }

  beforeAll(() => {
    db = createDb({ DATABASE_URL: testUrl! });
  });
  afterEach(async () => {
    if (targets.size) await db.delete(backendJobs).where(inArray(backendJobs.targetId, [...targets]));
    targets.clear();
  });
  afterAll(async () => {
    await db.$client.end();
  });

  test("enqueue in a transaction is unique, and a committed descriptor executes once", async () => {
    const id = targetId();
    await db.transaction(async (tx) => {
      await enqueueBackendJob(tx, "inspection", id);
      await enqueueBackendJob(tx, "inspection", id);
    });
    const { logger } = recordingLogger();
    let executions = 0;
    const worker = createJobRunner(db, logger, inspectionHandlers(async (_target, lease) => {
      await db.transaction(async (tx) => { await lease.assertCurrent(tx); });
      executions++;
    }));
    expect(await worker.workOnce()).toBe(true);
    expect(await worker.workOnce()).toBe(false);
    expect(executions).toBe(1);
    expect((await jobFor(id)).status).toBe("complete");
  });

  test("two workers cannot claim the same running descriptor", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "inspection", id);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const { logger } = recordingLogger();
    let runs = 0;
    const handler = inspectionHandlers(async (_target, lease) => {
      runs++;
      entered.resolve();
      await release.promise;
      await db.transaction(async (tx) => { await lease.assertCurrent(tx); });
    });
    const first = createJobRunner(db, logger, handler);
    const second = createJobRunner(db, logger, handler);
    const running = first.workOnce();
    await entered.promise;
    expect(await second.workOnce()).toBe(false);
    expect((await jobFor(id)).status).toBe("running");
    release.resolve();
    await running;
    expect(runs).toBe(1);
    expect((await jobFor(id)).status).toBe("complete");
  });

  test("reclaims expired leases and fences stale domain transactions", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "inspection", id);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const { logger } = recordingLogger();
    let domainCommits = 0;
    const first = createJobRunner(db, logger, inspectionHandlers(async (_target, lease) => {
      entered.resolve();
      await release.promise;
      try {
        await db.transaction(async (tx) => { await lease.assertCurrent(tx); domainCommits++; });
      } catch (error) {
        expect(error).toBeInstanceOf(JobLeaseLostError);
        throw error;
      }
    }));
    const running = first.workOnce();
    await entered.promise;
    await db.update(backendJobs).set({ leaseUntil: sql`now() - interval '1 second'` }).where(eq(backendJobs.targetId, id));
    const second = createJobRunner(db, logger, inspectionHandlers(async (_target, lease) => {
      await db.transaction(async (tx) => { await lease.assertCurrent(tx); domainCommits++; });
    }));
    expect(await second.workOnce()).toBe(true);
    release.resolve();
    await running;
    expect(domainCommits).toBe(1);
    expect((await jobFor(id)).attempts).toBe(2);
    expect((await jobFor(id)).status).toBe("complete");
  });

  test("retries after backoff, then atomically marks the exhausted domain/job failed", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "inspection", id);
    const { logger, lines } = recordingLogger();
    let exhausted = 0;
    const worker = createJobRunner(db, logger, inspectionHandlers(
      async () => { throw new Error("private provider error"); },
      async (_target, lease, tx) => { await lease.assertCurrent(tx); exhausted++; },
    ));
    await worker.workOnce();
    const retry = await jobFor(id);
    expect(retry.status).toBe("pending");
    expect(retry.attempts).toBe(1);
    expect(retry.runAfter.getTime()).toBeGreaterThan(Date.now() - 50);
    expect(await worker.workOnce()).toBe(false);
    await db.update(backendJobs).set({ runAfter: sql`now() - interval '1 second'` }).where(eq(backendJobs.targetId, id));
    await worker.workOnce();
    expect((await jobFor(id)).status).toBe("failed");
    expect((await jobFor(id)).attempts).toBe(2);
    expect(exhausted).toBe(1);
    expect(lines.at(-1)?.fields?.category).toBe("inspection_unavailable");
    expect(JSON.stringify(lines)).not.toContain("private provider error");
  });

  test("validation failures do not spend a second AI claim", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "inspection", id);
    const { logger } = recordingLogger();
    let exhausted = 0;
    const worker = createJobRunner(db, logger, inspectionHandlers(
      async () => { throw new AiInspectionError("invalid structured response"); },
      async () => { exhausted++; },
    ));
    await worker.workOnce();
    const job = await jobFor(id);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(1);
    expect(exhausted).toBe(1);
  });

  test("provider outages retry a second AI claim before exposing a safe failure", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "inspection", id);
    const { logger, lines } = recordingLogger();
    let attempts = 0;
    const worker = createJobRunner(db, logger, inspectionHandlers(
      async () => { attempts++; throw new AiInspectionError("private provider detail", true); },
    ));
    await worker.workOnce();
    expect((await jobFor(id)).status).toBe("pending");
    await db.update(backendJobs).set({ runAfter: sql`now() - interval '1 second'` }).where(eq(backendJobs.targetId, id));
    await worker.workOnce();
    expect((await jobFor(id)).status).toBe("failed");
    expect(attempts).toBe(2);
    expect(lines.at(-1)?.fields?.category).toBe("inspection_unavailable");
    expect(JSON.stringify(lines)).not.toContain("private provider detail");
  });

  test("a crash on the final claim reconciles failure without repeating I/O", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "inspection", id);
    await db.update(backendJobs).set({
      status: "running", attempts: 2, leaseOwner: "dead-process", leaseUntil: sql`now() - interval '1 second'`,
    }).where(eq(backendJobs.targetId, id));
    const { logger } = recordingLogger();
    let executions = 0;
    let exhausted = 0;
    const worker = createJobRunner(db, logger, inspectionHandlers(
      async () => { executions++; },
      async () => { exhausted++; },
    ));
    await worker.workOnce();
    expect(executions).toBe(0);
    expect(exhausted).toBe(1);
    expect((await jobFor(id)).status).toBe("failed");
  });

  test("explicit retry preserves prepared anchor candidate, normal enqueue cannot reset it", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "anchor", id);
    await db.update(backendJobs).set({ status: "failed", attempts: 3, preparedSignature: "candidate-signature", blockhash: "candidate-blockhash", lastValidBlockHeight: 20 }).where(eq(backendJobs.targetId, id));
    await enqueueBackendJob(db, "anchor", id);
    expect((await jobFor(id)).status).toBe("failed");
    await db.transaction(async (tx) => { await retryBackendJob(tx, "anchor", id); });
    const retry = await jobFor(id);
    expect(retry.status).toBe("pending");
    expect(retry.attempts).toBe(0);
    expect(retry.preparedSignature).toBe("candidate-signature");
    expect(retry.blockhash).toBe("candidate-blockhash");
  });

  test("stop drains in-flight work and refuses new claims", async () => {
    const id = targetId();
    await enqueueBackendJob(db, "inspection", id);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const { logger } = recordingLogger();
    const worker = createJobRunner(db, logger, inspectionHandlers(async (_target, lease) => {
      entered.resolve();
      await release.promise;
      await db.transaction(async (tx) => { await lease.assertCurrent(tx); });
    }));
    const running = worker.workOnce();
    await entered.promise;
    let stopped = false;
    const stopping = worker.stop().then(() => { stopped = true; });
    expect(await worker.workOnce()).toBe(false);
    expect(stopped).toBe(false);
    release.resolve();
    await Promise.all([running, stopping]);
    expect(stopped).toBe(true);
    expect((await jobFor(id)).status).toBe("complete");
  });
});
