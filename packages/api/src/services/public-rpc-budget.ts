import { publicRpcBudgets } from "@hospiledger/db";
import { PUBLIC_VERIFY_RATE_LIMIT, PUBLIC_VERIFY_RATE_WINDOW_MS } from "@hospiledger/shared";
import { lt, sql } from "drizzle-orm";

import type { DbHandle } from "../db";

/** Atomically charges a fixed-window budget shared by every server and public RPC-bearing endpoint. */
export async function chargePublicRpcBudget(db: DbHandle, clientKey: string, now = new Date()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / PUBLIC_VERIFY_RATE_WINDOW_MS) * PUBLIC_VERIFY_RATE_WINDOW_MS);
  const [charged] = await db.insert(publicRpcBudgets).values({
    clientKey: clientKey || "unknown",
    windowStart,
    count: 1,
  }).onConflictDoUpdate({
    target: [publicRpcBudgets.clientKey, publicRpcBudgets.windowStart],
    set: { count: sql`${publicRpcBudgets.count} + 1`, updatedAt: now },
    setWhere: lt(publicRpcBudgets.count, PUBLIC_VERIFY_RATE_LIMIT),
  }).returning({ id: publicRpcBudgets.id });
  return charged !== undefined;
}

/** Drops budget rows from windows that are no longer live. */
export async function cleanupPublicRpcBudgets(db: DbHandle, now = new Date()): Promise<void> {
  const liveWindowStart = new Date(Math.floor(now.getTime() / PUBLIC_VERIFY_RATE_WINDOW_MS) * PUBLIC_VERIFY_RATE_WINDOW_MS);
  await db.delete(publicRpcBudgets).where(lt(publicRpcBudgets.windowStart, liveWindowStart));
}
