import { index, uuid, varchar } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

import { companies } from "./companies";
import { userRole } from "./enums";
import { pgTable, timestamps } from "./_shared";

export const profiles = pgTable.withRLS(
  "profiles",
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    name: varchar({ length: 200 }).notNull(),
    phone: varchar({ length: 30 }),
    role: userRole().notNull(),
    ...timestamps,
  },
  (table) => [index("profiles_company_id_idx").on(table.companyId)],
);
