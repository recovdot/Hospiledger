import { index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { reviewDecision } from "./enums";
import { passports } from "./passports";
import { profiles } from "./profiles";
import { pgTable, timestamps } from "./_shared";

export const sellerReviews = pgTable.withRLS(
  "seller_reviews",
  {
    id: uuid().defaultRandom().primaryKey(),
    passportId: uuid()
      .notNull()
      .references(() => passports.id, { onDelete: "cascade" }),
    reviewerId: uuid().references(() => profiles.id, { onDelete: "set null" }),
    decision: reviewDecision().notNull(),
    edits: jsonb().$type<Record<string, unknown>>(),
    notes: text(),
    reviewedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [index("seller_reviews_passport_id_idx").on(table.passportId)],
);
