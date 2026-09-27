import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requestTracingMiddleware } from "../src/middleware/request-tracing";
import { requestLoggerMiddleware } from "../src/middleware/request-logger";
import { errorHandler } from "../src/middleware/error-handler";
import { AppError } from "../src/lib/errors/app-error";

test("Middleware: request tracing generates X-Request-Id and X-Correlation-Id headers", async () => {
  const app = express();
  app.use(requestTracingMiddleware);
  app.use(requestLoggerMiddleware);

  app.get("/api/test-trace", (req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://localhost:${port}/api/test-trace`);
    assert.equal(res.status, 200);
    const reqId = res.headers.get("x-request-id");
    const corrId = res.headers.get("x-correlation-id");
    assert.ok(reqId && reqId.startsWith("req_"));
    assert.ok(corrId);
  } finally {
    server.close();
  }
});

test("Middleware: error-handler safely catches errors and returns structured response", async () => {
  const app = express();
  app.use(requestTracingMiddleware);
  app.use(requestLoggerMiddleware);

  app.get("/api/test-error", (req, res, next) => {
    next(new AppError("User not authorized", 403, "forbidden"));
  });

  app.use(errorHandler);

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://localhost:${port}/api/test-error`);
    assert.equal(res.status, 403);
    const body = await res.json() as any;
    assert.equal(body.error.code, "forbidden");
    assert.ok(body.error.requestId);
  } finally {
    server.close();
  }
});
