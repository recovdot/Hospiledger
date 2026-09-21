import { z } from "zod";

import { PHOTO_CONTENT_TYPES, PHOTO_TYPES } from "../enums";
import { MAX_PHOTO_BYTES } from "../limits";
import { hex64Schema, timestampSchema, uuidSchema } from "./primitives";

export const assetPhotoSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  type: z.enum(PHOTO_TYPES),
  storagePath: z.string(),
  fileSha256: hex64Schema,
  qualityOk: z.boolean(),
  qualityReason: z.string().nullable(),
  createdAt: timestampSchema,
});

export const assetPhotoWithUrlSchema = assetPhotoSchema.extend({
  signedUrl: z.string(),
});

export const photosCreateUploadUrlInput = z.object({
  assetId: uuidSchema,
  type: z.enum(PHOTO_TYPES),
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  fileSize: z.int().min(1).max(MAX_PHOTO_BYTES),
});

export const photosCreateUploadUrlOutput = z.object({
  storagePath: z.string(),
  signedUrl: z.string(),
  token: z.string(),
});

export const photosConfirmUploadInput = z.object({
  assetId: uuidSchema,
  type: z.enum(PHOTO_TYPES),
  storagePath: z.string().min(1),
});

export type AssetPhoto = z.infer<typeof assetPhotoSchema>;
export type AssetPhotoWithUrl = z.infer<typeof assetPhotoWithUrlSchema>;
export type PhotosCreateUploadUrlInput = z.infer<typeof photosCreateUploadUrlInput>;
export type PhotosCreateUploadUrlOutput = z.infer<typeof photosCreateUploadUrlOutput>;
export type PhotosConfirmUploadInput = z.infer<typeof photosConfirmUploadInput>;
