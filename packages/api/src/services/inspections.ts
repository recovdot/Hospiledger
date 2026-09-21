import { aiInspections, passports, type Database } from "@hospiledger/db";
import type { InspectionsGetOutput, InspectionsStartOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";

import type { InspectionAi } from "../ai/types";
import type { DbHandle } from "../db";
import type { JobRunner } from "../jobs/runner";
import type { Logger } from "../logger";
import type { AssetPhotoStorage } from "../storage/asset-photos";
import { loadOwnedAsset } from "./ownership";
import { transitionPassportStatus } from "./passport-status";
import { findMissingRequiredPhotos, loadAssetPhotos } from "./photos";

export type InspectionJobDeps = {
  db: Database;
  ai: InspectionAi;
  storage: AssetPhotoStorage;
  logger: Logger;
};

export type InspectionDeps = InspectionJobDeps & { jobs: JobRunner };

const STARTABLE_PASSPORT_STATUSES: readonly string[] = ["draft", "ai_failed"];

async function loadPassportForAsset(db: DbHandle, assetId: string) {
  const passport = await db.query.passports.findFirst({ where: { assetId } });
  if (!passport) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  return passport;
}

/**
 * Submits an asset for AI inspection: checks the evidence set, opens an inspection row, advances the passport
 * to `ai_processing`, and schedules the inspection job. Also used to retry a passport that is in `ai_failed`.
 *
 * @param deps database, AI client, photo storage, logger, and the job runner
 * @param input owning company and asset id
 * @returns the new inspection id and its initial status
 * @throws {TRPCError} `NOT_FOUND` for a foreign asset, `BAD_REQUEST` when required photos are missing or the status forbids starting
 */
export async function startInspection(
  deps: InspectionDeps,
  input: { companyId: string; assetId: string },
): Promise<InspectionsStartOutput> {
  await loadOwnedAsset(deps.db, input);
  const passport = await loadPassportForAsset(deps.db, input.assetId);
  if (!STARTABLE_PASSPORT_STATUSES.includes(passport.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Inspeksi tidak bisa dimulai dari status ${passport.status}.`,
    });
  }
  const photos = await loadAssetPhotos(deps.db, input.assetId);
  const missing = findMissingRequiredPhotos(photos);
  if (missing.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Foto wajib belum lengkap. ${missing.map((entry) => entry.reason).join(" ")}`,
    });
  }

  const [inspection] = await deps.db
    .insert(aiInspections)
    .values({ assetId: input.assetId, status: "processing" })
    .returning();
  if (!inspection) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal memulai inspeksi." });
  }

  if (passport.status === "draft") {
    await transitionPassportStatus(deps.db, passport.id, "submitted");
  }
  await transitionPassportStatus(deps.db, passport.id, "ai_processing");
  await deps.db
    .update(passports)
    .set({ inspectionId: inspection.id, updatedAt: new Date() })
    .where(eq(passports.id, passport.id));

  deps.jobs.enqueue(`inspection:${inspection.id}`, () => runInspection(deps, inspection.id));
  return { inspectionId: inspection.id, status: "processing" };
}

/**
 * Loads the latest inspection of an owned asset with its passport status and stored photos, for status polling.
 *
 * @param db database or transaction handle
 * @param input owning company and asset id
 * @returns the latest inspection, the passport status, and every stored photo
 * @throws {TRPCError} `NOT_FOUND` for a foreign asset
 */
export async function loadInspection(
  db: DbHandle,
  input: { companyId: string; assetId: string },
): Promise<InspectionsGetOutput> {
  await loadOwnedAsset(db, input);
  const [inspection] = await db
    .select()
    .from(aiInspections)
    .where(eq(aiInspections.assetId, input.assetId))
    .orderBy(desc(aiInspections.createdAt))
    .limit(1);
  const passport = await db.query.passports.findFirst({
    where: { assetId: input.assetId },
    columns: { status: true },
  });
  return {
    inspection: inspection ?? null,
    passportStatus: passport?.status ?? null,
    photos: await loadAssetPhotos(db, input.assetId),
  };
}

/**
 * Runs one AI inspection end to end and advances the passport to `pending_review`.
 * A failure marks the inspection `failed` and the passport `ai_failed`, then rethrows for the job log.
 * Safe to call twice: a run that is no longer `processing` or a passport that is no longer `ai_processing` is skipped.
 *
 * @param deps database, AI client, photo storage, and logger
 * @param inspectionId inspection to run
 */
export async function runInspection(deps: InspectionJobDeps, inspectionId: string): Promise<void> {
  const inspection = await deps.db.query.aiInspections.findFirst({ where: { id: inspectionId } });
  if (!inspection || inspection.status !== "processing") return;
  const passport = await loadPassportForAsset(deps.db, inspection.assetId);
  if (passport.status !== "ai_processing") return;

  try {
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
    });
    await deps.db
      .update(aiInspections)
      .set({
        status: "complete",
        detectedBrand: outcome.detectedBrand,
        detectedModel: outcome.detectedModel,
        confidence: outcome.confidence,
        ocrResult: outcome.ocr,
        damageResult: outcome.damage,
        damageSeverity: outcome.damageSeverity,
        conditionScore: outcome.conditionScore,
        grade: outcome.grade,
        valueEstimate: outcome.valueEstimate,
        valueMin: outcome.valueMin,
        valueMax: outcome.valueMax,
        updatedAt: new Date(),
      })
      .where(eq(aiInspections.id, inspectionId));
  } catch (error) {
    await deps.db.update(aiInspections).set({ status: "failed", updatedAt: new Date() }).where(eq(aiInspections.id, inspectionId));
    if (passport.status === "ai_processing") {
      await transitionPassportStatus(deps.db, passport.id, "ai_failed");
    }
    deps.logger.error("Inspeksi AI gagal.", {
      inspectionId,
      assetId: inspection.assetId,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await transitionPassportStatus(deps.db, passport.id, "ai_complete");
  await transitionPassportStatus(deps.db, passport.id, "pending_review");
  deps.logger.info("Inspeksi AI selesai.", { inspectionId, assetId: inspection.assetId });
}
