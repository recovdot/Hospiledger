import type { Context as ApiContext } from "@hospiledger/api/context";
import type { Context as ElysiaContext } from "elysia";

import { db, supabase, deps } from "./services";

export type CreateContextOptions = {
  context: ElysiaContext;
};

function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function readClientKey(context: ElysiaContext): string {
  return context.server?.requestIP(context.request)?.address ?? "unknown";
}

/**
 * Builds the tRPC context. A missing or invalid token yields `user: null` so public procedures still work;
 * protected procedures fail closed.
 *
 * @param options Elysia request context
 * @returns the tRPC context for the request
 */
export async function createContext(options: CreateContextOptions): Promise<ApiContext> {
  const anonymous: ApiContext = { ...deps, user: null, profile: null, clientKey: readClientKey(options.context) };
  const token = readBearerToken(options.context.request.headers.get("authorization"));
  if (!token) return anonymous;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return anonymous;

  const profile = await db.query.profiles.findFirst({
    where: { id: data.user.id },
    columns: { id: true, companyId: true, name: true, phone: true, role: true },
  });

  return {
    ...anonymous,
    user: { id: data.user.id, email: data.user.email ?? null },
    profile: profile ?? null,
  };
}

export type Context = ApiContext;
