import { TRPCError } from "@trpc/server";

import type { ContextProfile } from "../context";

/**
 * Resolves the caller's company, which scopes every seller query.
 *
 * @param profile verified profile of the caller
 * @returns the profile's company id
 * @throws {TRPCError} `FORBIDDEN` when the profile is not attached to a company
 */
export function requireCompanyId(profile: ContextProfile): string {
  if (!profile.companyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Akun belum terhubung ke perusahaan." });
  }
  return profile.companyId;
}
