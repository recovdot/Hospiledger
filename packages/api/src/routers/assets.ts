import { assetsCreateInput, assetsCreateOutput, assetsGetInput, assetsGetOutput, assetsListInput, assetsListOutput } from "@hospiledger/shared";

import { roleProcedure, router } from "../index";
import { createAsset, listAssets, loadAssetDetail } from "../services/assets";
import { requireCompanyId } from "./company";

export const assetsRouter = router({
  create: roleProcedure("seller")
    .input(assetsCreateInput)
    .output(assetsCreateOutput)
    .mutation(({ ctx, input }) =>
      createAsset(ctx.db, { companyId: requireCompanyId(ctx.profile), createdBy: ctx.profile.id, fields: input }),
    ),

  get: roleProcedure("seller")
    .input(assetsGetInput)
    .output(assetsGetOutput)
    .query(({ ctx, input }) =>
      loadAssetDetail(ctx.db, ctx.storage, {
        companyId: requireCompanyId(ctx.profile),
        assetId: input.assetId,
      }),
    ),

  list: roleProcedure("seller")
    .input(assetsListInput)
    .output(assetsListOutput)
    .query(({ ctx, input }) =>
      listAssets(ctx.db, { companyId: requireCompanyId(ctx.profile), limit: input.limit, offset: input.offset }),
    ),
});
