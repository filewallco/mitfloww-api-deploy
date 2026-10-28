import type { CorsOptions } from "cors";

// Production allowed origins
const ALLOWED_ORIGINS = [
  "https://mitfloww.vercel.app",
  "https://mitfloww.com",
  "https://www.mitfloww.com",
];

// Regex for Vercel preview environments
const VERCEL_PREVIEW_PATTERN = /^https:\/\/mitfloww(-[a-z0-9-]+)?\.vercel\.app$/;

// Development origins (only accepted when NODE_ENV !== 'production')
const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4001",
  "http://127.0.0.1:4001",
];

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;

  const normalized = origin.trim().replace(/\/+$/, "").toLowerCase();

  // Explicit allowed production domains
  if (ALLOWED_ORIGINS.includes(normalized)) return true;

  // Environment variables
  const configuredAppUrl = process.env.APP_URL?.trim().replace(/\/+$/, "").toLowerCase();
  if (configuredAppUrl && normalized === configuredAppUrl) return true;

  const configuredWebUrl = process.env.WEB_URL?.trim().replace(/\/+$/, "").toLowerCase();
  if (configuredWebUrl && normalized === configuredWebUrl) return true;

  if (process.env.CORS_ALLOWED_ORIGINS) {
    const customList = process.env.CORS_ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim().replace(/\/+$/, "").toLowerCase())
      .filter(Boolean);
    if (customList.includes(normalized)) return true;
  }

  // Vercel preview deployments
  if (VERCEL_PREVIEW_PATTERN.test(normalized)) return true;

  // Development origins
  if (process.env.NODE_ENV !== "production") {
    if (DEV_ORIGINS.includes(normalized)) return true;
  }

  return false;
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // If no origin header is present (same-origin, curl, server-to-server), allow without reflecting origin header
    if (!origin) {
      return callback(null, true);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    // Reject untrusted origin
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86400, // 24 hours preflight cache
};
