import "dotenv/config";
import cluster from "node:cluster";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { app } from "./app";
import { fileService } from "./lib/services/file-service";
import { pool } from "./lib/db/client";
import { initLogDbSink, logger } from "./lib/logger";
import { setupProcessSafety } from "./lib/server/process-safety";
import { puppeteerManager } from "./lib/services/puppeteer-manager";

const PORT = parseInt(process.env.PORT || "4001", 10);
const HOST = "0.0.0.0";

// Clustering is enabled when NODE_CLUSTER is "true", or in production unless explicitly set to "false"
const isClusterEnabled =
  process.env.NODE_CLUSTER === "true" ||
  (process.env.NODE_ENV === "production" && process.env.NODE_CLUSTER !== "false");

const availableCpus =
  typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;

const workerCount = process.env.WEB_CONCURRENCY
  ? parseInt(process.env.WEB_CONCURRENCY, 10)
  : Math.max(1, Math.min(availableCpus, 8)); // clamp to 8 max by default to balance RAM & throughput

if (isClusterEnabled && cluster.isPrimary) {
  // --- PRIMARY (MASTER) PROCESS ---
  try {
    const execPath = process.argv[1] || fileURLToPath(import.meta.url);
    if (execPath) {
      cluster.setupPrimary({ exec: execPath });
    }
  } catch {}
  initLogDbSink(pool);

  logger.info(`[MitFloww Cluster] Primary process PID ${process.pid} orchestrating ${workerCount} workers across ${availableCpus} CPU cores`, {
    availableCpus,
    workerCount,
    nodeEnv: process.env.NODE_ENV || "development",
  });

  console.log(`[MitFloww Cluster] Primary PID ${process.pid} orchestrating ${workerCount} workers across ${availableCpus} CPU cores`);

  // Fork initial worker processes
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Periodic stale job reconciliation (runs ONLY on Primary process to prevent duplicate DB writes across workers)
  const staleJobTimer = setInterval(() => {
    fileService
      .reconcileStaleProcessingVersions()
      .catch((err) =>
        logger.error("[MitFloww Cluster] Error in reconcileStaleProcessingVersions:", { error: err })
      );
  }, 60_000);

  let isShuttingDown = false;

  // Self-healing: automatically fork replacement if a worker exits unexpectedly
  cluster.on("exit", (worker, code, signal) => {
    if (isShuttingDown) return;
    logger.warn(`[MitFloww Cluster] Worker PID ${worker.process.pid} exited (code: ${code}, signal: ${signal}). Spawning replacement...`);
    cluster.fork();
  });

  // Graceful shutdown on Primary process
  const handlePrimaryShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`[MitFloww Cluster] Primary received ${signal}. Terminating workers gracefully...`);
    clearInterval(staleJobTimer);

    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill(signal === "SIGTERM" ? "SIGTERM" : "SIGINT");
    }

    await puppeteerManager.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", () => void handlePrimaryShutdown("SIGTERM"));
  process.on("SIGINT", () => void handlePrimaryShutdown("SIGINT"));

} else {
  // --- WORKER PROCESS (OR SINGLE-PROCESS MODE IN DEV) ---
  initLogDbSink(pool);

  let staleJobTimer: NodeJS.Timeout | null = null;

  const server = app.listen(PORT, HOST, () => {
    const processTag = isClusterEnabled ? `Worker PID ${process.pid}` : `PID ${process.pid}`;
    logger.info(`[MitFloww API] Server running on http://${HOST}:${PORT} [${processTag}]`, {
      port: PORT,
      host: HOST,
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV || "development",
    });

    console.log(`[MitFloww API] Server running on http://${HOST}:${PORT} [${processTag}] (operational & error logs routed to logs/ & database)`);

    // In single-process mode, run the stale job reconciliation
    if (!isClusterEnabled) {
      staleJobTimer = setInterval(() => {
        fileService
          .reconcileStaleProcessingVersions()
          .catch((err) =>
            logger.error("[MitFloww API] Error in reconcileStaleProcessingVersions:", { error: err })
          );
      }, 60_000);
    }
  });

  setupProcessSafety({
    server,
    pool,
    onShutdown: async () => {
      if (staleJobTimer) {
        clearInterval(staleJobTimer);
        staleJobTimer = null;
      }
      await puppeteerManager.close().catch(() => {});
    },
  });
}
