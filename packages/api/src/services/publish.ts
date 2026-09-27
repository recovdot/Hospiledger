import { backendJobs, passportRecords, passports, type Database } from "@hospiledger/db";
import { buildMemo } from "@hospiledger/shared";
import type { PassportsPublishOutput, PassportsRetryAnchorOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { AnchorError } from "../chain/client";
import type { ChainClient, PreparedMemo } from "../chain/types";
import type { DbHandle } from "../db";
import { enqueueBackendJob, retryBackendJob, type JobLease } from "../jobs/runner";
import type { Logger } from "../logger";
import { computeContentHash, loadLatestChainRecord } from "./integrity";
import { loadOwnedPassport } from "./ownership";
import { toChainAnchor } from "./passports";
import { transitionPassportStatus } from "./passport-status";
import type { PassportRecordRow } from "./rows";

export type AnchorJobDeps = {
  db: Database;
  chain: ChainClient;
  logger: Logger;
};

/** Job descriptors are inserted transactionally; the worker polls without in-process scheduling. */
export type AnchorDeps = AnchorJobDeps;

function reconciliationRequired(): never {
  throw new TRPCError({
    code: "CONFLICT",
    message: "Riwayat pencatatan Solana tidak pasti. Hubungi operator untuk rekonsiliasi.",
  });
}

async function lockPassport(db: DbHandle, id: string) {
  const [passport] = await db.select().from(passports).where(eq(passports.id, id)).for("update").limit(1);
  if (!passport) throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  return passport;
}

async function pendingRecord(db: DbHandle, record: PassportRecordRow): Promise<PassportRecordRow> {
  const [job] = await db.select().from(backendJobs)
    .where(and(eq(backendJobs.kind, "anchor"), eq(backendJobs.targetId, record.id))).limit(1);
  if (!job) reconciliationRequired(); // Legacy pending sends cannot be proven absent.
  if (record.chainStatus === "pending") {
    if (job.status !== "pending" && job.status !== "running") reconciliationRequired();
    return record;
  }
  if (record.chainStatus !== "failed" || job.status !== "failed") reconciliationRequired();
  await retryBackendJob(db, "anchor", record.id); // Preserves the prepared candidate.
  const [reset] = await db.update(passportRecords)
    .set({ chainStatus: "pending", updatedAt: new Date() })
    .where(and(eq(passportRecords.id, record.id), eq(passportRecords.chainStatus, "failed"), isNull(passportRecords.txSignature)))
    .returning();
  if (!reset) reconciliationRequired();
  return reset;
}

async function memoForRecord(db: DbHandle, passport: { id: string; assetCode: string }, record: PassportRecordRow) {
  return buildMemo({
    assetCode: passport.assetCode,
    version: record.version,
    contentHash: await computeContentHash(db, passport.id, record.version),
  });
}

/** No RPC inside SQL transactions; confirmed legacy rows are reconciled only after checking their memo. */
async function reconcileConfirmed(deps: AnchorDeps, passportId: string, record: PassportRecordRow) {
  if (!record.txSignature || record.version !== 1 || record.chainCluster !== deps.chain.chainCluster) reconciliationRequired();
  const snapshot = await deps.db.query.passports.findFirst({ where: { id: passportId } });
  if (!snapshot || snapshot.status !== "approved") reconciliationRequired();
  if (snapshot.inspectionId !== record.inspectionId) reconciliationRequired();
  const memo = await memoForRecord(deps.db, snapshot, record);
  const chain = await deps.chain.readMemo(record.txSignature);
  if (chain.kind !== "confirmed" || chain.errored || chain.memoText !== memo || chain.slot !== record.slot) {
    reconciliationRequired();
  }
  return deps.db.transaction(async (tx) => {
    const passport = await lockPassport(tx, passportId);
    const latest = await loadLatestChainRecord(tx, passportId);
    if (passport.status !== "approved" || latest?.id !== record.id || latest.txSignature !== record.txSignature
      || latest.chainStatus !== "confirmed" || latest.inspectionId !== passport.inspectionId
      || await memoForRecord(tx, passport, latest) !== memo) {
      reconciliationRequired();
    }
    const published = await transitionPassportStatus(tx, passport.id, "published");
    return { passport: { ...published, chain: toChainAnchor(latest) }, record: latest };
  });
}

/** Starts or resumes the sole approved snapshot. Concurrent calls serialize on the passport lock. */
export async function publishPassport(
  deps: AnchorDeps,
  input: { companyId: string; assetCode: string },
): Promise<PassportsPublishOutput> {
  const result = await deps.db.transaction(async (tx) => {
    const owned = await loadOwnedPassport(tx, input);
    const passport = await lockPassport(tx, owned.id);
    if (passport.status !== "approved") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Passport belum disetujui untuk dipublikasikan." });
    }
    const latest = await loadLatestChainRecord(tx, passport.id);
    if (latest?.chainStatus === "confirmed") {
      return { passport, record: latest, reconcile: true as const };
    }
    let record: PassportRecordRow;
    if (latest) {
      if (latest.version !== 1 || latest.inspectionId !== passport.inspectionId
        || latest.chainCluster !== deps.chain.chainCluster || latest.txSignature) {
        reconciliationRequired();
      }
      record = await pendingRecord(tx, latest);
    } else {
      const [created] = await tx.insert(passportRecords).values({
        passportId: passport.id,
        inspectionId: passport.inspectionId,
        version: 1,
        chainStatus: "pending",
        chainCluster: deps.chain.chainCluster,
      }).returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal membuat catatan passport." });
      record = created;
      await enqueueBackendJob(tx, "anchor", record.id);
    }
    return { passport, record, reconcile: false as const };
  });
  if (result.reconcile) return reconcileConfirmed(deps, result.passport.id, result.record);
  return { passport: { ...result.passport, chain: toChainAnchor(result.record) }, record: result.record };
}

