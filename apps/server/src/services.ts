import { createInspectionAi } from "@hospiledger/api/ai/inspection";
import { createChainClient } from "@hospiledger/api/chain/client";
import type { ApiDeps } from "@hospiledger/api/context";
import { createJobRunner } from "@hospiledger/api/jobs/runner";
import { createRateLimiter } from "@hospiledger/api/lib/rate-limit";
import { createAssetPhotoStorage } from "@hospiledger/api/storage/asset-photos";
import { createSupabaseAdmin } from "@hospiledger/api/supabase";
import { createDb } from "@hospiledger/db";
import { MAX_PHOTO_BYTES, PUBLIC_VERIFY_RATE_LIMIT, PUBLIC_VERIFY_RATE_WINDOW_MS } from "@hospiledger/shared";

import { ENV } from "./env.server";
import { createLogger } from "./lib/logger";

const logger = createLogger();

export const db = createDb(ENV);

export const supabase = createSupabaseAdmin(ENV);

/** Composed service dependencies: one instance per server process, shared by every request. */
export const deps: ApiDeps = {
  db,
  supabase,
  logger,
  config: ENV,
  storage: createAssetPhotoStorage(supabase.storage, logger, MAX_PHOTO_BYTES),
  ai: createInspectionAi(ENV, logger),
  chain: createChainClient(ENV, logger),
  jobs: createJobRunner(logger),
  verifyRateLimiter: createRateLimiter(PUBLIC_VERIFY_RATE_LIMIT, PUBLIC_VERIFY_RATE_WINDOW_MS),
};
