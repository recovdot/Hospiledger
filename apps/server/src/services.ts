import { createDb } from "@hospiledger/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
