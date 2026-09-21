import { companies, profiles } from "@hospiledger/db";
import { type ProfileCompleteInput, type ProfileCompleteOutput, type ProfileMeOutput } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";

import type { DbHandle } from "../db";

/**
 * Creates the company and the profile row for a newly signed-up user in one transaction.
 *
 * @param db database or transaction handle
 * @param input the caller's Supabase user id plus the submitted profile fields
 * @returns the created profile and company
 * @throws {TRPCError} `CONFLICT` when the caller already has a profile
 */
export async function completeProfile(
  db: DbHandle,
  input: ProfileCompleteInput & { userId: string },
): Promise<ProfileCompleteOutput> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.profiles.findFirst({ where: { id: input.userId }, columns: { id: true } });
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Profil sudah lengkap." });
    }
    const [company] = await tx.insert(companies).values({ name: input.companyName }).returning();
    if (!company) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal membuat perusahaan." });
    }
    const [profile] = await tx
      .insert(profiles)
      .values({ id: input.userId, companyId: company.id, name: input.name, phone: input.phone, role: input.role })
      .returning();
    if (!profile) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal membuat profil." });
    }
    return { profile, company };
  });
}

/**
 * Loads the caller's profile with its company.
 *
 * @param db database or transaction handle
 * @param profileId profile id, equal to the Supabase user id
 * @returns the profile and its company
 * @throws {TRPCError} `NOT_FOUND` when the profile row is missing
 */
export async function loadProfileMe(db: DbHandle, profileId: string): Promise<ProfileMeOutput> {
  const profile = await db.query.profiles.findFirst({
    where: { id: profileId },
    with: { company: true },
  });
  if (!profile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Profil tidak ditemukan." });
  }
  return { profile, company: profile.company ?? null };
}
