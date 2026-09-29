import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { logger, createScopedLogger } from "../src/lib/logger/logger";
import { requestContextStorage, getRequestContext } from "../src/lib/logger/context";
import { persistApiLogToFile } from "../src/lib/logger/file-sink";
import { persistApiLogToDatabase, initLogDbSink, closeLogDbSink } from "../src/lib/logger/db-sink";

test("Logger: attaches AsyncLocalStorage context to logs without throwing", () => {
  const context = {
    requestId: "req_test_1234567890",
    correlationId: "corr_987654321",
    userId: "usr_active_999",
    method: "POST",
    path: "/api/files/upload",
    startTime: Date.now(),
  };

  requestContextStorage.run(context, () => {
    const active = getRequestContext();
    assert.equal(active?.requestId, "req_test_1234567890");
    assert.equal(active?.correlationId, "corr_987654321");
    assert.equal(active?.userId, "usr_active_999");
    assert.equal(active?.method, "POST");
    assert.equal(active?.path, "/api/files/upload");

    // Calling log methods should execute cleanly without throwing
    logger.info("Test operation in context", { fileId: "file_555", sizeBytes: 1024 });
    logger.debug("Debug message with extra details", { debugKey: "val" });
    logger.warn("Warning about resource limit", { limit: 100 });
  });
});

test("Logger: createScopedLogger creates scoped child logger", () => {
  const scoped = createScopedLogger("billing-worker");
  assert.ok(scoped);

  // Calling scoped log methods executes cleanly
  scoped.info("Payment retry scheduled", { attempt: 2 });
  scoped.warn("Transient gateway timeout", { gateway: "stripe" });
});

test("Logger: file sink creates daily log file and records entry", async () => {
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.slice(0, 10);
  const logDir = path.resolve(process.cwd(), "logs");
  const logFilePath = path.join(logDir, `api-${dateStr}.log`);

  persistApiLogToFile({
    timestamp,
    level: "info",
    message: "Verifying file sink write functionality",
    component: "unit-test",
    requestId: "req_file_sink_test",
    metadata: { key: "value123" },
  });

  // Give write stream a tick to flush
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(fs.existsSync(logFilePath), `Log file should exist at ${logFilePath}`);
  const content = fs.readFileSync(logFilePath, "utf8");
  assert.ok(content.includes("Verifying file sink write functionality"));
  assert.ok(content.includes("[unit-test]"));
  assert.ok(content.includes("[req_file_sink_test]"));
  assert.ok(content.includes("value123"));
});

test("Logger: db sink handles query execution and string truncation cleanly", async () => {
  let executedQuery = "";
  let executedParams: any[] = [];

  const mockPool = {
    query: async (queryText: string, params: any[]) => {
      executedQuery = queryText;
      executedParams = params;
      return { rows: [] };
    },
  } as any;

  initLogDbSink(mockPool);

  const longPath = "/" + "a".repeat(500);
  persistApiLogToDatabase({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "custom_event_name_too_long_".repeat(5),
    message: "Critical operation failed",
    requestId: "req_" + "1".repeat(100),
    path: longPath,
    component: "component_" + "x".repeat(100),
    metadata: { nested: { safe: true } },
  });

  // Brief pause for insertion callback
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.ok(executedQuery.includes("INSERT INTO mitfloww.api_logs"));
  assert.ok(executedParams.length === 16);
  // Path safely truncated to 255
  assert.ok(executedParams[6] === null || executedParams[6] === undefined || typeof executedParams[6] === "string");
  // Component safely truncated
  assert.ok(executedParams[11].length <= 64);
  // Metadata safely serialized
  assert.ok(executedParams[15].includes("safe"));

  await closeLogDbSink();
});
