import { passportRecords, type Database } from "@hospiledger/db";
import {
  ANCHOR_BACKOFF_BASE_MS,
  ANCHOR_RETRY_LIMIT,
  LOW_SIGNER_BALANCE_LAMPORTS,
  buildMemo,
} from "@hospiledger/shared";
import type { PassportsPublishOutput, PassportsRetryAnchorOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import type { ChainClient } from "../chain/types";
import type { DbHandle } from "../db";
import type { JobRunner } from "../jobs/runner";
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

export type AnchorDeps = AnchorJobDeps & { jobs: JobRunner };

async function resetRecordToPending(db: DbHandle, recordId: string): Promise<PassportRecordRow> {
  const [reset] = await db
    .update(passportRecords)
    .set({ chainStatus: "pending", updatedAt: new Date() })
    .where(and(eq(passportRecords.id, recordId), isNull(passportRecords.txSignature)))
    .returning();
  if (!reset) {
    throw new TRPCError({ code: "CONFLICT", message: "Pencatatan Solana sudah tercatat. Muat ulang halaman." });
  }
  return reset;
}

function scheduleAnchor(deps: AnchorDeps, recordId: string): void {
  deps.jobs.enqueue(`anchor:${recordId}`, () => runAnchor(deps, recordId), {
    attempts: ANCHOR_RETRY_LIMIT,
    backoffMs: ANCHOR_BACKOFF_BASE_MS,
    onExhausted: () => markAnchorFailed(deps.db, recordId),
  });
}

/**
 * Publishes an approved passport: writes its append-only chain record and schedules the Solana memo anchor.
 * The passport stays `approved` until the anchor job confirms the transaction.
 *
 * @param deps database, chain client, logger, and job runner
 * @param input owning company and the passport Asset ID
 * @returns the still-approved passport with its pending chain record
 * @throws {TRPCError} `NOT_FOUND` for a foreign passport, `BAD_REQUEST` when the passport is not `approved`
 */
export async function publishPassport(
  deps: AnchorDeps,
  input: { companyId: string; assetCode: string },
): Promise<PassportsPublishOutput> {
  const passport = await loadOwnedPassport(deps.db, input);
  if (passport.status !== "approved") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Passport belum disetujui untuk dipublikasikan." });
  }

  const latest = await loadLatestChainRecord(deps.db, passport.id);
  let record: PassportRecordRow;
  if (latest && !latest.txSignature && latest.chainStatus === "pending") {
    record = latest;
  } else if (latest && !latest.txSignature && latest.chainStatus === "failed") {
    record = await resetRecordToPending(deps.db, latest.id);
  } else {
    const [created] = await deps.db
      .insert(passportRecords)
      .values({
        passportId: passport.id,
        inspectionId: passport.inspectionId,
        version: (latest?.version ?? 0) + 1,
        chainStatus: "pending",
        chainCluster: deps.chain.chainCluster,
      })
      .returning();
    if (!created) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal membuat catatan passport." });
    }
    record = created;
  }

  scheduleAnchor(deps, record.id);
  return { passport: { ...passport, chain: toChainAnchor(record) }, record };
}

/**
 * Retries a failed anchor for the same version. A seller may only retry their own passport; an admin may retry any.
 *
 * @param deps database, chain client, logger, and job runner
 * @param input the passport Asset ID and, for sellers, the owning company
 * @returns the reset pending record
 * @throws {TRPCError} `NOT_FOUND` when the passport or a record is missing, `BAD_REQUEST` when there is nothing to retry
 */
export async function retryPassportAnchor(
  deps: AnchorDeps,
  input: { assetCode: string; companyId?: string },
): Promise<PassportsRetryAnchorOutput> {
  const passport = input.companyId
    ? await loadOwnedPassport(deps.db, { companyId: input.companyId, assetCode: input.assetCode })
    : await deps.db.query.passports.findFirst({ where: { assetCode: input.assetCode } });
  if (!passport) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  const latest = await loadLatestChainRecord(deps.db, passport.id);
  if (!latest) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport ini belum pernah dicatat ke Solana." });
  }
  if (latest.txSignature) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Pencatatan Solana sudah berhasil." });
  }
  if (latest.chainStatus !== "failed") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tidak ada pencatatan Solana yang gagal." });
  }

  const record = await resetRecordToPending(deps.db, latest.id);
  scheduleAnchor(deps, record.id);
  return { record };
}

/**
 * Anchors one chain record: rebuilds the content hash, sends the memo transaction, and publishes the passport
 * on confirmation. Idempotent: a record that already has a signature is left untouched.
 *
 * @param deps database, chain client, and logger
 * @param recordId chain record to anchor
 * @throws {TRPCError} `NOT_FOUND` when the passport behind the record is missing
 */
export async function runAnchor(deps: AnchorJobDeps, recordId: string): Promise<void> {
  const record = await deps.db.query.passportRecords.findFirst({ where: { id: recordId } });
  if (!record || record.txSignature || record.chainStatus !== "pending") return;

  const passport = await deps.db.query.passports.findFirst({ where: { id: record.passportId } });
  if (!passport) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport untuk pencatatan Solana tidak ditemukan." });
  }

  const contentHash = await computeContentHash(deps.db, passport.id, record.version);
  const memo = buildMemo({ assetCode: passport.assetCode, version: record.version, contentHash });
  const lamports = await deps.chain.getSignerLamports();
  if (lamports < LOW_SIGNER_BALANCE_LAMPORTS) {
    deps.logger.warn("Saldo signer Solana rendah.", { lamports, signer: deps.chain.getSignerAddress() });
  }

  const anchored = await deps.chain.anchorMemo(memo);
  const [updated] = await deps.db
    .update(passportRecords)
    .set({
      txSignature: anchored.txSignature,
      slot: anchored.slot,
      anchoredAt: new Date(),
      chainCluster: anchored.chainCluster,
      chainStatus: "confirmed",
      updatedAt: new Date(),
    })
    .where(and(eq(passportRecords.id, recordId), isNull(passportRecords.txSignature)))
    .returning();
  if (!updated) {
    deps.logger.info("Pencatatan Solana sudah tercatat sebelumnya.", { recordId });
    return;
  }

  if (passport.status === "approved") {
    await transitionPassportStatus(deps.db, passport.id, "published");
  }
  deps.logger.info("Passport tercatat di Solana.", {
    recordId,
    assetCode: passport.assetCode,
    version: record.version,
    txSignature: anchored.txSignature,
  });
}

/**
 * Marks a chain record failed after every anchor attempt was exhausted. The passport stays `approved`.
 *
 * @param db database handle
 * @param recordId chain record to mark
 */
export async function markAnchorFailed(db: DbHandle, recordId: string): Promise<void> {
  await db
    .update(passportRecords)
    .set({ chainStatus: "failed", updatedAt: new Date() })
    .where(and(eq(passportRecords.id, recordId), isNull(passportRecords.txSignature)));
}
