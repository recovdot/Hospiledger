import { publicProcedure, router } from "../index";
import { assetsRouter } from "./assets";
import { inspectionsRouter } from "./inspections";
import { passportsRouter } from "./passports";
import { photosRouter } from "./photos";
import { profileRouter } from "./profile";
import { publicPassportsRouter } from "./public-passports";
import { reviewsRouter } from "./reviews";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  profile: profileRouter,
  assets: assetsRouter,
  photos: photosRouter,
  inspections: inspectionsRouter,
  passports: passportsRouter,
  reviews: reviewsRouter,
  publicPassports: publicPassportsRouter,
});
export type AppRouter = typeof appRouter;
