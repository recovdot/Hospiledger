import type { Database } from "@hospiledger/db";

/**
 * Any handle that can read and write: the pooled database or an open transaction.
 * The driver-only `$client` field is excluded so transactions satisfy it too.
 */
export type DbHandle = Omit<Database, "$client">;
