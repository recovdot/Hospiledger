import {
  publicPassportsGetByCodeInput,
  publicPassportsGetByCodeOutput,
  publicPassportsListInput,
  publicPassportsListOutput,
  publicPassportsVerifyInput,
  publicPassportsVerifyOutput,
} from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";

import type { Context } from "../context";
import { publicProcedure, router } from "../index";
import { chargePublicRpcBudget } from "../services/public-rpc-budget";
import { getPublicPassport, listPublicPassports, verifyPublicPassport } from "../services/public-passports";

async function requireVerificationBudget(ctx: Context): Promise<void> {
  if (await chargePublicRpcBudget(ctx.db, ctx.clientKey)) return;
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: "Terlalu banyak permintaan verifikasi. Coba lagi sebentar lagi.",
  });
}
export const publicPassportsRouter = router({
  getByCode: publicProcedure
    .input(publicPassportsGetByCodeInput)
    .output(publicPassportsGetByCodeOutput)
    .query(async ({ ctx, input }) => {
      await requireVerificationBudget(ctx);
      return getPublicPassport(ctx.db, ctx.storage, ctx.chain, input);
    }),

  list: publicProcedure
    .input(publicPassportsListInput)
    .output(publicPassportsListOutput)
    .query(({ ctx, input }) => listPublicPassports(ctx.db, ctx.storage, input)),

  verify: publicProcedure
    .input(publicPassportsVerifyInput)
    .output(publicPassportsVerifyOutput)
    .query(async ({ ctx, input }) => {
      await requireVerificationBudget(ctx);
      return verifyPublicPassport(ctx.db, ctx.storage, ctx.chain, input);
    }),
});
