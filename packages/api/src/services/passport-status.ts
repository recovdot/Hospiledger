import { passports } from "@hospiledger/db";
import { IllegalPassportTransitionError, canTransition, type PassportStatus } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import type { DbHandle } from "../db";

export type PassportRow = typeof passports.$inferSelect;

/**
 * Moves a passport to a new status, rejecting illegal jumps and lost updates.
 *
 * @param db database or transaction handle
 * @param passportId passport to transition
 * @param to target status
 * @returns the updated passport row
 * @throws {TRPCError} `NOT_FOUND` when the passport is missing, `BAD_REQUEST` on an illegal transition,
 * `CONFLICT` when another writer changed the status first
 */
export async function transitionPassportStatus(db: DbHandle, passportId: string, to: PassportStatus): Promise<PassportRow> {
  const current = await db.query.passports.findFirst({
    where: { id: passportId },
    columns: { id: true, status: true },
  });
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Passport tidak ditemukan." });
  }
  if (!canTransition(current.status, to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: new IllegalPassportTransitionError(current.status, to).message,
    });
  }
  const [updated] = await db
    .update(passports)
    .set({ status: to, updatedAt: new Date(), ...(to === "published" ? { publishedAt: new Date() } : {}) })
    .where(and(eq(passports.id, passportId), eq(passports.status, current.status)))
    .returning();
  if (!updated) {
    throw new TRPCError({ code: "CONFLICT", message: "Status passport berubah. Muat ulang halaman." });
  }
  return updated;
}
