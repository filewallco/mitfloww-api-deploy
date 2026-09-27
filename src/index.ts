import "dotenv/config";
import { app } from "./app";
import { fileService } from "./lib/services/file-service";
import { pool } from "./lib/db/client";
import { initLogDbSink } from "./lib/logger";
import { logger } from "./lib/logger";
import { setupProcessSafety } from "./lib/server/process-safety";

const PORT = parseInt(process.env.PORT || "4001", 10);
const HOST = "0.0.0.0";

let staleJobTimer: NodeJS.Timeout | null = null;

const server = app.listen(PORT, HOST, () => {
  logger.info(`[MitFloww API] Server running on http://${HOST}:${PORT}`, {
    port: PORT,
    host: HOST,
    nodeEnv: process.env.NODE_ENV || "development",
  });

  // Periodic stale job reconciliation (every 60s)
  staleJobTimer = setInterval(() => {
    fileService
      .reconcileStaleProcessingVersions()
      .catch((err) =>
        logger.error("[MitFloww API] Error in reconcileStaleProcessingVersions:", { error: err })
      );
  }, 60_000);
});

// Setup process-level error safety, unhandledRejection/uncaughtException isolation, and graceful shutdown
setupProcessSafety({
  server,
  pool,
  onShutdown: () => {
    if (staleJobTimer) {
      clearInterval(staleJobTimer);
      staleJobTimer = null;
    }
  },
});
