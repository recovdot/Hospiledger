import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { aiInspections, assets, backendJobs, companies, createDb, passportRecords, passports, type Database } from "@hospiledger/db";
import { and, eq, inArray } from "drizzle-orm";

import { AnchorError } from "../chain/client";
import type { ChainClient, MemoRead, PreparedMemo } from "../chain/types";
import { assertJobLease, JobLeaseLostError, type JobLease } from "../jobs/runner";
import type { Logger } from "../logger";
import { markAnchorFailed, publishPassport, retryPassportAnchor, runAnchor } from "./publish";
import { assignAssetCode } from "./asset-code";

const testUrl = process.env.TEST_DATABASE_URL;
const isolated = testUrl && testUrl !== process.env.DATABASE_URL && /(?:^|[_-])test(?:[_-]|$)/i.test(new URL(testUrl).pathname);
const databaseTests = isolated ? describe : describe.skip;
const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function mockChain() {
  const seen = new Map<string, { memo: string; slot: number }>();
  const sent: string[] = [];
  let preparedCount = 0;
  let mode: "confirmed" | "timeout_after_send" | "outage" | "expired" = "confirmed";
  const signature = (memo: string, blockhash: string) => `signed:${blockhash}:${memo}`;
  const chain: ChainClient = {
    chainCluster: "test-cluster",
    getSignerAddress: () => "platform-signer",
    getSignerLamports: async () => 1_000_000,
    prepareMemo: async (memo) => {
      preparedCount++;
      const blockhash = `blockhash-${preparedCount}`;
      return { txSignature: signature(memo, blockhash), blockhash, lastValidBlockHeight: 987_000, chainCluster: "test-cluster" };
    },
    broadcastPreparedMemo: async (memo, prepared: PreparedMemo) => {
      if (signature(memo, prepared.blockhash) !== prepared.txSignature) {
        throw new AnchorError("Candidate does not sign approved memo.", false);
      }
      sent.push(prepared.txSignature);
      if (mode === "outage") throw new AnchorError("RPC unavailable.", true);
      if (mode === "expired") throw new AnchorError("Expired candidate cannot prove absence.", false);
      seen.set(prepared.txSignature, { memo, slot: 451 });
      if (mode === "timeout_after_send") throw new AnchorError("RPC timed out after send.", true);
      return { txSignature: prepared.txSignature, slot: 451, chainCluster: "test-cluster" };
    },
    readMemo: async (txSignature): Promise<MemoRead> => {
      const saved = seen.get(txSignature);
      return saved ? { kind: "confirmed", slot: saved.slot, memoText: saved.memo, errored: false } : { kind: "not_found" };
    },
  };
  return { chain, seen, sent, setMode(next: typeof mode) { mode = next; }, get preparedCount() { return preparedCount; } };
}

