import { index, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

import { aiInspections } from "./ai-inspections";
import { assets } from "./assets";
import { passportStatus } from "./enums";
import { pgTable, timestamps } from "./_shared";

export const passports = pgTable.withRLS(
  "passports",
  {
    id: uuid().defaultRandom().primaryKey(),
    assetCode: varchar({ length: 30 }).notNull(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    inspectionId: uuid().references(() => aiInspections.id, { onDelete: "set null" }),
    status: passportStatus().notNull().default("draft"),
    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("passports_asset_id_idx").on(table.assetId),
    unique("passports_asset_code_unique").on(table.assetCode),
  ],
);
