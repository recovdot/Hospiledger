import { profileCompleteInput, profileCompleteOutput, profileMeOutput } from "@hospiledger/shared";

import { authedProcedure, protectedProcedure, router } from "../index";
import { completeProfile, loadProfileMe } from "../services/profiles";

export const profileRouter = router({
  complete: authedProcedure
    .input(profileCompleteInput)
    .output(profileCompleteOutput)
    .mutation(({ ctx, input }) => completeProfile(ctx.db, { ...input, userId: ctx.user.id })),

  me: protectedProcedure.output(profileMeOutput).query(({ ctx }) => loadProfileMe(ctx.db, ctx.profile.id)),
});
