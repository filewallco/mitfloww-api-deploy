import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLogValue, sanitizeUrlString } from "../src/lib/logger/sanitizer";

test("Sanitizer: redacts sensitive object keys recursively", () => {
  const sensitiveObj = {
    user: {
      id: "usr_123",
      email: "user@example.com",
      password: "SuperSecretPassword123!",
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$...",
      otp: "849201",
      token: "eyJhbGciOiJIUzI1NiIsIn...",
      nested: {
        apiKey: "mitfloww_live_key_999",
        authorization: "Bearer secret-token-xyz",
        cookie: "session=abc12345",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----...",
      },
    },
    meta: {
      clientIp: "127.0.0.1",
      retries: 3,
    },
  };

  const sanitized = sanitizeLogValue(sensitiveObj) as any;

  // Safe properties preserved
  assert.equal(sanitized.user.id, "usr_123");
  assert.equal(sanitized.user.email, "user@example.com");
  assert.equal(sanitized.meta.clientIp, "127.0.0.1");
  assert.equal(sanitized.meta.retries, 3);

  // Sensitive properties redacted
  assert.ok(sanitized.user.password.includes("REDACTED"));
  assert.ok(sanitized.user.passwordHash.includes("REDACTED"));
  assert.ok(sanitized.user.otp.includes("REDACTED"));
  assert.ok(sanitized.user.token.includes("REDACTED"));
  assert.ok(sanitized.user.nested.apiKey.includes("REDACTED"));
  assert.ok(sanitized.user.nested.authorization.includes("REDACTED"));
  assert.ok(sanitized.user.nested.cookie.includes("REDACTED"));
  assert.ok(sanitized.user.nested.privateKey.includes("REDACTED"));
});

test("Sanitizer: redacts credentials from URLs and database connection strings", () => {
  const dbUrl = "postgres://postgres:SuperSecretDbPassword@localhost:5432/mitfloww_db";
  const sanitizedDbUrl = sanitizeUrlString(dbUrl);
  assert.ok(!sanitizedDbUrl.includes("SuperSecretDbPassword"));
  assert.ok(sanitizedDbUrl.includes("postgres://***:***@localhost:5432/mitfloww_db"));

  const signedS3Url = "https://r2.cloudflarestorage.com/bucket/file.mp4?X-Amz-Signature=abcd1234efgh&X-Amz-Credential=cr5678";
  const sanitizedSignedUrl = sanitizeUrlString(signedS3Url);
  assert.ok(!sanitizedSignedUrl.includes("abcd1234efgh"));
  assert.ok(sanitizedSignedUrl.includes("X-Amz-Signature=***"));
});

test("Sanitizer: handles circular references safely", () => {
  const circular: any = { name: "test", level: 1 };
  circular.self = circular;

  const result = sanitizeLogValue(circular) as any;
  assert.equal(result.name, "test");
  assert.equal(result.self, "[CircularReference]");
});
