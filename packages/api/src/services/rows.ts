import type { aiInspections, assetPhotos, assets, passportRecords, passports, sellerReviews } from "@hospiledger/db";

export type AssetRow = typeof assets.$inferSelect;
export type AssetPhotoRow = typeof assetPhotos.$inferSelect;
export type AiInspectionRow = typeof aiInspections.$inferSelect;
export type PassportRow = typeof passports.$inferSelect;
export type PassportRecordRow = typeof passportRecords.$inferSelect;
export type SellerReviewRow = typeof sellerReviews.$inferSelect;
