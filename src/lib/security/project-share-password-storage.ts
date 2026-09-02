import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { normalizeProjectSharePassword } from "@/lib/security/project-share-password";

const SHARE_PASSWORD_STORAGE_PREFIX = "aes-256-gcm";
const SHARE_PASSWORD_STORAGE_IV_BYTES = 12;

function getProjectSharePasswordStorageKey() {
  return createHash("sha256")
    .update(
      process.env.PROJECT_SHARE_PASSWORD_SECRET ||
        process.env.PROJECT_SHARE_SIGNING_SECRET ||
        process.env.WORKER_API_TOKEN ||
        process.env.DATABASE_URL ||
        "dev-project-share-password-secret",
      "utf8",
    )
    .digest();
}

function parseStoredProjectSharePassword(value: string) {
  const [prefix, iv, tag, ciphertext] = value.split("$");

  if (
    prefix !== SHARE_PASSWORD_STORAGE_PREFIX ||
    !iv ||
    !tag ||
    !ciphertext
  ) {
    throw new Error("Invalid stored share password format.");
  }

  return {
    ciphertext: Buffer.from(ciphertext, "base64url"),
    iv: Buffer.from(iv, "base64url"),
    tag: Buffer.from(tag, "base64url"),
  };
}

export function encryptProjectSharePassword(password: string) {
  const normalizedPassword = normalizeProjectSharePassword(password);

  if (!normalizedPassword) {
    throw new Error("Share password is required.");
  }

  const iv = randomBytes(SHARE_PASSWORD_STORAGE_IV_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getProjectSharePasswordStorageKey(),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(normalizedPassword, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SHARE_PASSWORD_STORAGE_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join("$");
}

export function decryptProjectSharePassword(value: string) {
  const { ciphertext, iv, tag } = parseStoredProjectSharePassword(value);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getProjectSharePasswordStorageKey(),
    iv,
  );

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
