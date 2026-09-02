import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type ProjectShareSessionPayload = {
  e: number;
  m?: string;
  n: string;
  t: string;
  p?: boolean;
};

const PROJECT_SHARE_SESSION_COOKIE_NAME = "mitfloww-share-session";
const PROJECT_SHARE_SESSION_SEPARATOR = ".";

function getProjectShareSessionSigningSecret() {
  return (
    process.env.PROJECT_SHARE_SESSION_SECRET ||
    process.env.PROJECT_SHARE_SIGNING_SECRET ||
    process.env.WORKER_API_TOKEN ||
    process.env.DATABASE_URL ||
    "dev-project-share-session-secret"
  );
}

function encodePayload(payload: ProjectShareSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ProjectShareSessionPayload>;

    if (
      typeof parsed.e !== "number" ||
      !Number.isFinite(parsed.e) ||
      typeof parsed.n !== "string" ||
      parsed.n.length === 0 ||
      typeof parsed.t !== "string" ||
      parsed.t.length === 0
    ) {
      return null;
    }

    if (parsed.m != null && typeof parsed.m !== "string") {
      return null;
    }

    return {
      e: parsed.e,
      m: parsed.m?.trim() || undefined,
      n: parsed.n,
      t: parsed.t,
      p: parsed.p,
    } satisfies ProjectShareSessionPayload;
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getProjectShareSessionSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function getProjectShareSessionCookieName() {
  return PROJECT_SHARE_SESSION_COOKIE_NAME;
}

export function createProjectShareSessionToken(input: {
  email?: string | null;
  expiresAt: Date;
  shareToken: string;
  passwordVerified?: boolean;
}) {
  const payload = encodePayload({
    e: Math.floor(input.expiresAt.getTime() / 1000),
    m: input.email?.trim() || undefined,
    n: randomBytes(18).toString("base64url"),
    t: input.shareToken,
    p: input.passwordVerified,
  });
  const signature = signPayload(payload);

  return `${payload}${PROJECT_SHARE_SESSION_SEPARATOR}${signature}`;
}

export function verifyProjectShareSessionToken(token: string) {
  try {
    const separatorIndex = token.indexOf(PROJECT_SHARE_SESSION_SEPARATOR);

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
