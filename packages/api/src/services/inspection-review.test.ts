import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  aiInspections, assetPhotos, assets, backendJobs, companies, createDb, passports, profiles, sellerReviews, type Database,
} from "@hospiledger/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import type { InspectionAi, InspectionOutcome } from "../ai/types";
import { assertJobLease, JobLeaseLostError, type JobLease } from "../jobs/runner";
import type { Logger } from "../logger";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { loadAssetDetail } from "./assets";
import { loadInspection, markInspectionFailed, runInspection, startInspection } from "./inspections";
import { submitReview } from "./reviews";

const testUrl = process.env.TEST_DATABASE_URL;
const isolated = testUrl && testUrl !== process.env.DATABASE_URL && /(?:^|[_-])test(?:[_-]|$)/i.test(new URL(testUrl).pathname);
const databaseTests = isolated ? describe : describe.skip;
const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
const storage: AssetPhotoStorage = {
  ensureBucket: async () => {},
  createUploadUrl: async (path) => ({ signedUrl: `upload:${path}`, token: "unused" }),
  createReadUrl: async (path) => `read:${path}`,
  readObject: async () => null,
  removeObject: async () => {},
  uploadObject: async () => {},
};
const outcome: InspectionOutcome = {
  detectedBrand: "Detected", detectedModel: "Model", confidence: 0.9,
  ocr: { serialNumber: null, voltage: null, capacity: null, manufacturingDate: null },
  damage: [], damageSeverity: null, conditionScore: 82, grade: "B",
  scoreComponents: { physical: 82, visual: 82, completeness: 82, overall: 82, grade: "B" },
  rawOutput: {
    recognition: [{ detectedBrand: "Detected", detectedModel: "Model", confidence: 0.9, ocr: { serialNumber: null, voltage: null, capacity: null, manufacturingDate: null }, damage: [], photoNotes: "Foto jelas." }],
    assessment: { damageSeverity: null, physical: 82, visual: 82, completeness: 82, overall: 82, grade: "B" },
  },
  valueEstimate: null, valueMin: null, valueMax: null,
};

