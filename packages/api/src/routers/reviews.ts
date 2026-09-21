import { reviewsSubmitInput, reviewsSubmitOutput } from "@hospiledger/shared";

import { roleProcedure, router } from "../index";
import { submitReview } from "../services/reviews";
import { requireCompanyId } from "./company";

export const reviewsRouter = router({
  submit: roleProcedure("seller")
    .input(reviewsSubmitInput)
    .output(reviewsSubmitOutput)
    .mutation(({ ctx, input }) =>
      submitReview(ctx.db, {
        companyId: requireCompanyId(ctx.profile),
        reviewerId: ctx.profile.id,
        review: input,
      }),
    ),
});
