import {
  assetPhotoSchema,
  photosConfirmUploadInput,
  photosCreateUploadUrlInput,
  photosCreateUploadUrlOutput,
} from "@hospiledger/shared";

import { roleProcedure, router } from "../index";
import { confirmPhotoUpload, createPhotoUploadUrl } from "../services/photos";
import { requireCompanyId } from "./company";

export const photosRouter = router({
  createUploadUrl: roleProcedure("seller")
    .input(photosCreateUploadUrlInput)
    .output(photosCreateUploadUrlOutput)
    .mutation(({ ctx, input }) =>
      createPhotoUploadUrl(ctx.db, ctx.storage, { ...input, companyId: requireCompanyId(ctx.profile) }),
    ),

  confirmUpload: roleProcedure("seller")
    .input(photosConfirmUploadInput)
    .output(assetPhotoSchema)
    .mutation(({ ctx, input }) =>
      confirmPhotoUpload(ctx.db, ctx.storage, { ...input, companyId: requireCompanyId(ctx.profile) }),
    ),
});
