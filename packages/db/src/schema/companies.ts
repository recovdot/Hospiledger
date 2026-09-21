import { uuid, varchar } from "drizzle-orm/pg-core";

import { pgTable, timestamps } from "./_shared";

export const companies = pgTable.withRLS("companies", {
  id: uuid().defaultRandom().primaryKey(),
  name: varchar({ length: 200 }).notNull(),
  ...timestamps,
});
