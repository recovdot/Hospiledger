import type { UserRole } from "@hospiledger/shared";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;

export const publicProcedure = t.procedure;

/** Requires a verified Supabase session, with or without a completed profile. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi tidak valid. Silakan masuk kembali." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Requires a verified session and a `profiles` row. */
export const protectedProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!ctx.profile) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Profil belum lengkap." });
  }
  return next({ ctx: { ...ctx, profile: ctx.profile } });
});

/**
 * Builds a procedure restricted to the given roles, read from `profiles.role`.
 *
 * @param roles roles allowed to call the procedure
 * @returns a procedure builder that rejects other roles with `FORBIDDEN`
 */
export function roleProcedure(...roles: UserRole[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.profile.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Akses ditolak untuk peran ini." });
    }
    return next();
  });
}
