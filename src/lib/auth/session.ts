import crypto from "node:crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || "mitfloww_secure_session_secret_key_2026";

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString("base64url");
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${hmac}`;
}

export function verifySessionToken(token: string): string | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, hmac] = token.split(".");
  if (!payload || !hmac) return null;
  const expectedHmac = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  if (hmac !== expectedHmac) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.userId || null;
  } catch {
    return null;
  }
}
