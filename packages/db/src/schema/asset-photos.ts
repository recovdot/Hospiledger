import { boolean, char, index, text, uuid } from "drizzle-orm/pg-core";

import { assets } from "./assets";
import { photoType } from "./enums";
import { pgTable, timestamps } from "./_shared";

export const assetPhotos = pgTable.withRLS(
  "asset_photos",
  {
    id: uuid().defaultRandom().primaryKey(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    type: photoType().notNull(),
    storagePath: text().notNull(),
    fileSha256: char({ length: 64 }).notNull(),
    qualityOk: boolean().notNull().default(false),
    qualityReason: text(),
    ...timestamps,
  },
  (table) => [index("asset_photos_asset_id_idx").on(table.assetId)],
);
