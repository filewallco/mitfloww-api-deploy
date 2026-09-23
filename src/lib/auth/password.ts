import crypto from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";

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