databaseTests("transactional Solana publish", () => {
  let db: Database;
  const companiesToDelete = new Set<string>();
  const jobsToDelete = new Set<string>();

  async function fixture() {
    const [company] = await db.insert(companies).values({ name: "Isolated publish test" }).returning();
    if (!company) throw new Error("Company fixture missing");
    companiesToDelete.add(company.id);
    const [asset] = await db.insert(assets).values({ companyId: company.id, category: "Oven", brand: "Brand", model: "Unit" }).returning();
    if (!asset) throw new Error("Asset fixture missing");
    const [inspection] = await db.insert(aiInspections).values({ assetId: asset.id, status: "complete" }).returning();
    if (!inspection) throw new Error("Inspection fixture missing");
    const [passport] = await db.insert(passports).values({
      assetId: asset.id, inspectionId: inspection.id, status: "approved",
      assetCode: await assignAssetCode(db, 2099),
    }).returning();
    if (!passport) throw new Error("Passport fixture missing");
    return { companyId: company.id, assetId: asset.id, passportId: passport.id, assetCode: passport.assetCode };
  }

  async function lease(recordId: string): Promise<JobLease> {
    const [job] = await db.update(backendJobs).set({
      status: "running", attempts: 1, leaseOwner: crypto.randomUUID(), leaseUntil: new Date(Date.now() + 60_000),
    }).where(and(eq(backendJobs.kind, "anchor"), eq(backendJobs.targetId, recordId))).returning();
    if (!job?.leaseOwner) throw new Error("Anchor job fixture missing");
    const active: JobLease = { id: job.id, owner: job.leaseOwner, attempt: job.attempts, assertCurrent(tx) { return assertJobLease(tx, this); } };
    return active;
  }

  async function state(passportId: string) {
    const [passport] = await db.select().from(passports).where(eq(passports.id, passportId));
    const records = await db.select().from(passportRecords).where(eq(passportRecords.passportId, passportId));
    return { passport, records };
  }

  beforeAll(() => { db = createDb({ DATABASE_URL: testUrl! }); });
  afterEach(async () => {
    if (jobsToDelete.size) await db.delete(backendJobs).where(inArray(backendJobs.targetId, [...jobsToDelete]));
    if (companiesToDelete.size) await db.delete(companies).where(inArray(companies.id, [...companiesToDelete]));
    jobsToDelete.clear();
    companiesToDelete.clear();
  });
  afterAll(async () => { await db.$client.end(); });

  test("concurrent publishes preserve one record and descriptor; legacy pending is quarantined", async () => {
    const asset = await fixture();
    const mocked = mockChain();
    const deps = { db, chain: mocked.chain, logger };
    const published = await Promise.all(Array.from({ length: 3 }, () => publishPassport(deps, asset)));
    const recordId = published[0]!.record.id;
    jobsToDelete.add(recordId);
    expect(published.map((value) => value.record.id)).toEqual([recordId, recordId, recordId]);
    expect(published.every((value) => value.passport.status === "approved")).toBe(true);
    const { records, passport } = await state(asset.passportId);
    expect(records.map((record) => record.version)).toEqual([1]);
    expect(passport?.publishedAt).toBeNull();
    const jobs = await db.select().from(backendJobs).where(eq(backendJobs.targetId, recordId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("pending");
    expect(mocked.sent).toEqual([]);

    await db.delete(backendJobs).where(eq(backendJobs.targetId, recordId));
    await expect(publishPassport(deps, asset)).rejects.toThrow("rekonsiliasi");
    expect((await state(asset.passportId)).records).toHaveLength(1);
  });

  test("timeout after send persists candidate; restart reuses exact signature and atomically publishes", async () => {
    const asset = await fixture();
    const mocked = mockChain();
    const deps = { db, chain: mocked.chain, logger };
    const { record } = await publishPassport(deps, asset);
    jobsToDelete.add(record.id);
    const oldLease = await lease(record.id);
    mocked.setMode("timeout_after_send");
    await expect(runAnchor(deps, record.id, oldLease)).rejects.toThrow("timed out");
    const [job] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, record.id));
    expect(job?.preparedSignature).toBe(mocked.sent[0]);
    expect(job?.blockhash).toBe("blockhash-1");
    expect((await state(asset.passportId)).records[0]?.txSignature).toBeNull();
    expect((await state(asset.passportId)).passport?.status).toBe("approved");

    const recovered = await lease(record.id);
    mocked.setMode("confirmed");
    await expect(runAnchor(deps, record.id, oldLease)).rejects.toBeInstanceOf(JobLeaseLostError);
    await runAnchor(deps, record.id, recovered);
    expect(mocked.preparedCount).toBe(1);
    if (!job?.preparedSignature) throw new Error("Missing persisted anchor candidate");
    expect(mocked.sent).toEqual([job.preparedSignature, job.preparedSignature]);
    const result = await state(asset.passportId);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.chainStatus).toBe("confirmed");
    expect(result.records[0]?.txSignature).toBe(job?.preparedSignature);
    expect(result.records[0]?.slot).toBe(451);
    expect(result.passport?.status).toBe("published");
    expect(result.passport?.publishedAt).toBeInstanceOf(Date);
    await runAnchor(deps, record.id, recovered);
    expect(mocked.sent).toHaveLength(2);
  });

  test("terminal failure keeps approval; seller retry preserves candidate and refuses changed content", async () => {
    const asset = await fixture();
    const mocked = mockChain();
    const deps = { db, chain: mocked.chain, logger };
    const { record } = await publishPassport(deps, asset);
    jobsToDelete.add(record.id);
    const current = await lease(record.id);
    mocked.setMode("expired");
    await expect(runAnchor(deps, record.id, current)).rejects.toThrow("Expired candidate");
    await db.transaction(async (tx) => {
      await current.assertCurrent(tx);
      await markAnchorFailed(tx, record.id);
      await tx.update(backendJobs).set({ status: "failed", leaseOwner: null, leaseUntil: null }).where(eq(backendJobs.id, current.id));
    });
    const failure = await state(asset.passportId);
    expect(failure.passport?.status).toBe("approved");
    expect(failure.records[0]?.chainStatus).toBe("failed");
    expect(failure.records[0]?.txSignature).toBeNull();

    await expect(retryPassportAnchor(deps, { companyId: crypto.randomUUID(), assetCode: asset.assetCode })).rejects.toThrow();
    const retried = await retryPassportAnchor(deps, asset);
    expect(retried.record.id).toBe(record.id);
    const [job] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, record.id));
    expect(job?.preparedSignature).toBe(mocked.sent[0]);
    expect(job?.status).toBe("pending");
    await db.update(assets).set({ model: "Altered after approval" }).where(eq(assets.id, asset.assetId));
    const next = await lease(record.id);
    mocked.setMode("confirmed");
    await expect(runAnchor(deps, record.id, next)).rejects.toThrow("Candidate does not sign approved memo");
    expect(mocked.preparedCount).toBe(1);
    expect((await state(asset.passportId)).passport?.status).toBe("approved");
  });

  test("confirmed approved legacy record reconciles verified memo, never creates version two", async () => {
    const asset = await fixture();
    const mocked = mockChain();
    const deps = { db, chain: mocked.chain, logger };
    const { record } = await publishPassport(deps, asset);
    jobsToDelete.add(record.id);
    await runAnchor(deps, record.id, await lease(record.id));
    const confirmed = (await state(asset.passportId)).records[0]!;
    await db.update(passports).set({ status: "approved", publishedAt: null }).where(eq(passports.id, asset.passportId));
    const repaired = await publishPassport(deps, asset);
    expect(repaired.passport.status).toBe("published");
    expect(repaired.record.id).toBe(record.id);
    await db.update(passports).set({ status: "approved", publishedAt: null }).where(eq(passports.id, asset.passportId));
    mocked.seen.set(confirmed.txSignature!, { memo: "forged-memo", slot: 451 });
    await expect(publishPassport(deps, asset)).rejects.toThrow("rekonsiliasi");
    expect((await state(asset.passportId)).records.map((entry) => entry.version)).toEqual([1]);
    expect((await state(asset.passportId)).passport?.status).toBe("approved");
  });
});
