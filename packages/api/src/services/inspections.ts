import { aiInspections, passports, type Database } from "@hospiledger/db";
import type { InspectionsGetOutput, InspectionsStartOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import type { InspectionAi } from "../ai/types";
import type { DbHandle } from "../db";
import { enqueueBackendJob, type JobLease } from "../jobs/runner";
import type { Logger } from "../logger";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { loadOwnedAsset } from "./ownership";
import { transitionPassportStatus } from "./passport-status";
import { findMissingRequiredPhotos, loadAssetPhotos, lockPhotoPassport } from "./photos";

export type InspectionJobDeps = {
  db: Database;
  ai: InspectionAi;
  storage: AssetPhotoStorage;
  logger: Logger;
};

export type InspectionDeps = InspectionJobDeps;

const STARTABLE_PASSPORT_STATUSES: readonly string[] = ["draft", "ai_failed"];


/**
 * Submits an asset for AI inspection under the same passport lock used by photo confirmation.
 * The linked processing row, state transitions, and durable job are committed together.
 *
 * @param deps database, AI client, photo storage, and logger
 * @param input owning company and asset id
 * @returns the new inspection id and its initial status
 * @throws {TRPCError} `NOT_FOUND` for a foreign asset, `BAD_REQUEST` when required photos are missing or the status forbids starting
 */
export async function startInspection(
  deps: InspectionDeps,
  input: { companyId: string; assetId: string },
): Promise<InspectionsStartOutput> {
  return deps.db.transaction(async (tx) => {
    const passport = await lockPhotoPassport(tx, input.assetId);
    await loadOwnedAsset(tx, input);
    if (!STARTABLE_PASSPORT_STATUSES.includes(passport.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Inspeksi tidak bisa dimulai dari status ${passport.status}.`,
      });
    }
    const missing = findMissingRequiredPhotos(await loadAssetPhotos(tx, input.assetId));
    if (missing.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Foto wajib belum lengkap. ${missing.map((entry) => entry.reason).join(" ")}`,
      });
    }

    const [inspection] = await tx.insert(aiInspections)
      .values({ assetId: input.assetId, status: "processing" }).returning();
    if (!inspection) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal memulai inspeksi." });
    }
    if (passport.status === "draft") await transitionPassportStatus(tx, passport.id, "submitted");
    await transitionPassportStatus(tx, passport.id, "ai_processing");
    await tx.update(passports).set({ inspectionId: inspection.id, updatedAt: new Date() })
      .where(eq(passports.id, passport.id));
    await enqueueBackendJob(tx, "inspection", inspection.id);
    return { inspectionId: inspection.id, status: "processing" };
  });
}

/**
 * Loads the passport-linked inspection of an owned asset with its status and stored photos, for status polling.
 *
 * @param db database or transaction handle
 * @param input owning company and asset id
 * @returns the linked inspection, the passport status, and every stored photo
 * @throws {TRPCError} `NOT_FOUND` for a foreign asset
 */
export async function loadInspection(
  db: DbHandle,
  input: { companyId: string; assetId: string },
): Promise<InspectionsGetOutput> {
  await loadOwnedAsset(db, input);
  const passport = await db.query.passports.findFirst({
    where: { assetId: input.assetId },
    columns: { status: true, inspectionId: true },
  });
  const inspection = passport?.inspectionId
    ? await db.query.aiInspections.findFirst({ where: { id: passport.inspectionId, assetId: input.assetId } })
    : null;
  return {
    inspection: inspection ?? null,
    passportStatus: passport?.status ?? null,
    photos: await loadAssetPhotos(db, input.assetId),
  };
}

/**
 * Runs AI only for the passport-linked processing inspection. AI I/O is outside SQL;
 * the completed outcome and both status transitions commit together under the job lease.
 *
 * @param deps database, AI client, photo storage, and logger
 * @param inspectionId inspection to run
 * @param lease current worker lease fencing domain writes
 */
