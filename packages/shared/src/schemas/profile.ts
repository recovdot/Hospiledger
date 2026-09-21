import { z } from "zod";

import { SELF_SELECTABLE_ROLES, USER_ROLES } from "../enums";
import { timestampSchema, uuidSchema } from "./primitives";

export const companySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const profileSchema = z.object({
  id: uuidSchema,
  companyId: uuidSchema.nullable(),
  name: z.string(),
  phone: z.string().nullable(),
  role: z.enum(USER_ROLES),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const profileCompleteInput = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  companyName: z.string().min(1).max(200),
  role: z.enum(SELF_SELECTABLE_ROLES),
});

export const profileCompleteOutput = z.object({
  profile: profileSchema,
  company: companySchema,
});

export const profileMeOutput = z.object({
  profile: profileSchema,
  company: companySchema.nullable(),
});

export type Company = z.infer<typeof companySchema>;
export type Profile = z.infer<typeof profileSchema>;
export type ProfileCompleteInput = z.infer<typeof profileCompleteInput>;
export type ProfileCompleteOutput = z.infer<typeof profileCompleteOutput>;
export type ProfileMeOutput = z.infer<typeof profileMeOutput>;
