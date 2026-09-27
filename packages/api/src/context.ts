import type { Database } from "@hospiledger/db";
import type { UserRole } from "@hospiledger/shared";

import type { InspectionAi } from "./ai/types";
import type { ChainClient } from "./chain/types";
import type { ApiConfig } from "./config";
import type { JobRunner } from "./jobs/runner";
import type { Logger } from "./logger";
import type { SupabaseAdmin } from "./supabase";
import type { AssetPhotoStorage } from "./storage/asset-photos";

export type ContextUser = {
  id: string;
  email: string | null;
};

export type ContextProfile = {
  id: string;
  companyId: string | null;
  name: string;
  phone: string | null;
  role: UserRole;
};

/** Everything a procedure needs beyond the caller identity. Built once at server start. */
export type ApiDeps = {
  db: Database;
  supabase: SupabaseAdmin;
  storage: AssetPhotoStorage;
  ai: InspectionAi;
  chain: ChainClient;
  jobs: JobRunner;
  logger: Logger;
  config: ApiConfig;
};

export type Context = ApiDeps & {
  user: ContextUser | null;
  profile: ContextProfile | null;
  /** Rate limit key for public procedures; the caller IP when known. */
  clientKey: string;
};