export async function runInspection(deps: InspectionJobDeps, inspectionId: string, lease: JobLease): Promise<void> {
  const inspection = await deps.db.query.aiInspections.findFirst({ where: { id: inspectionId } });
  if (!inspection || inspection.status !== "processing") return;
  const passport = await deps.db.query.passports.findFirst({ where: { assetId: inspection.assetId } });
  if (passport?.inspectionId !== inspectionId || passport.status !== "ai_processing") return;

  const photos = (await loadAssetPhotos(deps.db, inspection.assetId)).filter((photo) => photo.qualityOk);
  const asset = await deps.db.query.assets.findFirst({ where: { id: inspection.assetId } });
  if (!asset) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Aset tidak ditemukan." });
  }
  const outcome = await deps.ai.inspect({
    asset: {
      category: asset.category,
      brand: asset.brand,
      model: asset.model,
      serialNumber: asset.serialNumber,
      year: asset.year,
      capacity: asset.capacity,
      location: asset.location,
      previousUsage: asset.previousUsage,
    },
    photos: await Promise.all(
      photos.map(async (photo) => ({ type: photo.type, url: await deps.storage.createReadUrl(photo.storagePath) })),
    ),
  }, {
    onProgress: async (progress) => {
      await deps.db.transaction(async (tx) => {
        await lease.assertCurrent(tx);
        await tx.update(aiInspections)
          .set({ progress, updatedAt: new Date() })
          .where(and(eq(aiInspections.id, inspectionId), eq(aiInspections.status, "processing")));
      });
    },
  });

  const committed = await deps.db.transaction(async (tx) => {
    await lease.assertCurrent(tx);
    const locked = await lockPhotoPassport(tx, inspection.assetId);
    if (locked.inspectionId !== inspectionId || locked.status !== "ai_processing") return false;
    const current = await tx.query.aiInspections.findFirst({ where: { id: inspectionId } });
    if (!current || current.status !== "processing" || current.assetId !== inspection.assetId) return false;
    await tx.update(aiInspections)
      .set({
        status: "complete",
        progress: null,
        detectedBrand: outcome.detectedBrand,
        detectedModel: outcome.detectedModel,
        confidence: outcome.confidence,
        ocrResult: outcome.ocr,
        damageResult: outcome.damage,
        damageSeverity: outcome.damageSeverity,
        conditionScore: outcome.conditionScore,
        grade: outcome.grade,
        scoreComponents: outcome.scoreComponents,
        rawOutput: outcome.rawOutput,
        valueEstimate: outcome.valueEstimate,
        valueMin: outcome.valueMin,
        valueMax: outcome.valueMax,
        updatedAt: new Date(),
      })
      .where(eq(aiInspections.id, inspectionId));
    await transitionPassportStatus(tx, locked.id, "ai_complete");
    await transitionPassportStatus(tx, locked.id, "pending_review");
    return true;
  });
  if (committed) deps.logger.info("Inspeksi AI selesai.", { inspectionId, assetId: inspection.assetId });
}

const FAILURE_MESSAGES: Record<string, string> = {
  inspection_validation: "Hasil inspeksi AI tidak dapat diproses. Silakan ulangi inspeksi atau hubungi dukungan.",
  lease_expired: "Inspeksi AI terhenti sebelum selesai. Silakan ulangi inspeksi.",
};

/** Called by the worker on terminal exhaustion inside its lease-guarded transaction. */
export async function markInspectionFailed(tx: DbHandle, inspectionId: string, category: string): Promise<void> {
  const inspection = await tx.query.aiInspections.findFirst({ where: { id: inspectionId } });
  if (!inspection || inspection.status !== "processing") return;
  const passport = await lockPhotoPassport(tx, inspection.assetId);
  if (passport.inspectionId !== inspectionId || passport.status !== "ai_processing") return;
  await tx.update(aiInspections)
    .set({
      status: "failed",
      failureReason: FAILURE_MESSAGES[category] ??
        "Layanan inspeksi AI sedang tidak tersedia. Silakan ulangi inspeksi.",
      updatedAt: new Date(),
    })
    .where(eq(aiInspections.id, inspectionId));
  await transitionPassportStatus(tx, passport.id, "ai_failed");
}
