import {
  passportsGetInput,
  passportsGetOutput,
  passportsPublishInput,
  passportsPublishOutput,
  passportsRetryAnchorInput,
  passportsRetryAnchorOutput,
} from "@hospiledger/shared";

import { roleProcedure, router } from "../index";
import { loadPassportDetail } from "../services/passports";
import { publishPassport, retryPassportAnchor } from "../services/publish";
import { requireCompanyId } from "./company";

export const passportsRouter = router({
  get: roleProcedure("seller")
    .input(passportsGetInput)
    .output(passportsGetOutput)
    .query(({ ctx, input }) =>
      loadPassportDetail(ctx.db, ctx.storage, ctx.chain, {
        companyId: requireCompanyId(ctx.profile),
        assetCode: input.assetCode,
      }),
    ),

  publish: roleProcedure("seller")
    .input(passportsPublishInput)
    .output(passportsPublishOutput)
    .mutation(({ ctx, input }) =>
      publishPassport(
        { db: ctx.db, chain: ctx.chain, logger: ctx.logger, jobs: ctx.jobs },
        { companyId: requireCompanyId(ctx.profile), assetCode: input.assetCode },
      ),
    ),

  retryAnchor: roleProcedure("seller", "admin")
    .input(passportsRetryAnchorInput)
    .output(passportsRetryAnchorOutput)
    .mutation(({ ctx, input }) =>
      retryPassportAnchor(
        { db: ctx.db, chain: ctx.chain, logger: ctx.logger, jobs: ctx.jobs },
        {
          assetCode: input.assetCode,
          companyId: ctx.profile.role === "admin" ? undefined : requireCompanyId(ctx.profile),
        },
      ),
    ),
});
