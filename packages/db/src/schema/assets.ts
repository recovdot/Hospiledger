import { index, integer, text, uuid, varchar } from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { profiles } from "./profiles";
import { pgTable, timestamps } from "./_shared";

export const assets = pgTable.withRLS(
  "assets",
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdBy: uuid().references(() => profiles.id, { onDelete: "set null" }),
    category: varchar({ length: 100 }).notNull(),
    brand: varchar({ length: 100 }).notNull(),
    model: varchar({ length: 100 }).notNull(),
    serialNumber: varchar({ length: 100 }),
    year: integer(),
    capacity: varchar({ length: 100 }),
    location: varchar({ length: 200 }),
    previousUsage: text(),
    ...timestamps,
  },
  (table) => [index("assets_company_id_idx").on(table.companyId)],
);
