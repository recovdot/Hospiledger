import { index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { pgTable, timestamps } from "./_shared";
import { backendJobKind, backendJobStatus } from "./enums";

export type BackendJobKind = (typeof backendJobKind.enumValues)[number];
export type BackendJobStatus = (typeof backendJobStatus.enumValues)[number];

export const backendJobs = pgTable.withRLS(
  "backend_jobs",
  {
    id: uuid().defaultRandom().primaryKey(),
    kind: backendJobKind().notNull(),
    targetId: text().notNull(),
    status: backendJobStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    runAfter: timestamp({ withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text(),
    leaseUntil: timestamp({ withTimezone: true }),
    preparedSignature: text(),
    blockhash: text(),
    lastValidBlockHeight: integer(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("backend_jobs_kind_target_id_unique").on(table.kind, table.targetId),
    index("backend_jobs_claim_idx").on(table.status, table.runAfter, table.leaseUntil),
  ],
);
