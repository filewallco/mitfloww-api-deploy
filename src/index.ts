import "dotenv/config";
import { app } from "./app";
import { fileService } from "./lib/services/file-service";
import { pool } from "./lib/db/client";
import { initLogDbSink, logger } from "./lib/logger";
import { setupProcessSafety } from "./lib/server/process-safety";

// Initialize database log sink with Postgres pool
initLogDbSink(pool);

const PORT = parseInt(process.env.PORT || "4001", 10);
const HOST = "0.0.0.0";

let staleJobTimer: NodeJS.Timeout | null = null;

const server = app.listen(PORT, HOST, () => {
  logger.info(`[MitFloww API] Server running on http://${HOST}:${PORT}`, {
    port: PORT,
    host: HOST,
    nodeEnv: process.env.NODE_ENV || "development",
  });

  // Clean console message for developer confirmation on startup
  console.log(`[MitFloww API] Server running on http://${HOST}:${PORT} (operational & error logs routed to logs/ & database)`);

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
