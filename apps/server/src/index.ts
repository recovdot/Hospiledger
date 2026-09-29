import { cors } from "@elysiajs/cors";
import { appRouter } from "@hospiledger/api/routers/index";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Elysia } from "elysia";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { deps } from "./services";
import { retryFailedPhotoDeletions, sweepExpiredPhotoReservations } from "@hospiledger/api/services/photos";
import { cleanupPublicRpcBudgets } from "@hospiledger/api/services/public-rpc-budget";

async function startServer(): Promise<void> {
  // Do not accept signed-upload requests until the private bucket is usable.
  await deps.storage.ensureBucket();

  const app = new Elysia()
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
    .get("/", () => "OK");

  const sweep = () => {
    void sweepExpiredPhotoReservations(deps.db).catch(() => {
      deps.logger.error("Pembersihan reservasi foto gagal.", { category: "database_unavailable" });
    });
    void retryFailedPhotoDeletions(deps.db).catch(() => {
      deps.logger.error("Penjadwalan ulang penghapusan foto gagal.", { category: "database_unavailable" });
    });
    void cleanupPublicRpcBudgets(deps.db).catch(() => {
      deps.logger.error("Pembersihan anggaran verifikasi gagal.", { category: "database_unavailable" });
    });
  };
  const sweepTimer = setInterval(sweep, 15 * 60 * 1000);
  sweep();
  deps.jobs.start();
  const port = Number(process.env.PORT ?? 3000);
  try {
    app.listen({ port, hostname: "0.0.0.0" }, () => {
      deps.logger.info("Server berjalan.", { port });
    });
  } catch (error) {
    await deps.jobs.stop();
    throw error;
  }

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

  let stopping = false;
  const shutdown = () => {
    clearInterval(sweepTimer);
    if (stopping) return;
    stopping = true;
    void (async () => {
      try {
        await app.stop();
      } finally {
        await deps.jobs.stop();
      }
    })().catch((error: unknown) => {
      deps.logger.error("Gagal menghentikan server.", {
        reason: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void startServer().catch((error: unknown) => {
  deps.logger.error("Gagal menyiapkan server dan bucket penyimpanan foto.", {
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
