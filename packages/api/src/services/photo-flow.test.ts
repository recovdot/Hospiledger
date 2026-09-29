import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { assetPhotos, assets, backendJobs, companies, createDb, passports, photoUploadReservations, type Database } from "@hospiledger/db";
import { sha256HexOfBytes } from "@hospiledger/shared/hashing";
import { eq, inArray } from "drizzle-orm";

import { createJobRunner } from "../jobs/runner";
import type { Logger } from "../logger";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import {
  confirmPhotoUpload, createPhotoUploadUrl, repairLegacyPhoto, retryFailedPhotoDeletions, runDeletePhoto, sweepExpiredPhotoReservations,
} from "./photos";

const testUrl = process.env.TEST_DATABASE_URL;
const isolated = testUrl && testUrl !== process.env.DATABASE_URL && /(?:^|[_-])test(?:[_-]|$)/i.test(new URL(testUrl).pathname);
const databaseTests = isolated ? describe : describe.skip;

function pngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 3, 32, 0, 0, 2, 88,
  ]);
}

type MemoryPhotoStorage = {
  objects: Map<string, Uint8Array>;
  removed: string[];
  storage: AssetPhotoStorage;
};

function memoryStorage(): MemoryPhotoStorage {
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const storage: AssetPhotoStorage = {
    ensureBucket: async () => {},
    createUploadUrl: async (path) => ({ signedUrl: `signed:${path}`, token: `token:${path}` }),
    createReadUrl: async (path) => `read:${path}`,
    readObject: async (path) => objects.get(path) ?? null,
    removeObject: async (path) => { objects.delete(path); removed.push(path); },
    uploadObject: async (path, bytes) => {
      if (objects.has(path)) throw new Error("Non-upsert upload cannot replace bytes");
      objects.set(path, bytes);
    },
  };
  return { objects, removed, storage };
}

