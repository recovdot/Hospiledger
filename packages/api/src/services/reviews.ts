import { sellerReviews } from "@hospiledger/db";
import type { ReviewsSubmitInput, ReviewsSubmitOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";

import type { DbHandle } from "../db";
import { loadLatestChainRecord } from "./integrity";
import { loadOwnedPassport } from "./ownership";
import { toChainAnchor } from "./passports";
import { transitionPassportStatus } from "./passport-status";

/**
 * Records the seller's decision on a passport awaiting review. `accept` approves the passport and moves it to
 * `approved`; `edit` stores the corrections and leaves the passport in `pending_review` until the seller accepts.
 *
 * @param db database or transaction handle
 * @param input owning company, the reviewing profile, and the submitted decision with edits and notes
 * @returns the passport after the decision and the stored review
 * @throws {TRPCError} `NOT_FOUND` for a foreign passport, `BAD_REQUEST` when the passport is not awaiting review
 */
export async function submitReview(
  db: DbHandle,
  input: { companyId: string; reviewerId: string; review: ReviewsSubmitInput },
): Promise<ReviewsSubmitOutput> {
  const passport = await loadOwnedPassport(db, { companyId: input.companyId, assetCode: input.review.assetCode });
  if (passport.status !== "pending_review") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Passport belum siap ditinjau." });
  }

  const [review] = await db
    .insert(sellerReviews)
    .values({
      passportId: passport.id,
      reviewerId: input.reviewerId,
      decision: input.review.decision,
      edits: input.review.edits ?? null,
      notes: input.review.notes ?? null,
    })
    .returning();
  if (!review) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal menyimpan tinjauan." });
  }

  const updated =
    input.review.decision === "accept" ? await transitionPassportStatus(db, passport.id, "approved") : passport;
  const record = await loadLatestChainRecord(db, passport.id);
  return { passport: { ...updated, chain: toChainAnchor(record) }, review };
}
