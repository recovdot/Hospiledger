import { index, integer, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

import { aiInspections } from "./ai-inspections";
import { chainStatus } from "./enums";
import { passports } from "./passports";
import { pgTable, timestamps } from "./_shared";

export const passportRecords = pgTable.withRLS(
  "passport_records",
  {
    id: uuid().defaultRandom().primaryKey(),
    passportId: uuid()
      .notNull()
      .references(() => passports.id, { onDelete: "cascade" }),
    inspectionId: uuid().references(() => aiInspections.id, { onDelete: "set null" }),
    version: integer().notNull(),
    chainStatus: chainStatus().notNull().default("pending"),
    chainCluster: varchar({ length: 20 }),
    txSignature: text(),
    slot: integer(),
    anchoredAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("passport_records_passport_id_idx").on(table.passportId),
    unique("passport_records_passport_version_unique").on(table.passportId, table.version),
  ],
);
