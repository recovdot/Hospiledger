import { index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { assets } from "./assets";
import { pgTable, timestamps } from "./_shared";
import { photoType } from "./enums";

export const photoUploadReservations = pgTable.withRLS(
  "photo_upload_reservations",
  {
    id: uuid().defaultRandom().primaryKey(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    type: photoType().notNull(),
    mimeType: text().notNull(),
    storagePath: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("photo_upload_reservations_asset_id_idx").on(table.assetId),
    index("photo_upload_reservations_expiry_idx").on(table.expiresAt),
    uniqueIndex("photo_upload_reservations_storage_path_unique").on(table.storagePath),
  ],
);