/** Explicit seller/admin retry resets the same version and retains its persisted candidate. */
export async function retryPassportAnchor(
  deps: AnchorDeps,
  input: { assetCode: string; companyId?: string },
): Promise<PassportsRetryAnchorOutput> {
  return deps.db.transaction(async (tx) => {
    const owned = input.companyId
      ? await loadOwnedPassport(tx, { companyId: input.companyId, assetCode: input.assetCode })
      : await tx.query.passports.findFirst({ where: { assetCode: input.assetCode } });
    if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
    const passport = await lockPassport(tx, owned.id);
    if (passport.status !== "approved") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Passport belum disetujui untuk dipublikasikan." });
    }
    const latest = await loadLatestChainRecord(tx, passport.id);
    if (!latest) throw new TRPCError({ code: "NOT_FOUND", message: "Passport ini belum pernah dicatat ke Solana." });
    if (latest.chainStatus !== "failed") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tidak ada pencatatan Solana yang gagal." });
    }
    if (latest.version !== 1 || latest.inspectionId !== passport.inspectionId
      || latest.chainCluster !== deps.chain.chainCluster || latest.txSignature) {
      reconciliationRequired();
    }
    const record = await pendingRecord(tx, latest);
    return { record };
  });
}

/** Rebuilds the approved snapshot; persists one signed candidate before network broadcast. */
export async function runAnchor(deps: AnchorJobDeps, recordId: string, lease: JobLease): Promise<void> {
  const snapshot = await deps.db.transaction(async (tx) => {
    await lease.assertCurrent(tx);
    const [job] = await tx.select().from(backendJobs).where(eq(backendJobs.id, lease.id)).limit(1);
    if (!job || job.kind !== "anchor" || job.targetId !== recordId) throw new AnchorError("Invalid anchor job lease.", false);
    const record = await tx.query.passportRecords.findFirst({ where: { id: recordId } });
    if (!record || record.chainStatus === "confirmed") return null;
    if (record.chainStatus !== "pending" || record.txSignature) throw new AnchorError("Invalid pending anchor state.", false);
    const passport = await tx.query.passports.findFirst({ where: { id: record.passportId } });
    if (!passport || passport.status !== "approved" || passport.inspectionId !== record.inspectionId
      || record.version !== 1 || record.chainCluster !== deps.chain.chainCluster) {
      throw new AnchorError("Approved passport snapshot no longer matches anchor.", false);
    }
    const hasSignature = job.preparedSignature !== null;
    const hasBlockhash = job.blockhash !== null;
    const hasHeight = job.lastValidBlockHeight !== null;
    if (hasSignature !== hasBlockhash || hasSignature !== hasHeight) {
      throw new AnchorError("Incomplete persisted anchor candidate.", false);
    }
    return { record, passport, job };
  });
  if (!snapshot) return;
  const { record, passport, job } = snapshot;
  const memo = await memoForRecord(deps.db, passport, record);
  let prepared: PreparedMemo;
  if (job.preparedSignature !== null && job.blockhash !== null && job.lastValidBlockHeight !== null) {
    if (!job.preparedSignature || !job.blockhash || job.lastValidBlockHeight < 0) {
      throw new AnchorError("Invalid persisted anchor candidate.", false);
    }
    prepared = {
      txSignature: job.preparedSignature,
      blockhash: job.blockhash,
      lastValidBlockHeight: job.lastValidBlockHeight,
      chainCluster: record.chainCluster!,
    };
  } else {
    prepared = await deps.chain.prepareMemo(memo);
    if (prepared.chainCluster !== record.chainCluster) throw new AnchorError("Prepared cluster differs from approved record.", false);
    await deps.db.transaction(async (tx) => {
      await lease.assertCurrent(tx);
      const currentPassport = await lockPassport(tx, passport.id);
      const current = await tx.query.passportRecords.findFirst({ where: { id: recordId } });
      if (!current || current.chainStatus !== "pending" || current.txSignature || currentPassport.status !== "approved"
        || current.inspectionId !== currentPassport.inspectionId
        || await memoForRecord(tx, currentPassport, current) !== memo) {
        throw new AnchorError("Approved snapshot changed before candidate persistence.", false);
      }
      const [saved] = await tx.update(backendJobs).set({
        preparedSignature: prepared.txSignature,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
        updatedAt: new Date(),
      }).where(and(eq(backendJobs.id, lease.id), isNull(backendJobs.preparedSignature),
        isNull(backendJobs.blockhash), isNull(backendJobs.lastValidBlockHeight))).returning();
      if (!saved) throw new AnchorError("Anchor candidate already exists; reconcile before retry.", false);
    });
  }
  const anchored = await deps.chain.broadcastPreparedMemo(memo, prepared);
  if (anchored.txSignature !== prepared.txSignature || anchored.chainCluster !== prepared.chainCluster) {
    throw new AnchorError("Confirmed signature differs from prepared candidate.", false);
  }
  await deps.db.transaction(async (tx) => {
    await lease.assertCurrent(tx);
    const current = await tx.query.passportRecords.findFirst({ where: { id: recordId } });
    const currentPassport = await lockPassport(tx, passport.id);
    const [candidate] = await tx.select().from(backendJobs).where(eq(backendJobs.id, lease.id)).limit(1);
    if (!current || current.chainStatus !== "pending" || current.txSignature || currentPassport.status !== "approved"
      || current.inspectionId !== currentPassport.inspectionId || current.id !== record.id
      || candidate?.preparedSignature !== prepared.txSignature || candidate.blockhash !== prepared.blockhash
      || candidate.lastValidBlockHeight !== prepared.lastValidBlockHeight
      || await memoForRecord(tx, currentPassport, current) !== memo) {
      throw new AnchorError("Confirmed anchor no longer matches approved snapshot.", false);
    }
    const [confirmed] = await tx.update(passportRecords).set({
      txSignature: anchored.txSignature,
      slot: anchored.slot,
      anchoredAt: new Date(),
      chainCluster: anchored.chainCluster,
      chainStatus: "confirmed",
      updatedAt: new Date(),
    }).where(and(eq(passportRecords.id, recordId), eq(passportRecords.chainStatus, "pending"),
      isNull(passportRecords.txSignature))).returning();
    if (!confirmed) throw new AnchorError("Anchor record changed during confirmation.", false);
    await transitionPassportStatus(tx, currentPassport.id, "published");
  });
  deps.logger.info("Passport tercatat di Solana.", {
    recordId, assetCode: passport.assetCode, version: record.version, txSignature: anchored.txSignature,
  });
}

/** Worker calls this inside its lease-guarded failure transaction; never changes passport approval. */
export async function markAnchorFailed(tx: DbHandle, recordId: string): Promise<void> {
  await tx.update(passportRecords).set({ chainStatus: "failed", updatedAt: new Date() })
    .where(and(eq(passportRecords.id, recordId), eq(passportRecords.chainStatus, "pending"),
      isNull(passportRecords.txSignature)));
}
