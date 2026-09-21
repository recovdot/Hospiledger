import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ApiConfig } from "./config";

/** Service-role Supabase client: bypasses RLS, server-only. */
export type SupabaseAdmin = SupabaseClient;

/**
 * Creates a service-role Supabase client. Server-only: never expose the service-role key to a browser.
 *
 * @param config values holding the Supabase project URL and service-role key
 * @returns a Supabase client that bypasses RLS
 */
export function createSupabaseAdmin(config: ApiConfig): SupabaseAdmin {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
