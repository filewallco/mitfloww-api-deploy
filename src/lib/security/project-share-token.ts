import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type SignedProjectShareTokenPayload = {
  e: number;
  n: string;
};

const SIGNED_PROJECT_SHARE_TOKEN_SEPARATOR = ".";

function getProjectShareSigningSecret() {
  return (
    process.env.PROJECT_SHARE_SIGNING_SECRET ||
    process.env.WORKER_API_TOKEN ||
    process.env.DATABASE_URL ||
    "dev-project-share-secret"
  );
}

function encodePayload(payload: SignedProjectShareTokenPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<SignedProjectShareTokenPayload>;

    if (
      typeof parsed.e !== "number" ||
      !Number.isFinite(parsed.e) ||
      typeof parsed.n !== "string" ||
      parsed.n.length === 0
    ) {
      return null;
    }

    return {
      e: parsed.e,
      n: parsed.n,
    } satisfies SignedProjectShareTokenPayload;
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getProjectShareSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createSignedProjectShareToken(expiresAt: Date) {
  const payload = encodePayload({
    e: Math.floor(expiresAt.getTime() / 1000),
    n: randomBytes(18).toString("base64url"),
  });
  const signature = signPayload(payload);

  return `${payload}${SIGNED_PROJECT_SHARE_TOKEN_SEPARATOR}${signature}`;
}

export function getProjectShareTokenExpiry(token: string) {
  const payload = verifySignedProjectShareToken(token);

  if (!payload) {
    return null;
  }

  return new Date(payload.e * 1000);
}

export function isSignedProjectShareToken(token: string) {
  return verifySignedProjectShareToken(token) !== null;
}

export function verifySignedProjectShareToken(token: string) {
  try {
    const separatorIndex = token.indexOf(SIGNED_PROJECT_SHARE_TOKEN_SEPARATOR);

    if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
      return null;
    }

    const encodedPayload = token.slice(0, separatorIndex);
    const signature = token.slice(separatorIndex + 1);
    const expectedSignature = signPayload(encodedPayload);
    const signatureBuffer = Buffer.from(signature, "base64url");
    const expectedBuffer = Buffer.from(expectedSignature, "base64url");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }

    return decodePayload(encodedPayload);
  } catch {
    return null;
  }
}
