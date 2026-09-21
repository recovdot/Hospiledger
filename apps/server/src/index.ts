import { cors } from "@elysiajs/cors";
import { appRouter } from "@hospiledger/api/routers/index";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Elysia } from "elysia";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { deps } from "./services";

new Elysia()
  .use(
    cors({
      origin: ENV.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
    }),
  )
  .all("/trpc/*", async (context) => {
    const res = await fetchRequestHandler({
      endpoint: "/trpc",
      router: appRouter,
      req: context.request,
      createContext: () => createContext({ context }),
    });
    return res;
  })
  .get("/", () => "OK")
  .listen(3000, () => {
    deps.logger.info("Server berjalan di http://localhost:3000");
    void deps.storage.ensureBucket().catch((error: unknown) => {
      deps.logger.error("Gagal menyiapkan bucket penyimpanan foto.", {
        reason: error instanceof Error ? error.message : String(error),
      });
    });
    void deps.chain
      .getSignerLamports()
      .then((lamports) => {
        deps.logger.info("Signer Solana siap.", { signer: deps.chain.getSignerAddress(), lamports });
      })
      .catch((error: unknown) => {
        deps.logger.warn("Gagal membaca saldo signer Solana.", {
          reason: error instanceof Error ? error.message : String(error),
        });
      });
  });
