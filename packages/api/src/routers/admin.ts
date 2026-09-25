import { adminFailedAnchorsOutput } from "@hospiledger/shared";

import { roleProcedure, router } from "../index";
import { listFailedAnchorPassports } from "../services/admin";

export const adminRouter = router({
  failedAnchors: roleProcedure("admin")
    .output(adminFailedAnchorsOutput)
    .query(({ ctx }) => listFailedAnchorPassports(ctx.db)),
});
