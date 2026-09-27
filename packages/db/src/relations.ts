import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

/** Required relations (`optional: false`) mirror the NOT NULL foreign keys; nullable foreign keys stay optional. */
export const relations = defineRelations(schema, (r) => ({
  companies: {
    profiles: r.many.profiles(),
    assets: r.many.assets(),
  },
  profiles: {
    company: r.one.companies({ from: r.profiles.companyId, to: r.companies.id }),
    createdAssets: r.many.assets({ from: r.profiles.id, to: r.assets.createdBy }),
  },
  assets: {
    company: r.one.companies({ from: r.assets.companyId, to: r.companies.id, optional: false }),
    creator: r.one.profiles({ from: r.assets.createdBy, to: r.profiles.id }),
    photos: r.many.assetPhotos(),
    inspections: r.many.aiInspections(),
    passports: r.many.passports(),
    photoUploadReservations: r.many.photoUploadReservations(),
  },
  assetPhotos: {
    asset: r.one.assets({ from: r.assetPhotos.assetId, to: r.assets.id, optional: false }),
  },
  photoUploadReservations: {
    asset: r.one.assets({
      from: r.photoUploadReservations.assetId,
      to: r.assets.id,
      optional: false,
    }),
  },
  aiInspections: {
    asset: r.one.assets({ from: r.aiInspections.assetId, to: r.assets.id, optional: false }),
  },
  passports: {
    asset: r.one.assets({ from: r.passports.assetId, to: r.assets.id, optional: false }),
    inspection: r.one.aiInspections({ from: r.passports.inspectionId, to: r.aiInspections.id }),
    records: r.many.passportRecords(),
    reviews: r.many.sellerReviews(),
  },
  passportRecords: {
    passport: r.one.passports({ from: r.passportRecords.passportId, to: r.passports.id, optional: false }),
    inspection: r.one.aiInspections({ from: r.passportRecords.inspectionId, to: r.aiInspections.id }),
  },
  sellerReviews: {
    passport: r.one.passports({ from: r.sellerReviews.passportId, to: r.passports.id, optional: false }),
    reviewer: r.one.profiles({ from: r.sellerReviews.reviewerId, to: r.profiles.id }),
  },
}));
