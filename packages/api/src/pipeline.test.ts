import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { backendJobs, createDb, assets, passportRecords, type Database } from "@hospiledger/db";
import { buildMemo, REQUIRED_PHOTO_TYPES, type PhotoType } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { computeContentHash } from "./services/integrity";
import type { JobLease } from "./jobs/runner";
import { eq, sql } from "drizzle-orm";

import type { InspectionAi, InspectionOutcome } from "./ai/types";
import type { ChainClient } from "./chain/types";
import type { Context } from "./context";
import { createJobRunner } from "./jobs/runner";
import { runInspection, markInspectionFailed } from "./services/inspections";
import { runAnchor, markAnchorFailed } from "./services/publish";
import { runDeletePhoto } from "./services/photos";
import type { Logger } from "./logger";
import { appRouter } from "./routers/index";
import type { AssetPhotoStorage } from "./storage/asset-photos";

const testUrl = process.env.TEST_DATABASE_URL;
const isolated = testUrl && testUrl !== process.env.DATABASE_URL && /(?:^|[_-])test(?:[_-]|$)/i.test(new URL(testUrl).pathname);
const databaseTests = isolated ? describe : describe.skip;

function pngPhoto(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    (width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff,
    (height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff,
  ]);
}

const BASE_OUTCOME: InspectionOutcome = {
  detectedBrand: "Citra", detectedModel: "CR-40", confidence: 0.95,
  ocr: { serialNumber: "SN-41", voltage: "220 V", capacity: "40 L", manufacturingDate: null },
  damage: [], damageSeverity: "low", conditionScore: 88, grade: "A",
  scoreComponents: { physical: 88, visual: 88, completeness: 88, overall: 88, grade: "A" },
  rawOutput: {
    recognition: [{ detectedBrand: "Citra", detectedModel: "CR-40", confidence: 0.95, ocr: { serialNumber: "SN-41", voltage: "220 V", capacity: "40 L", manufacturingDate: null }, damage: [], photoNotes: "Foto jelas." }],
    assessment: { damageSeverity: "low", physical: 88, visual: 88, completeness: 88, overall: 88, grade: "A" },
  },
  valueEstimate: null, valueMin: null, valueMax: null,
};

databaseTests("tRPC seller-to-public pipeline", () => {
  let db: Database;
  const objects = new Map<string, Uint8Array>();
  const anchors = new Map<string, string>();
  const inspectCalls: string[] = [];
  const readMemoCalls: string[] = [];
  const loggerLines: string[] = [];
  const logger: Logger = {
    info: (message) => { loggerLines.push(`info ${message}`); },
    warn: (message) => { loggerLines.push(`warn ${message}`); },
    error: (message) => { loggerLines.push(`error ${message}`); },
  };

  const storage: AssetPhotoStorage = {
    ensureBucket: async () => {},
    createUploadUrl: async (path) => ({ signedUrl: `sign:${path}`, token: `token:${path}` }),
    createReadUrl: async (path) => `read:${path}`,
    readObject: async (path) => objects.get(path) ?? null,
    removeObject: async (path) => { objects.delete(path); },
    uploadObject: async (path, bytes) => { objects.set(path, bytes); },
  };

  const inspectionAi: InspectionAi = {
    inspect: async (request) => {
      inspectCalls.push(request.asset.serialNumber ?? "");
      return { ...BASE_OUTCOME, detectedBrand: request.asset.brand, detectedModel: request.asset.model };
    },
  };

  const chain: ChainClient = {
    chainCluster: "test-cluster",
    getSignerAddress: () => "platform-signer",
    getSignerLamports: async () => 1_000_000_000,
    prepareMemo: async (memo) => {
      const txSignature = `sig:${memo}`;
      anchors.set(txSignature, memo);
      return { txSignature, blockhash: "test-blockhash", lastValidBlockHeight: 999_000, chainCluster: "test-cluster" };
    },
    broadcastPreparedMemo: async (memo, prepared) => {
      if (anchors.get(prepared.txSignature) !== memo) throw new Error("Candidate mismatch");
      return { txSignature: prepared.txSignature, slot: 700, chainCluster: "test-cluster" };
    },
    readMemo: async (txSignature) => {
      readMemoCalls.push(txSignature);
      const memo = anchors.get(txSignature);
      return memo ? { kind: "confirmed", slot: 700, memoText: memo, errored: false } : { kind: "not_found" };
    },
  };

  type PipelineCaller = Awaited<ReturnType<typeof appRouter.createCaller>>;

  function makeCaller(clientLayer: { user: Context["user"]; profile: Context["profile"]; clientKey: string }): PipelineCaller {
    return appRouter.createCaller(context(clientLayer));
  }

  function context(clientLayer: { user: Context["user"]; profile: Context["profile"]; clientKey: string }): Context {
    return { db, supabase: {} as Context["supabase"], storage, ai: inspectionAi, chain,
      jobs: { enqueue: async () => {}, drain: async () => {} } as unknown as Context["jobs"],
      logger, config: {} as Context["config"], ...clientLayer };
  }

  async function resetTables(): Promise<void> {
    await db.execute(sql`delete from passport_records`);
    await db.execute(sql`delete from seller_reviews`);
    await db.execute(sql`delete from passports`);
    await db.execute(sql`delete from ai_inspections`);
    await db.execute(sql`delete from asset_photos`);
    await db.execute(sql`delete from photo_upload_reservations`);
    await db.execute(sql`delete from assets`);
    await db.execute(sql`delete from companies`);
    await db.execute(sql`delete from public_rpc_budgets`);
    await db.execute(sql`delete from backend_jobs`);
    await db.execute(sql`delete from auth.users`);
    objects.clear();
    anchors.clear();
    inspectCalls.length = 0;
    readMemoCalls.length = 0;
    loggerLines.length = 0;
  }

  async function uploadRequiredPhotos(
    seller: PipelineCaller,
    assetId: string,
  ): Promise<void> {
    for (const type of REQUIRED_PHOTO_TYPES as readonly PhotoType[]) {
      const issued = await seller.photos.createUploadUrl({ assetId, type, contentType: "image/png", fileSize: 13 });
      expect(issued.storagePath.includes("-immutable-")).toBe(true);
      objects.set(issued.storagePath, pngPhoto(800, 600));
      await seller.photos.confirmUpload({ assetId, type, storagePath: issued.storagePath });
    }
  }

  afterEach(async () => { await resetTables(); });

  beforeAll(async () => {
    db = createDb({ DATABASE_URL: testUrl! });
  });

  afterAll(async () => { await db.$client.end(); });

  let preparedCount = 0;

  function healthyWorker() {
    return createJobRunner(db, logger, {
      inspection: { run: (id, lease) => runInspection({ db, ai: inspectionAi, storage, logger }, id, lease) },
      anchor: { run: (id, lease) => runAnchor({ db, chain, logger }, id, lease) },
      delete_photo: { run: (id, lease) => runDeletePhoto({ db, storage, logger }, id, lease) },
    });
  }

  function interruptedAnchorWorker() {
    return createJobRunner(db, logger, {
      inspection: { run: (id, lease) => runInspection({ db, ai: inspectionAi, storage, logger }, id, lease) },
      anchor: {
        run: (id, lease) => { preparedCount++; return runAnchorWithoutBroadcast(id, lease); },
      },
      delete_photo: { run: (id, lease) => runDeletePhoto({ db, storage, logger }, id, lease) },
    });
  }

  /** Simulates a crash after the platform-signed candidate transaction commits, before any network send. */
  async function runAnchorWithoutBroadcast(recordId: string, lease: JobLease): Promise<void> {
    await db.transaction(async (tx) => {
      await lease.assertCurrent(tx);
      const [job] = await tx.select().from(backendJobs).where(eq(backendJobs.id, lease.id)).limit(1);
      const [record] = await tx.select().from(passportRecords).where(eq(passportRecords.id, recordId)).limit(1);
      if (!job || !record) throw new Error("Missing state for simulated crash");
      const contentHash = await computeContentHash(db, record.passportId, record.version);
      const identity = await tx.query.passports.findFirst({ where: { id: record.passportId } });
      if (!identity) throw new Error("Missing identity for simulated crash");
      const memo = buildMemo({ assetCode: identity.assetCode, version: record.version, contentHash });
      const txSignature = `sig:${memo}`;
      anchors.set(txSignature, memo);
      await tx.update(backendJobs).set({
        preparedSignature: txSignature,
        blockhash: "test-blockhash",
        lastValidBlockHeight: 999_000,
        updatedAt: new Date(),
      }).where(eq(backendJobs.id, job.id));
    });
    // The crash happens after the persistence transaction has committed.
    throw new Error("Simulated crash before broadcast.");
  }

  test("seller asset upload inspection review publish, then buyer verify match", async () => {
    const sellerId = crypto.randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${sellerId}::uuid)`);
    const sellerAuth = makeCaller(context({ user: { id: sellerId, email: "seller@example.com" }, profile: null, clientKey: "10.0.0.2" }));
    const established = await sellerAuth.profile.complete({
      name: "Seller", phone: "0812", companyName: "Pipeline shop", role: "seller",
    });
    const company = established.company;

    const seller = makeCaller(context({
      user: { id: sellerId, email: "seller@example.com" },
      profile: {
        id: sellerId, companyId: company.id, name: established.profile.name, phone: established.profile.phone, role: "seller",
      },
      clientKey: "10.0.0.2",
    }));

    // Guest cannot create an asset or read a private seller passport.
    const guest = makeCaller(context({ user: null, profile: null, clientKey: "203.0.0.9" }));
    await expect(guest.assets.create({
      category: "Oven", brand: "X", model: "Y",
    })).rejects.toBeInstanceOf(TRPCError);

    const { asset, passport } = await seller.assets.create({
      category: "Refrigerator", brand: "Citra", model: "CR-40",
    });
    expect(passport.status).toBe("draft");

    await expect(seller.inspections.start({ assetId: asset.id })).rejects.toThrow("Foto wajib belum lengkap");

    await uploadRequiredPhotos(seller, asset.id);
    const detail = await seller.assets.get({ assetId: asset.id });
    expect(detail.photos).toHaveLength(REQUIRED_PHOTO_TYPES.length);
    expect(detail.passport?.status).toBe("draft");

    const started = await seller.inspections.start({ assetId: asset.id });
    expect(started.status).toBe("processing");
    expect(inspectCalls).toEqual([]);

    await expect(seller.inspections.start({ assetId: asset.id })).rejects.toThrow("Inspeksi tidak bisa dimulai dari status ai_processing");

    // The worker claims the committed descriptor and publishes the AI outcome under its lease.
    const jobs = createJobRunner(db, logger, {
      inspection: {
        run: (inspectionId, lease) => runInspection({ db, ai: inspectionAi, storage, logger }, inspectionId, lease),
        onExhausted: (inspectionId, _lease, tx, category) => markInspectionFailed(tx, inspectionId, category),
      },
      anchor: {
        run: (recordId, lease) => runAnchor({ db, chain, logger }, recordId, lease),
        onExhausted: (recordId, _lease, tx) => markAnchorFailed(tx, recordId),
      },
      delete_photo: {
        run: (storagePath, lease) => runDeletePhoto({ db, storage, logger }, storagePath, lease),
      },
    });
    await jobs.workOnce();
    const afterInspection = await seller.inspections.get({ assetId: asset.id });
    expect(afterInspection.passportStatus).toBe("pending_review");
    expect(afterInspection.inspection?.status).toBe("complete");
    expect(afterInspection.inspection?.conditionScore).toBe(88);
    expect(afterInspection.inspection?.detectedBrand).toBe("Citra");
    expect(inspectCalls).toHaveLength(1);
    const assetCode = passport.assetCode;

    // Seller reviews the AI output, stores an edit, then accepts to move to approved.
    await seller.reviews.submit({
      assetCode, decision: "edit", edits: { location: "Gudang Utama" }, notes: "Ditambahkan gudang penyimpanan.",
    });

    const accepted = await seller.reviews.submit({ assetCode, decision: "accept" });
    expect(accepted.passport.status).toBe("approved");

    // Publish creates one pending record plus its anchor job.
    const { record } = await seller.passports.publish({ assetCode });
    expect(record.chainStatus).toBe("pending");
    expect(anchors.size).toEqual(0);

    // Anchor worker prepares and broadcasts exactly one candidate.
    await jobs.workOnce();
    const anchoredDetail = await seller.passports.get({ assetCode });
    expect(anchoredDetail.passport.status).toBe("published");
    expect(anchoredDetail.passport.chain?.chainStatus).toBe("confirmed");
    expect(anchoredDetail.passport.chain?.txSignature).not.toBeNull();
    expect(anchors.size).toEqual(1);

    // Public reads only published passports and sees the exact inspected values and photo cover.
    const buyer = makeCaller(context({ user: null, profile: null, clientKey: "203.0.1.4" }));
    const product = await buyer.publicPassports.getByCode({ assetCode });
    expect(product.passport.conditionScore).toBe(88);
    expect(product.passport.grade).toBe("A");
    expect(product.passport.sellerEdits).toEqual({ location: "Gudang Utama" });
    expect(product.passport.verification.result).toBe("match");
    expect(product.passport.photos).toHaveLength(REQUIRED_PHOTO_TYPES.length);
    expect(product.passport.photos.every((photo: { signedUrl: string }) => photo.signedUrl.startsWith("read:"))).toBe(true);
    expect((await buyer.publicPassports.verify({ assetCode })).verification.result).toBe("match");
    expect(product.passport.valueEstimate).toBeNull();
    expect(product.passport.valueMax).toBeNull();

    // Mutating a stored asset field breaks the recomputed hash but the on-chain memo still matches the old snapshot.
    await db.update(assets).set({ brand: "Citra Altered" }).where(eq(assets.id, asset.id));
    const altered = await buyer.publicPassports.getByCode({ assetCode });
    expect(altered.passport.verification.result).toBe("mismatch");

    // A missing storage object also cannot be reported as intact.
    for (const photoPath of [...objects.keys()]) objects.delete(photoPath);
    const unreadable = await buyer.publicPassports.getByCode({ assetCode });
    expect(unreadable.passport.verification.result).toBe("mismatch");
  });

  test("anchor job interrupted before broadcast recovers with the same record", async () => {
    const sellerId = crypto.randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${sellerId}::uuid)`);
    const sellerAuth = makeCaller(context({ user: { id: sellerId, email: null }, profile: null, clientKey: "10.0.0.2" }));
    const established = await sellerAuth.profile.complete({ name: "Seller", phone: "0812", companyName: "Recovery shop", role: "seller" });
    const company = established.company;
    const seller = makeCaller(context({
      user: { id: sellerId, email: null },
      profile: {
        id: sellerId, companyId: company.id, name: established.profile.name, phone: established.profile.phone, role: "seller",
      },
      clientKey: "10.0.0.2",
    }));
    const { asset, passport } = await seller.assets.create({ category: "Freezer", brand: "Beku", model: "BZ-30" });
    void asset;
    await uploadRequiredPhotos(seller, passport.assetId);
    await seller.inspections.start({ assetId: passport.assetId });
    await healthyWorker().workOnce();
    await seller.reviews.submit({ assetCode: passport.assetCode, decision: "accept" });
    const { record } = await seller.passports.publish({ assetCode: passport.assetCode });
    expect(record.chainStatus).toBe("pending");
    expect(anchors.size).toEqual(0);

    // Simulate a server crash after candidate persistence but before sending: kill on first call.
    const interruptedWorker = interruptedAnchorWorker();
    await interruptedWorker.workOnce();
    expect(preparedCount).toBe(1);
    preparedCount = 0;
    // Simulate enough elapsed time so the retry can be claimed immediately on the pending anchor only.
    await db.update(backendJobs).set({ runAfter: sql`now() - interval '1 second'` })
      .where(eq(backendJobs.kind, "anchor"));

    // Restart: a second worker reuses the persisted candidate and publishes; still exactly one anchor version.
    await healthyWorker().workOnce();
    const restored = await seller.passports.get({ assetCode: passport.assetCode });
    expect(restored.passport.status).toBe("published");
    expect(restored.passport.chain?.chainStatus).toBe("confirmed");
    expect(anchors.size).toEqual(1);

    const [recordCount] = await db.execute(sql`select count(*) from passport_records where passport_id = ${record.passportId}`)
      .then((entry) => entry.rows as { count: string }[]);
    expect(Number(recordCount?.count)).toEqual(1);
  });
});
