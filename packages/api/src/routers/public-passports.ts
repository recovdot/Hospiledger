import {
  publicPassportsGetByCodeInput,
  publicPassportsGetByCodeOutput,
  publicPassportsVerifyInput,
  publicPassportsVerifyOutput,
} from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";

import { publicProcedure, router } from "../index";
import { getPublicPassport, verifyPublicPassport } from "../services/public-passports";

export const publicPassportsRouter = router({
  getByCode: publicProcedure
    .input(publicPassportsGetByCodeInput)
    .output(publicPassportsGetByCodeOutput)
    .query(({ ctx, input }) => getPublicPassport(ctx.db, ctx.storage, ctx.chain, input)),

  verify: publicProcedure
    .input(publicPassportsVerifyInput)
    .output(publicPassportsVerifyOutput)
    .query(({ ctx, input }) => {
      if (!ctx.verifyRateLimiter.allow(ctx.clientKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Terlalu banyak permintaan verifikasi. Coba lagi sebentar lagi.",
        });
      }
      return verifyPublicPassport(ctx.db, ctx.chain, input);
    }),
});
