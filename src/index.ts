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

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Clustering is only enabled for long-running Node processes, NEVER in serverless/Vercel
const isClusterEnabled =
  !isServerless &&
  (process.env.NODE_CLUSTER === "true" ||
    (process.env.NODE_ENV === "production" && process.env.NODE_CLUSTER !== "false"));

if (!isServerless && isClusterEnabled && cluster.isPrimary) {
  // --- PRIMARY (MASTER) PROCESS ---
  try {
    const execPath = process.argv[1] || fileURLToPath(import.meta.url);
    if (execPath) {
      cluster.setupPrimary({ exec: execPath });
    }
  } catch {}
  initLogDbSink(pool);

  const availableCpus =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length;

  const workerCount = process.env.WEB_CONCURRENCY
    ? parseInt(process.env.WEB_CONCURRENCY, 10)
    : Math.max(1, Math.min(availableCpus, 8));

  logger.info(`[MitFloww Cluster] Primary process PID ${process.pid} orchestrating ${workerCount} workers across ${availableCpus} CPU cores`, {
    availableCpus,
    workerCount,
    nodeEnv: process.env.NODE_ENV || "development",
  });

  console.log(`[MitFloww Cluster] Primary PID ${process.pid} orchestrating ${workerCount} workers across ${availableCpus} CPU cores`);

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  const staleJobTimer = setInterval(() => {
    fileService
      .reconcileStaleProcessingVersions()
      .catch((err) =>
        logger.error("[MitFloww Cluster] Error in reconcileStaleProcessingVersions:", { error: err })
      );
  }, 60_000);

  let isShuttingDown = false;

  cluster.on("exit", (worker, code, signal) => {
    if (isShuttingDown) return;
    logger.warn(`[MitFloww Cluster] Worker PID ${worker.process.pid} exited (code: ${code}, signal: ${signal}). Spawning replacement...`);
    cluster.fork();
  });

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

} else if (!isServerless) {
  // --- WORKER PROCESS OR LOCAL DEV (LONG-RUNNING SERVER) ---
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
} else {
  // --- SERVERLESS / VERCEL ENVIRONMENT ---
  initLogDbSink(pool);
}

export { app };
export default app;
