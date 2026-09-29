import type { Server } from "node:http";
import type { Pool } from "pg";
import { logger } from "@/lib/logger";

interface ProcessSafetyOptions {
  server?: Server;
  pool?: Pool;
  onShutdown?: () => Promise<void> | void;
  shutdownTimeoutMs?: number;
}

let isShuttingDown = false;

export function setupProcessSafety(options: ProcessSafetyOptions = {}) {
  const timeoutMs = options.shutdownTimeoutMs ?? 10000;

  // 1. Unhandled Promise Rejection Handler
  process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    logger.error("[ProcessSafety] Unhandled Promise Rejection detected", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: String(promise),
    });
    // Note: In Node.js, unhandledRejection does not automatically corrupt memory;
    // we log comprehensively to allow diagnosis while keeping the API operational.
  });

  // 2. Uncaught Exception Handler
  process.on("uncaughtException", async (error: Error) => {
    const isTransientConnectionError =
      error.message?.includes("Connection terminated") ||
      error.message?.includes("timeout exceeded when trying to connect") ||
      (error as any)?.code === "ECONNRESET" ||
      (error as any)?.code === "EPIPE" ||
      (error as any)?.code === "57P01"; // admin_shutdown / connection drop

    if (isTransientConnectionError) {
      logger.error("[ProcessSafety] Transient database/socket error caught in uncaughtException (preventing server crash)", {
        name: error.name,
        message: error.message,
      });
      return;
    }

    logger.fatal("[ProcessSafety] Uncaught Exception encountered! Initiating graceful recovery shutdown...", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    await gracefulShutdown("uncaughtException", 1);
  });

  // 3. Graceful Shutdown Function
  async function gracefulShutdown(signal: string, exitCode = 0) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`[ProcessSafety] Received ${signal}. Starting graceful shutdown...`, {
      signal,
      timeoutMs,
    });

    const shutdownTimer = setTimeout(() => {
      logger.error(`[ProcessSafety] Graceful shutdown timed out after ${timeoutMs}ms. Forcing exit.`);
      process.exit(1);
    }, timeoutMs);
    shutdownTimer.unref();

    try {
      // 1. Stop accepting new HTTP requests
      if (options.server && options.server.listening) {
        await new Promise<void>((resolve) => {
          options.server?.close((err) => {
            if (err) {
              logger.warn("[ProcessSafety] Error closing HTTP server", { error: err.message });
            } else {
              logger.info("[ProcessSafety] HTTP server closed cleanly.");
            }
            resolve();
          });
        });
      }

      // 2. Run custom cleanup hook (e.g. interval timers)
      if (options.onShutdown) {
        try {
          await options.onShutdown();
          logger.info("[ProcessSafety] Custom cleanup tasks completed.");
        } catch (err: any) {
          logger.warn("[ProcessSafety] Error during custom cleanup", { error: err?.message || err });
        }
      }

      // 3. Drain PostgreSQL connection pool
      if (options.pool) {
        try {
          await options.pool.end();
          logger.info("[ProcessSafety] PostgreSQL pool drained and closed.");
        } catch (err: any) {
          logger.warn("[ProcessSafety] Error ending DB pool", { error: err?.message || err });
        }
      }

      clearTimeout(shutdownTimer);
      logger.info("[ProcessSafety] Graceful shutdown completed cleanly. Exiting.");
      process.exit(exitCode);
    } catch (err: any) {
      logger.error("[ProcessSafety] Error during graceful shutdown", { error: err?.message || err });
      process.exit(1);
    }
  }

  // 4. OS Signals
  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM", 0));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT", 0));

  return {
    gracefulShutdown,
  };
}
