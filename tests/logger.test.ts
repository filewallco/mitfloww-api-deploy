import test from "node:test";
import assert from "node:assert/strict";
import { logger, createScopedLogger } from "../src/lib/logger/logger";
import { requestContextStorage, getRequestContext } from "../src/lib/logger/context";

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
