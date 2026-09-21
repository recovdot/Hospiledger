import { integer } from "drizzle-orm/pg-core";

import { pgTable, timestamps } from "./_shared";

export const assetCodeCounters = pgTable.withRLS("asset_code_counters", {
  year: integer().primaryKey(),
  lastValue: integer().notNull().default(0),
  ...timestamps,
});
