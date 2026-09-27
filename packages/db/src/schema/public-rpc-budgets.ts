import { index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { pgTable, timestamps } from "./_shared";

export const publicRpcBudgets = pgTable.withRLS(
  "public_rpc_budgets",
  {
    id: uuid().defaultRandom().primaryKey(),
    clientKey: text().notNull(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("public_rpc_budgets_client_window_unique").on(table.clientKey, table.windowStart),
    index("public_rpc_budgets_window_start_idx").on(table.windowStart),
  ],
);
