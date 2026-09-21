import { pgTableCreator, timestamp } from "drizzle-orm/pg-core";

/** snake_case column names so TypeScript camelCase maps onto PostgreSQL snake_case. */
export const pgTable = pgTableCreator((name) => name, "snake_case");

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
};
