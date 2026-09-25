import { createClient } from "@supabase/supabase-js";

import { ENV } from "../env";

/**
 * Browser Supabase client. Used for the auth session, and for uploading a photo to the short-lived
 * signed URL the server returns from `photos.createUploadUrl` (the documented upload flow in
 * AGENTS.md) — never for direct database or storage reads/writes.
 */
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