databaseTests("photo evidence confirmation", () => {
  let db: Database;
  const companiesToDelete = new Set<string>();
  const pathsToDelete = new Set<string>();

  async function fixture() {
    const [company] = await db.insert(companies).values({ name: "Isolated photo test" }).returning();
    if (!company) throw new Error("Missing company fixture");
    companiesToDelete.add(company.id);
    const [asset] = await db.insert(assets).values({ companyId: company.id, category: "Oven", brand: "A", model: "B" }).returning();
    if (!asset) throw new Error("Missing asset fixture");
    await db.insert(passports).values({ assetId: asset.id, assetCode: `HPL-2026-${crypto.randomUUID().slice(0, 8)}` });
    return { companyId: company.id, assetId: asset.id };
  }

  async function issueAndUpload(storage: MemoryPhotoStorage, companyId: string, assetId: string, type: "front" | "side") {
    const issued = await createPhotoUploadUrl(db, storage.storage, {
      companyId, assetId, type, contentType: "image/png", fileSize: pngBytes().byteLength,
    });
    storage.objects.set(issued.storagePath, pngBytes());
    pathsToDelete.add(issued.storagePath);
    return issued.storagePath;
  }

  beforeAll(() => { db = createDb({ DATABASE_URL: testUrl! }); });
  afterEach(async () => {
    if (pathsToDelete.size) await db.delete(backendJobs).where(inArray(backendJobs.targetId, [...pathsToDelete]));
    if (companiesToDelete.size) await db.delete(companies).where(inArray(companies.id, [...companiesToDelete]));
    pathsToDelete.clear();
    companiesToDelete.clear();
  });
  afterAll(async () => { await db.$client.end(); });

  test("rejects changed slot and a replay; concurrent confirmations consume one reservation", async () => {
    const { companyId, assetId } = await fixture();
    const stored = memoryStorage();
    const storagePath = await issueAndUpload(stored, companyId, assetId, "front");
    await expect(confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "side", storagePath })).rejects.toThrow();
    const attempts = await Promise.allSettled([
      confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "front", storagePath }),
      confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "front", storagePath }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const rows = await db.select().from(assetPhotos).where(eq(assetPhotos.assetId, assetId));
    expect(rows.map((photo) => photo.storagePath)).toEqual([storagePath]);
    await expect(confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "front", storagePath })).rejects.toThrow();
  });

  test("required-slot replacement preserves old object until committed and schedules deferred cleanup", async () => {
    const { companyId, assetId } = await fixture();
    const stored = memoryStorage();
    const originalPath = await issueAndUpload(stored, companyId, assetId, "front");
    await confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "front", storagePath: originalPath });
    const replacementPath = await issueAndUpload(stored, companyId, assetId, "front");
    await confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "front", storagePath: replacementPath });
    const rows = await db.select().from(assetPhotos).where(eq(assetPhotos.assetId, assetId));
    expect(rows.map((photo) => photo.storagePath)).toEqual([replacementPath]);
    expect(stored.objects.has(originalPath)).toBe(true);
    expect(stored.removed).toEqual([]);
    const [deletion] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, originalPath));
    expect(deletion?.kind).toBe("delete_photo");
    expect(deletion?.runAfter.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });

  test("expired reservation cannot be confirmed; sweep queues unreferenced object after token expiry", async () => {
    const { companyId, assetId } = await fixture();
    const stored = memoryStorage();
    const storagePath = await issueAndUpload(stored, companyId, assetId, "front");
    await db.update(photoUploadReservations).set({ expiresAt: new Date(0), createdAt: new Date(0) })
      .where(eq(photoUploadReservations.storagePath, storagePath));
    await expect(confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "front", storagePath })).rejects.toThrow();
    expect(await sweepExpiredPhotoReservations(db)).toBe(1);
    const [deletion] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, storagePath));
    expect(deletion?.status).toBe("pending");
    expect((await db.select().from(assetPhotos).where(eq(assetPhotos.assetId, assetId)))).toEqual([]);
    const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
    const worker = createJobRunner(db, logger, {
      inspection: { run: async () => { throw new Error("Unexpected inspection"); } },
      anchor: { run: async () => { throw new Error("Unexpected anchor"); } },
      delete_photo: { run: (path, lease) => runDeletePhoto({ db, storage: stored.storage, logger }, path, lease) },
    });
    expect(await worker.workOnce()).toBe(true);
    expect(stored.objects.has(storagePath)).toBe(false);
    expect(await db.select().from(photoUploadReservations).where(eq(photoUploadReservations.storagePath, storagePath))).toEqual([]);
  });

  test("retries an exhausted unreferenced deletion after its cooldown and removes the reservation", async () => {
    const { companyId, assetId } = await fixture();
    const stored = memoryStorage();
    const storagePath = await issueAndUpload(stored, companyId, assetId, "front");
    await db.update(photoUploadReservations).set({ createdAt: new Date(0), expiresAt: new Date(0) })
      .where(eq(photoUploadReservations.storagePath, storagePath));
    await sweepExpiredPhotoReservations(db, new Date(3 * 60 * 60 * 1000));
    stored.storage.removeObject = async () => { throw new Error("Storage temporarily unavailable"); };
    const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
    const worker = createJobRunner(db, logger, {
      inspection: { run: async () => { throw new Error("Unexpected inspection"); } },
      anchor: { run: async () => { throw new Error("Unexpected anchor"); } },
      delete_photo: { run: (path, lease) => runDeletePhoto({ db, storage: stored.storage, logger }, path, lease) },
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await worker.workOnce()).toBe(true);
      if (attempt < 2) {
        await db.update(backendJobs).set({ runAfter: new Date(0) })
          .where(eq(backendJobs.targetId, storagePath));
      }
    }
    const [failed] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, storagePath));
    expect(failed?.status).toBe("failed");
    if (!failed) throw new Error("Missing failed deletion job");
    expect(await retryFailedPhotoDeletions(db, new Date(failed.updatedAt.getTime() + 14 * 60 * 1000))).toBe(0);
    stored.storage.removeObject = async (path) => { stored.objects.delete(path); stored.removed.push(path); };
    expect(await retryFailedPhotoDeletions(db, new Date(failed.updatedAt.getTime() + 16 * 60 * 1000))).toBe(1);
    expect(await worker.workOnce()).toBe(true);
    expect(stored.objects.has(storagePath)).toBe(false);
    expect(await db.select().from(photoUploadReservations).where(eq(photoUploadReservations.storagePath, storagePath))).toEqual([]);
  });

  test("retried deletion preserves photo bytes that became referenced", async () => {
    const { companyId, assetId } = await fixture();
    const stored = memoryStorage();
    const storagePath = await issueAndUpload(stored, companyId, assetId, "front");
    await confirmPhotoUpload(db, stored.storage, { companyId, assetId, type: "front", storagePath });
    await db.insert(backendJobs).values({
      kind: "delete_photo", targetId: storagePath, status: "failed", updatedAt: new Date(0),
    });
    const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
    const worker = createJobRunner(db, logger, {
      inspection: { run: async () => { throw new Error("Unexpected inspection"); } },
      anchor: { run: async () => { throw new Error("Unexpected anchor"); } },
      delete_photo: { run: (path, lease) => runDeletePhoto({ db, storage: stored.storage, logger }, path, lease) },
    });
    expect(await retryFailedPhotoDeletions(db, new Date(16 * 60 * 1000))).toBe(1);
    expect(await worker.workOnce()).toBe(true);
    expect(stored.objects.has(storagePath)).toBe(true);
    expect(stored.removed).toEqual([]);
  });

  test("legacy corruption is reported, never blessed with a newly computed hash", async () => {
    const { assetId } = await fixture();
    const stored = memoryStorage();
    const oldPath = `legacy/${assetId}/front-old.png`;
    stored.objects.set(oldPath, new Uint8Array([1, 2, 3]));
    const [photo] = await db.insert(assetPhotos).values({
      assetId, type: "front", storagePath: oldPath, fileSha256: sha256HexOfBytes(pngBytes()),
      qualityOk: true, createdAt: new Date(0),
    }).returning();
    if (!photo) throw new Error("Missing photo fixture");
    expect(await repairLegacyPhoto(db, stored.storage, photo.id)).toBe("mismatch");
    const [unchanged] = await db.select().from(assetPhotos).where(eq(assetPhotos.id, photo.id));
    expect(unchanged?.storagePath).toBe(oldPath);
    expect(unchanged?.fileSha256).toBe(sha256HexOfBytes(pngBytes()));
  });
  test("legacy verified bytes move to a fresh path without rewriting the evidence hash", async () => {
    const { assetId } = await fixture();
    const stored = memoryStorage();
    const oldPath = `legacy/${assetId}/front-original.png`;
    const bytes = pngBytes();
    stored.objects.set(oldPath, bytes);
    const [photo] = await db.insert(assetPhotos).values({
      assetId, type: "front", storagePath: oldPath, fileSha256: sha256HexOfBytes(bytes),
      qualityOk: true, createdAt: new Date(0),
    }).returning();
    if (!photo) throw new Error("Missing photo fixture");
    expect(await repairLegacyPhoto(db, stored.storage, photo.id)).toBe("repaired");
    const [updated] = await db.select().from(assetPhotos).where(eq(assetPhotos.id, photo.id));
    expect(updated?.storagePath).toContain("-immutable-");
    expect(updated?.fileSha256).toBe(photo.fileSha256);
    expect(stored.objects.get(updated!.storagePath)).toEqual(bytes);
    const [cleanup] = await db.select().from(backendJobs).where(eq(backendJobs.targetId, oldPath));
    expect(cleanup?.status).toBe("pending");
    pathsToDelete.add(oldPath);
    if (updated) pathsToDelete.add(updated.storagePath);
  });

});