databaseTests("inspection and seller decisions", () => {
  let db: Database;
  const companiesToDelete = new Set<string>();
  const jobsToDelete = new Set<string>();
  const usersToDelete = new Set<string>();

  async function fixture(photos = true) {
    const [company] = await db.insert(companies).values({ name: "Isolated inspection test" }).returning();
    if (!company) throw new Error("Company fixture missing");
    companiesToDelete.add(company.id);
    const reviewerId = crypto.randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${reviewerId}::uuid)`);
    usersToDelete.add(reviewerId);
    await db.insert(profiles).values({ id: reviewerId, companyId: company.id, role: "seller", name: "Seller" });
    const [asset] = await db.insert(assets).values({ companyId: company.id, category: "Oven", brand: "Brand", model: "Unit" }).returning();
    if (!asset) throw new Error("Asset fixture missing");
    const [passport] = await db.insert(passports).values({
      assetId: asset.id, assetCode: `HPL-2026-${crypto.randomUUID().slice(0, 8)}`,
    }).returning();
    if (!passport) throw new Error("Passport fixture missing");
    if (photos) {
      await db.insert(assetPhotos).values((["front", "side", "back", "nameplate"] as const).map((type) => ({
        assetId: asset.id, type, storagePath: `${company.id}/${asset.id}/${type}-${crypto.randomUUID()}.png`,
        fileSha256: "a".repeat(64), qualityOk: true,
      })));
    }
    return { companyId: company.id, assetId: asset.id, passportId: passport.id, assetCode: passport.assetCode, reviewerId };
  }

  function deps(ai: InspectionAi = { inspect: async () => outcome }) {
    return { db, ai, storage, logger };
  }

  async function lease(inspectionId: string): Promise<JobLease> {
    const [job] = await db.update(backendJobs).set({
      status: "running", attempts: 1, leaseOwner: crypto.randomUUID(),
      leaseUntil: new Date(Date.now() + 60_000),
    }).where(and(eq(backendJobs.kind, "inspection"), eq(backendJobs.targetId, inspectionId))).returning();
    if (!job || !job.leaseOwner) throw new Error("Inspection job fixture missing");
    const current: JobLease = {
      id: job.id, owner: job.leaseOwner, attempt: job.attempts,
      assertCurrent(tx) { return assertJobLease(tx, this); },
    };
    return current;
  }

  beforeAll(() => { db = createDb({ DATABASE_URL: testUrl! }); });
  afterEach(async () => {
    if (jobsToDelete.size) await db.delete(backendJobs).where(inArray(backendJobs.targetId, [...jobsToDelete]));
    if (usersToDelete.size) await db.delete(authUsers).where(inArray(authUsers.id, [...usersToDelete]));
    if (companiesToDelete.size) await db.delete(companies).where(inArray(companies.id, [...companiesToDelete]));
    jobsToDelete.clear();
    usersToDelete.clear();
    companiesToDelete.clear();
  });
  afterAll(async () => { await db.$client.end(); });

  test("rejects incomplete evidence and races two starts into one linked processing job", async () => {
    const missing = await fixture(false);
    await expect(startInspection(deps(), missing)).rejects.toThrow("Foto wajib belum lengkap");
    expect(await db.select().from(aiInspections).where(eq(aiInspections.assetId, missing.assetId))).toEqual([]);
    const asset = await fixture();
    const attempts = await Promise.allSettled([startInspection(deps(), asset), startInspection(deps(), asset)]);
    const successes = attempts.filter((entry) => entry.status === "fulfilled");
    expect(successes).toHaveLength(1);
    expect(attempts.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    const [passport] = await db.select().from(passports).where(eq(passports.id, asset.passportId));
    const rows = await db.select().from(aiInspections).where(eq(aiInspections.assetId, asset.assetId));
    expect(passport?.status).toBe("ai_processing");
    expect(rows).toHaveLength(1);
    expect(passport?.inspectionId).toBe(rows[0]?.id);
    const [job] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, rows[0]!.id));
    expect(job?.kind).toBe("inspection");
    expect(job?.status).toBe("pending");
    jobsToDelete.add(rows[0]!.id);
  });

  test("failed AI leaves processing for retry; stale lease cannot commit, current lease commits outcome once", async () => {
    const asset = await fixture();
    const { inspectionId } = await startInspection(deps(), asset);
    jobsToDelete.add(inspectionId);
    const current = await lease(inspectionId);
    await expect(runInspection(deps({ inspect: async () => { throw new Error("temporary provider outage secret"); } }), inspectionId, current))
      .rejects.toThrow("temporary provider outage secret");
    const [afterFailure] = await db.select().from(aiInspections).where(eq(aiInspections.id, inspectionId));
    expect(afterFailure?.status).toBe("processing");
    expect(afterFailure?.failureReason).toBeNull();

    await db.update(backendJobs).set({ leaseOwner: crypto.randomUUID() }).where(eq(backendJobs.targetId, inspectionId));
    await expect(runInspection(deps(), inspectionId, current)).rejects.toBeInstanceOf(JobLeaseLostError);
    const [afterLostLease] = await db.select().from(aiInspections).where(eq(aiInspections.id, inspectionId));
    expect(afterLostLease?.status).toBe("processing");
    const active = await lease(inspectionId);
    let calls = 0;
    await runInspection(deps({ inspect: async () => { calls++; return outcome; } }), inspectionId, active);
    await runInspection(deps({ inspect: async () => { calls++; return { ...outcome, detectedBrand: "Overwritten" }; } }), inspectionId, active);
    expect(calls).toBe(1);
    const [completed] = await db.select().from(aiInspections).where(eq(aiInspections.id, inspectionId));
    const [passport] = await db.select().from(passports).where(eq(passports.id, asset.passportId));
    expect(completed?.status).toBe("complete");
    expect(completed?.detectedBrand).toBe("Detected");
    expect(passport?.status).toBe("pending_review");
  });

  test("worker persists live progress during the run and clears it when the outcome commits", async () => {
    const asset = await fixture();
    const { inspectionId } = await startInspection(deps(), asset);
    jobsToDelete.add(inspectionId);
    const active = await lease(inspectionId);
    await runInspection(deps({
      inspect: async (_request, hooks) => {
        await hooks?.onProgress({ stage: "recognition", done: 1, total: 3 });
        const [midRun] = await db.select().from(aiInspections).where(eq(aiInspections.id, inspectionId));
        expect(midRun?.progress).toEqual({ stage: "recognition", done: 1, total: 3 });
        await hooks?.onProgress({ stage: "assessment", done: 2, total: 3 });
        return outcome;
      },
    }), inspectionId, active);

    const [completed] = await db.select().from(aiInspections).where(eq(aiInspections.id, inspectionId));
    expect(completed?.status).toBe("complete");
    expect(completed?.progress).toBeNull();
  });

  test("terminal failure is safe and linked; later unrelated inspection cannot replace the projected row", async () => {
    const asset = await fixture();
    const { inspectionId } = await startInspection(deps(), asset);
    jobsToDelete.add(inspectionId);
    await db.transaction(async (tx) => { await markInspectionFailed(tx, inspectionId, "raw provider API key supersecret"); });
    const [failed] = await db.select().from(aiInspections).where(eq(aiInspections.id, inspectionId));
    expect(failed?.status).toBe("failed");
    expect(failed?.failureReason).not.toContain("supersecret");
    expect((await loadInspection(db, asset)).inspection?.failureReason).toBe(failed?.failureReason);
    const [passport] = await db.select().from(passports).where(eq(passports.id, asset.passportId));
    expect(passport?.status).toBe("ai_failed");

    const retried = await startInspection(deps(), asset);
    jobsToDelete.add(retried.inspectionId);
    const [unlinked] = await db.insert(aiInspections).values({ assetId: asset.assetId, status: "processing" }).returning();
    if (!unlinked) throw new Error("Inspection fixture missing");
    const poll = await loadInspection(db, asset);
    const detail = await loadAssetDetail(db, storage, asset);
    expect(poll.inspection?.id).toBe(retried.inspectionId);
    expect(detail.inspection?.id).toBe(retried.inspectionId);
    await runInspection(deps({ inspect: async () => { throw new Error("Unlinked inspection must be skipped"); } }), unlinked.id,
      { id: "unused", owner: "unused", attempt: 0, assertCurrent: async () => { throw new Error("Should not lock"); } });
    const [orphan] = await db.select().from(aiInspections).where(eq(aiInspections.id, unlinked.id));
    expect(orphan?.status).toBe("processing");
  });

  test("concurrent accepts do not leave a losing review; edits remain separate from AI output", async () => {
    const asset = await fixture();
    const { inspectionId } = await startInspection(deps(), asset);
    jobsToDelete.add(inspectionId);
    await runInspection(deps(), inspectionId, await lease(inspectionId));
    await submitReview(db, {
      companyId: asset.companyId, reviewerId: asset.reviewerId,
      review: { assetCode: asset.assetCode, decision: "edit", edits: { brand: "Seller correction" } },
    });
    const input = { companyId: asset.companyId, reviewerId: asset.reviewerId,
      review: { assetCode: asset.assetCode, decision: "accept" as const } };
    const attempts = await Promise.allSettled([submitReview(db, input), submitReview(db, input)]);
    expect(attempts.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    const reviews = await db.select().from(sellerReviews).where(eq(sellerReviews.passportId, asset.passportId));
    expect(reviews.map((review) => review.decision).sort()).toEqual(["accept", "edit"]);
    const [passport] = await db.select().from(passports).where(eq(passports.id, asset.passportId));
    const [inspection] = await db.select().from(aiInspections).where(eq(aiInspections.id, inspectionId));
    expect(passport?.status).toBe("approved");
    expect(inspection?.detectedBrand).toBe("Detected");
  });
});
