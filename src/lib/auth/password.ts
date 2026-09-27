import crypto from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 100;
const ALLOWED_PASSWORD_REGEX = /^[A-Za-z0-9@$&!#%*?_-]+$/;

/**
 * Validates passwords used by signup and password reset flows.
 * Returns a user-safe validation message, or null when the password is valid.
 */
export function getPasswordValidationError(password: string): string | null {
  if (!password) return "Please enter a password.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return "Password must be at least 6 characters long.";
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return "Password cannot exceed 100 characters.";
  }
  if (!ALLOWED_PASSWORD_REGEX.test(password)) {
    return "Password may contain only letters, numbers, and @ $ & ! # % * ? _ -.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one digit.";
  }
  if (!/[@$&!#%*?_-]/.test(password)) {
    return "Password must include at least one symbol.";
  }
  return null;
}

export function isValidPassword(password: string): boolean {
  return getPasswordValidationError(password) === null;
}

export type PasswordVerificationResult = {
  isValid: boolean;
  needsRehash: boolean;
};

/**
 * Hashes a plaintext password using Argon2id with secure memory, time, and parallelism parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a password against a stored hash.
 * Supports Argon2id and provides backward-compatibility for legacy scrypt hashes,
 * flagging `needsRehash: true` so the hash can be seamlessly upgraded on successful login.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<PasswordVerificationResult> {
  if (!password || !storedHash) {
    return { isValid: false, needsRehash: false };
  }

  // Check if Argon2 hash ($argon2id$ or $argon2i$ or $argon2d$)
  if (storedHash.startsWith("$argon2")) {
    try {
      const isValid = await verify(storedHash, password);
      return { isValid, needsRehash: false };
    } catch {
      return { isValid: false, needsRehash: false };
    }
  }

  // Fallback: Legacy scrypt format "salt:derivedKeyHex"
  if (storedHash.includes(":")) {
    try {
      const [salt, key] = storedHash.split(":");
      if (!salt || !key) return { isValid: false, needsRehash: false };
      const keyBuffer = Buffer.from(key, "hex");
      const derivedKey = crypto.scryptSync(password, salt, 64);
      const isValid = crypto.timingSafeEqual(keyBuffer, derivedKey);
      return { isValid, needsRehash: isValid };
    } catch {
      return { isValid: false, needsRehash: false };
    }
  }

  return { isValid: false, needsRehash: false };
}
