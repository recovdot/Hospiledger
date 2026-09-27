import { sellerReviews } from "@hospiledger/db";
import { reviewsSubmitInput, type ReviewsSubmitInput, type ReviewsSubmitOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";

import type { DbHandle } from "../db";
import { loadLatestChainRecord } from "./integrity";
import { loadOwnedPassport } from "./ownership";
import { toChainAnchor } from "./passports";
import { lockPhotoPassport } from "./photos";
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
  const reviewInput = reviewsSubmitInput.parse(input.review);
  return db.transaction(async (tx) => {
    const owned = await loadOwnedPassport(tx, { companyId: input.companyId, assetCode: reviewInput.assetCode });
    const passport = await lockPhotoPassport(tx, owned.assetId);
    if (passport.id !== owned.id || passport.status !== "pending_review") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Passport belum siap ditinjau." });
    }

    const [review] = await tx
      .insert(sellerReviews)
      .values({
        passportId: passport.id,
        reviewerId: input.reviewerId,
        decision: reviewInput.decision,
        edits: reviewInput.decision === "edit" ? reviewInput.edits ?? null : null,
        notes: reviewInput.decision === "edit" ? reviewInput.notes ?? null : null,
      })
      .returning();
    if (!review) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal menyimpan tinjauan." });
    }

    const updated =
      reviewInput.decision === "accept" ? await transitionPassportStatus(tx, passport.id, "approved") : passport;
    const record = await loadLatestChainRecord(tx, passport.id);
    return { passport: { ...updated, chain: toChainAnchor(record) }, review };
  });
}
