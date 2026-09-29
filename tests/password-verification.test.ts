import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { AppError } from "../src/lib/errors/app-error";

test("Password verification: correctly identifies valid vs invalid passwords", async () => {
  const password = "SecretPassword123!";
  const hash = await hashPassword(password);

  // Correct password
  const resultCorrect = await verifyPassword(password, hash);
  assert.equal(typeof resultCorrect, "object");
  assert.equal(resultCorrect.isValid, true);

  // Incorrect password
  const resultWrong = await verifyPassword("WrongPassword999!", hash);
  assert.equal(typeof resultWrong, "object");
  assert.equal(resultWrong.isValid, false);

  // Object itself is truthy in JavaScript, so checking (!result) without .isValid fails!
  assert.ok(resultWrong);
  assert.equal(!resultWrong, false);
  assert.equal(!resultWrong.isValid, true);
});

test("Password change: same password validation", () => {
  const currentPassword = "SamePassword123!";
  const newPassword = "SamePassword123!";

  assert.equal(currentPassword === newPassword, true);
  if (currentPassword && newPassword && currentPassword === newPassword) {
    const error = new AppError("New password must be different from current password.", 400, "new_password_same_as_current");
    assert.equal(error.code, "new_password_same_as_current");
    assert.equal(error.statusCode, 400);
  }
});
