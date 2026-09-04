import dns from "node:dns";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Prefer IPv4 first to avoid IPv6 connection hangs on dual-stack networks where IPv6 is unrouted
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const isRemoteNeon =
  typeof process.env.DATABASE_URL === "string" &&
  process.env.DATABASE_URL.includes("neon.tech");

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production" || isRemoteNeon
        ? { rejectUnauthorized: false }
        : undefined,
    max: 10,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

pool.on("error", (err) => {
  // Catch errors on idle clients so they are purged from the pool cleanly
  console.warn("[Database Pool] Idle client warning:", err.message || err);
});

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool);