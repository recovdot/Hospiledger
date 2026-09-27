import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  aiInspections, assetPhotos, assets, companies, createDb, passports, passportRecords,
  publicRpcBudgets, sellerReviews, type Database,
} from "@hospiledger/db";
import { sha256HexOfBytes } from "@hospiledger/shared/hashing";
import { buildMemo } from "@hospiledger/shared/memo";
import { hashPassportContent } from "@hospiledger/shared/passport-content";
import { eq, inArray } from "drizzle-orm";

import { assignAssetCode } from "./asset-code";
import type { ChainClient } from "../chain/types";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { buildPassportContent, loadLatestChainRecord, verifyPassportAnchor } from "./integrity";
import { getPublicPassport, listPublicPassports } from "./public-passports";
import { chargePublicRpcBudget, cleanupPublicRpcBudgets } from "./public-rpc-budget";

const testUrl = process.env.TEST_DATABASE_URL;
const isolated = testUrl && testUrl !== process.env.DATABASE_URL && /(?:^|[_-])test(?:[_-]|$)/i.test(new URL(testUrl).pathname);
const databaseTests = isolated ? describe : describe.skip;

function photoBytes(tag: string): Uint8Array {
  return new TextEncoder().encode(`photo bytes: ${tag}`);
}

function mixedStorage(byPath: Map<string, Uint8Array>, failing: Set<string>): AssetPhotoStorage {
  return {
    ensureBucket: async () => {},
    createUploadUrl: async (path) => ({ signedUrl: `upload:${path}`, token: "unused" }),
    createReadUrl: async (path) => `read:${path}`,
    readObject: async (path) => {
      if (failing.has(path)) throw new Error("Storage outage");
      return byPath.get(path) ?? null;
    },
    removeObject: async () => {},
    uploadObject: async () => {},
  };
}

function confirmedChain(memoText: string): ChainClient {
  return {
    chainCluster: "test-cluster",
    getSignerAddress: () => "platform-signer",
    getSignerLamports: async () => 0,
    prepareMemo: async (memo: string) => ({ txSignature: `sig:${memo}`, blockhash: "bh", lastValidBlockHeight: 1, chainCluster: "test-cluster" }),
    broadcastPreparedMemo: async () => ({ txSignature: "sig", slot: 1, chainCluster: "test-cluster" }),
    readMemo: async () => ({ kind: "confirmed", slot: 99, memoText, errored: false }),
  };
}

function memoFor(assetCode: string, version: number, contentHash: string): string {
  return buildMemo({ assetCode, version, contentHash });
}

databaseTests("public passport integrity", () => {
  let db: Database;
  const companiesToDelete = new Set<string>();

  async function baseFixture() {
    const [company] = await db.insert(companies).values({ name: "Isolated public test" }).returning();
    if (!company) throw new Error("Company fixture missing");
    companiesToDelete.add(company.id);
    const [asset] = await db.insert(assets).values({ companyId: company.id, category: "Oven", brand: "Brand", model: "Model" }).returning();
    if (!asset) throw new Error("Asset fixture missing");
    const [linked] = await db.insert(aiInspections).values({
      assetId: asset.id, status: "complete", detectedBrand: "Linked", detectedModel: "LinkedModel",
      confidence: 0.92, conditionScore: 85, grade: "B", valueEstimate: 1000, valueMin: 900, valueMax: 1100,
      ocrResult: { serialNumber: "SN-L", voltage: null, capacity: null, manufacturingDate: null },
    }).returning();
    if (!linked) throw new Error("Linked inspection fixture missing");
    const [latest] = await db.insert(aiInspections).values({
      assetId: asset.id, status: "processing", detectedBrand: "Recomputed", detectedModel: "Detached",
    }).returning();
    if (!latest) throw new Error("Latest inspection fixture missing");
    const assetCode = await assignAssetCode(db, 2026);
    const [passport] = await db.insert(passports).values({
      assetId: asset.id, assetCode, inspectionId: linked.id, status: "published",
      publishedAt: new Date("2026-01-05T00:00:00Z"),
    }).returning();
    if (!passport) throw new Error("Passport fixture missing");
    const bytesByPath = new Map<string, Uint8Array>();
    const photoPaths: string[] = [];
    for (const type of ["front", "side", "back", "nameplate"] as const) {
      const bytes = photoBytes(`evidence of ${type} for ${asset.id}`);
      const storagePath = `${company.id}/${asset.id}/${type}-immutable-${crypto.randomUUID()}.png`;
      bytesByPath.set(storagePath, bytes);
      photoPaths.push(storagePath);
      await db.insert(assetPhotos).values({
        assetId: asset.id, type, storagePath, fileSha256: sha256HexOfBytes(bytes), qualityOk: true,
      });
    }
    await db.insert(passportRecords).values({
      passportId: passport.id, inspectionId: linked.id, version: 1,
      chainStatus: "confirmed", txSignature: `sig-${assetCode}`, chainCluster: "test-cluster",
      slot: 42, anchoredAt: new Date("2026-01-06T00:00:00Z"),
    });
    const record = await loadLatestChainRecord(db, passport.id);
    if (!record) throw new Error("Record fixture missing");
    return { companyId: company.id, assetId: asset.id, passportId: passport.id, assetCode, brand: asset.brand, inspectionId: linked.id, record, bytesByPath, photoPaths };
  }

  beforeAll(() => { db = createDb({ DATABASE_URL: testUrl! }); });
  afterEach(async () => {
    if (companiesToDelete.size) await db.delete(companies).where(inArray(companies.id, [...companiesToDelete]));
    companiesToDelete.clear();
    await db.delete(publicRpcBudgets);
  });
  afterAll(async () => { await db.$client.end(); });

  test("public detail, seller detail and published hash all follow the anchored snapshot", async () => {
    const origin = await baseFixture();
    const content = await buildPassportContent(db, origin.passportId, 1);
    const contentHash = hashPassportContent(content);
    expect(content.inspection.detectedBrand).toBe("Linked");
    expect(content.inspection.valueMax).toBe(1100);
    const memo = memoFor(origin.assetCode, 1, contentHash);
    const summary = await getPublicPassport(db, mixedStorage(origin.bytesByPath, new Set()), confirmedChain(memo), { assetCode: origin.assetCode });
    expect(summary.passport.grade).toBe("B");
    expect("conditionScore" in summary.passport).toBe(true);
    expect(summary.passport.photos).toHaveLength(4);
    expect(summary.passport.sellerEdits).toBeNull();
    await db.insert(sellerReviews).values({ passportId: origin.passportId, decision: "edit", edits: { brand: "First fold" }, notes: "First note", reviewedAt: new Date("2026-01-06T00:10:00Z"), createdAt: new Date("2026-01-06T00:10:05Z") });
    const afterEdit = await getPublicPassport(db, mixedStorage(origin.bytesByPath, new Set()), confirmedChain(memo), { assetCode: origin.assetCode });
    expect(afterEdit.passport.sellerEdits).toEqual({ brand: "First fold" });
    const memoAfterFirstFold = memoFor(origin.assetCode, 1, hashPassportContent(await buildPassportContent(db, origin.passportId, 1)));
    const afterEditAgain = await getPublicPassport(db, mixedStorage(origin.bytesByPath, new Set()), confirmedChain(memoAfterFirstFold), { assetCode: origin.assetCode });
    expect(afterEditAgain.passport.verification.result).toBe("match");
    await db.insert(sellerReviews).values([
      { passportId: origin.passportId, decision: "edit", edits: { brand: "Final fold", model: "Later fold" }, notes: "Final note", reviewedAt: new Date("2026-01-06T01:10:00Z"), createdAt: new Date("2026-01-06T01:10:05Z") },
      { passportId: origin.passportId, decision: "edit", edits: { brand: "Middle fold" }, notes: "Middle note", reviewedAt: new Date("2026-01-06T00:30:00Z"), createdAt: new Date("2026-01-06T01:30:05Z") },
    ]);
    const ordered = await getPublicPassport(db, mixedStorage(origin.bytesByPath, new Set()), confirmedChain(memoFor(origin.assetCode, 1, hashPassportContent(await buildPassportContent(db, origin.passportId, 1)))), { assetCode: origin.assetCode });
    expect(ordered.passport.sellerEdits).toEqual({ brand: "Final fold", model: "Later fold" });
    expect(ordered.passport.sellerNotes).toBe("Final note");
    expect(ordered.passport.verification.result).toBe("match");
    const liveHash = hashPassportContent(await buildPassportContent(db, origin.passportId, 1));
    const verified = await verifyPassportAnchor(
      db, mixedStorage(origin.bytesByPath, new Set()), confirmedChain(memoFor(origin.assetCode, 1, liveHash)),
      { id: origin.passportId, assetCode: origin.assetCode }, origin.record, new Date(),
    );
    expect(verified.result).toBe("match");
    expect(verified.memoContentHash).toBe(liveHash);
  });

  test("missing or altered bytes are mismatch and never signed", async () => {
    const origin = await baseFixture();
    const content = await buildPassportContent(db, origin.passportId, 1);
    const contentHash = hashPassportContent(content);
    const memo = memoFor(origin.assetCode, 1, contentHash);
    const altered = new Map(origin.bytesByPath);
    const firstPath = origin.photoPaths[0];
    altered.set(firstPath!, photoBytes("tampered"));
    const alwaysFailing = new Set(origin.photoPaths);
    const failing = mixedStorage(origin.bytesByPath, alwaysFailing);
    const storageAllMissing = mixedStorage(new Map(), new Set());

    const missing = await getPublicPassport(db, storageAllMissing, confirmedChain(memo), { assetCode: origin.assetCode });
    expect(missing.passport.photos).toEqual([]);
    expect(missing.passport.verification.result).toBe("mismatch");
    expect(missing.passport.grade).toBe("B");
    const alteredSummary = await getPublicPassport(db, mixedStorage(altered, new Set()), confirmedChain(memo), { assetCode: origin.assetCode });
    expect(alteredSummary.passport.photos).toEqual([]);
    const outageSummary = await getPublicPassport(db, failing, confirmedChain(memo), { assetCode: origin.assetCode });
    expect(outageSummary.passport.photos).toEqual([]);
    expect(outageSummary.passport.verification.result).toBe("unreachable");

    const verifiedMissing = await verifyPassportAnchor(db, storageAllMissing, confirmedChain(memo), { id: origin.passportId, assetCode: origin.assetCode }, origin.record, new Date());
    expect(verifiedMissing.result).toBe("mismatch");
    const verifiedOutage = await verifyPassportAnchor(db, failing, confirmedChain(memo), { id: origin.passportId, assetCode: origin.assetCode }, origin.record, new Date());
    expect(verifiedOutage.result).toBe("unreachable");
    expect(verifiedOutage.recomputedContentHash).toBe(contentHash);
  });

  test("list uses the linked inspection and hides unverifiable cover photos", async () => {
    const origin = await baseFixture();
    const intact = mixedStorage(origin.bytesByPath, new Set());
    const frontPath = origin.photoPaths[0]!;
    const coverMissing = mixedStorage(new Map([...origin.bytesByPath].filter(([path]) => path !== frontPath)), new Set());
    const coverOutage = mixedStorage(origin.bytesByPath, new Set([frontPath]));

    const page = await listPublicPassports(db, intact, { q: origin.brand, limit: 10, offset: 0 });
    const listedRow = page.items.find((item) => item.assetCode === origin.assetCode);
    if (!listedRow) throw new Error("Listed row missing");
    expect(listedRow.grade).toBe("B");
    expect(listedRow.conditionScore).toBe(85);
    expect(listedRow.valueEstimate).toBe(1000);
    expect(listedRow.publishedAt).toEqual(new Date("2026-01-05T00:00:00Z"));
    expect(page.items.find((item) => item.assetCode === origin.assetCode)?.coverPhotoUrl).toBe(`read:${frontPath}`);
    const itemsCoverMissing = await listPublicPassports(db, coverMissing, { q: origin.brand, limit: 10, offset: 0 });
    expect(itemsCoverMissing.items.find((item) => item.assetCode === origin.assetCode)?.coverPhotoUrl).toBeNull();
    const itemsOutage = await listPublicPassports(db, coverOutage, { q: origin.brand, limit: 10, offset: 0 });
    expect(itemsOutage.items.find((item) => item.assetCode === origin.assetCode)?.coverPhotoUrl).toBeNull();
  });

  test("historical version verification is rejected explicitly", async () => {
    const origin = await baseFixture();
    await db.insert(passportRecords).values({
      passportId: origin.passportId, inspectionId: null, version: 2,
      chainStatus: "confirmed", txSignature: "sig-later", chainCluster: "test-cluster",
      slot: 100, anchoredAt: new Date("2026-02-01T00:00:00Z"),
    });
    const latestRecord = await loadLatestChainRecord(db, origin.passportId);
    if (!latestRecord || latestRecord.id === origin.record.id) throw new Error("Latest record mismatch");
    const storage = mixedStorage(origin.bytesByPath, new Set());
    await expect(verifyPassportAnchor(db, storage, confirmedChain("ignored"), { id: origin.passportId, assetCode: origin.assetCode }, origin.record, new Date()))
      .rejects.toThrow("Verifikasi versi historis belum didukung.");
  });

  test("shared verification budget spans tests and expires", async () => {
    const key = crypto.randomUUID();
    const forgedWindows = [new Date("2026-03-01T00:00:00Z"), new Date("2026-03-01T00:01:00Z")];
    await db.insert(publicRpcBudgets).values({ clientKey: key, windowStart: forgedWindows[0]!, count: 30 });
    expect(await chargePublicRpcBudget(db, key, forgedWindows[0]!)).toBe(false);
    expect(await chargePublicRpcBudget(db, key, forgedWindows[1]!)).toBe(true);
    const rows = await db.select().from(publicRpcBudgets).where(eq(publicRpcBudgets.clientKey, key));
    expect(rows).toHaveLength(2);
    await cleanupPublicRpcBudgets(db, new Date("2026-03-01T00:01:05Z"));
    expect(rows.some((row) => row.windowStart.getTime() === forgedWindows[1]!.getTime())).toBe(true);
    expect((await db.select().from(publicRpcBudgets)).some((row) => row.windowStart.getTime() === forgedWindows[0]!.getTime())).toBe(false);
    const midLeftover = (await db.select().from(publicRpcBudgets).where(eq(publicRpcBudgets.clientKey, key))).find((row) => row.windowStart.getTime() === forgedWindows[1]!.getTime());
    expect(midLeftover?.count).toBe(1);
    await cleanupPublicRpcBudgets(db, new Date("2026-03-01T00:03:05Z"));
    expect(await db.select().from(publicRpcBudgets)).toEqual([]);
  });
});
