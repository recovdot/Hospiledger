import { inspectionsGetInput, inspectionsGetOutput, inspectionsStartInput, inspectionsStartOutput } from "@hospiledger/shared";

import { roleProcedure, router } from "../index";
import { loadInspection, startInspection } from "../services/inspections";
import { requireCompanyId } from "./company";

export const inspectionsRouter = router({
  start: roleProcedure("seller")
    .input(inspectionsStartInput)
    .output(inspectionsStartOutput)
    .mutation(({ ctx, input }) =>
      startInspection(
        { db: ctx.db, ai: ctx.ai, storage: ctx.storage, logger: ctx.logger },
        { companyId: requireCompanyId(ctx.profile), assetId: input.assetId },
      ),
    ),

  get: roleProcedure("seller")
    .input(inspectionsGetInput)
    .output(inspectionsGetOutput)
    .query(({ ctx, input }) =>
      loadInspection(ctx.db, { companyId: requireCompanyId(ctx.profile), assetId: input.assetId }),
    ),
});
