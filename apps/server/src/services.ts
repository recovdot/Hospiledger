import { createInspectionAi } from "@hospiledger/api/ai/inspection";
import { createChainClient } from "@hospiledger/api/chain/client";
import type { ApiDeps } from "@hospiledger/api/context";
import { markAnchorFailed, runAnchor } from "@hospiledger/api/services/publish";
import { markInspectionFailed, runInspection } from "@hospiledger/api/services/inspections";
import { runDeletePhoto } from "@hospiledger/api/services/photos";
import { createJobRunner } from "@hospiledger/api/jobs/runner";
import { createAssetPhotoStorage } from "@hospiledger/api/storage/asset-photos";
import { createSupabaseAdmin } from "@hospiledger/api/supabase";
import { createDb } from "@hospiledger/db";
import { MAX_PHOTO_BYTES } from "@hospiledger/shared";

import { ENV } from "./env.server";
import { createLogger } from "./lib/logger";

const logger = createLogger();

export const db = createDb(ENV);

export const supabase = createSupabaseAdmin(ENV);

/** Composed service dependencies: one instance per server process, shared by every request. */
const storage = createAssetPhotoStorage(supabase.storage, logger, MAX_PHOTO_BYTES);
const ai = createInspectionAi(ENV, logger);
const chain = createChainClient(ENV, logger);
const jobs = createJobRunner(db, logger, {
  inspection: {
    run: (targetId, lease) => runInspection({ db, ai, storage, logger }, targetId, lease),
    onExhausted: (targetId, _lease, tx, category) => markInspectionFailed(tx, targetId, category),
  },
  anchor: {
    run: (targetId, lease) => runAnchor({ db, chain, logger }, targetId, lease),
    onExhausted: (targetId, _lease, tx) => markAnchorFailed(tx, targetId),
  },
  delete_photo: {
    run: (targetId, lease) => runDeletePhoto({ db, storage, logger }, targetId, lease),
  },
});

export const deps: ApiDeps = {
  db,
  supabase,
  logger,
  config: ENV,
  storage,
  ai,
  chain,
  jobs,
};
