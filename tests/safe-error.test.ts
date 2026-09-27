import test from "node:test";
import assert from "node:assert/strict";
import { describeSafeError, toSafeErrorResponse } from "../src/lib/errors/safe-error-response";
import { AppError } from "../src/lib/errors/app-error";
import { ZodError, z } from "zod";

test("Safe Error: maps AppError to sanitized payload with messageKey", () => {
  const appErr = new AppError("Direct internal msg", 404, "file_not_found");
  const response = toSafeErrorResponse(appErr);

  assert.equal(response.statusCode, 404);
  assert.equal(response.payload.error.code, "file_not_found");
  assert.equal(response.payload.error.messageKey, "common.errors.notFound");
  assert.ok(response.payload.error.requestId);
});

test("Safe Error: redacts internal unhandled Error to generic 500 error", () => {
  const internalErr = new Error("FATAL: relation 'users' does not exist at /src/lib/db/query.ts:42");
  const response = toSafeErrorResponse(internalErr);

  assert.equal(response.statusCode, 500);
  assert.equal(response.payload.error.code, "internal_server_error");
  assert.equal(response.payload.error.messageKey, "common.errors.unexpected");
  // Does NOT leak internal SQL or stack trace to client
  assert.ok(!JSON.stringify(response.payload).includes("relation 'users' does not exist"));
});

test("Safe Error: converts Zod validation errors to structured safe details", () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().min(18),
  });

  let zodErr: ZodError | null = null;
  try {
    schema.parse({ email: "invalid-email", age: 12 });
  } catch (err) {
    if (err instanceof ZodError) zodErr = err;
  }

  assert.ok(zodErr);
  const response = toSafeErrorResponse(zodErr);
  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.error.code, "validation_error");
  assert.ok(Array.isArray(response.payload.error.details));
  assert.equal(response.payload.error.details.length, 2);
});
