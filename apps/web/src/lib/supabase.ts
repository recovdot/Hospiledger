import { createClient } from "@supabase/supabase-js";

import { ENV } from "../env";

/** Browser Supabase client. Auth session only: never used for database or storage access. */
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
