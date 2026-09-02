import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SHARE_PASSWORD_HASH_PREFIX = "scrypt";
const SHARE_PASSWORD_SALT_BYTES = 16;
const SHARE_PASSWORD_KEY_BYTES = 64;

export function normalizeProjectSharePassword(value: string) {
  return value.normalize("NFKC").trim();
}

function parseSharePasswordHash(value: string) {
  const [prefix, salt, digest] = value.split("$");

  if (
    prefix !== SHARE_PASSWORD_HASH_PREFIX ||
    !salt ||
    !digest
  ) {
    throw new Error("Invalid share password hash format.");
  }

  return {
    digest: Buffer.from(digest, "base64url"),
    salt,
  };
}

export async function hashProjectSharePassword(password: string) {
  const normalizedPassword = normalizeProjectSharePassword(password);

  if (!normalizedPassword) {
    throw new Error("Share password is required.");
  }

  const salt = randomBytes(SHARE_PASSWORD_SALT_BYTES).toString("base64url");
  const derivedKey = (await scrypt(
    normalizedPassword,
    salt,
    SHARE_PASSWORD_KEY_BYTES,
  )) as Buffer;

  return `${SHARE_PASSWORD_HASH_PREFIX}$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyProjectSharePassword(
  password: string,
  storedHash: string,
) {
  const normalizedPassword = normalizeProjectSharePassword(password);

  if (!normalizedPassword) {
    return false;
  }

  const { digest, salt } = parseSharePasswordHash(storedHash);
  const derivedKey = (await scrypt(
    normalizedPassword,
    salt,
    digest.length,
  )) as Buffer;

  if (derivedKey.length !== digest.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, digest);
}
