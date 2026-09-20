import type { Context as ApiContext } from "@hospiledger/api/context";
import type { Context as ElysiaContext } from "elysia";

import { db } from "./services";

export type CreateContextOptions = {
  context: ElysiaContext;
};

export async function createContext(_options: CreateContextOptions): Promise<ApiContext> {
  return {
    db,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
