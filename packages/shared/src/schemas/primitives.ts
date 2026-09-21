import { z } from "zod";

export const uuidSchema = z.uuid();
export const timestampSchema = z.date();
export const hex64Schema = z.string().regex(/^[0-9a-f]{64}$/, "Hash harus 64 karakter heksadesimal huruf kecil.");
export const moneySchema = z.number().finite();
export const confidenceSchema = z.number().min(0).max(1);
