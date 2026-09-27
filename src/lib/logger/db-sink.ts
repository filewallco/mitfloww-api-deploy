import type { Pool } from "pg";

let dbPool: Pool | null = null;
let isClosing = false;

export function initLogDbSink(pool: Pool) {
  dbPool = pool;
}

export function closeLogDbSink() {
  isClosing = true;
  dbPool = null;
}

export interface ApiDbLogEntry {
  timestamp: string;
  level: string;
  event: string;
  message: string;
  requestId?: string | null;
  correlationId?: string | null;
  userId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  component?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  stackTrace?: string | null;
  metadata?: any;
}

export function persistApiLogToDatabase(entry: ApiDbLogEntry): void {
  if (!dbPool || isClosing) return;

  // Non-blocking fire-and-forget
  dbPool
    .query(
      `INSERT INTO mitfloww.api_logs (
        timestamp, level, event, message, request_id, correlation_id, user_id, method, path, status_code, duration_ms, component, error_code, error_message, stack_trace, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16);`,
      [
        entry.timestamp,
        entry.level,
        entry.event,
        entry.message,
        entry.requestId || null,
        entry.correlationId || null,
        entry.userId || null,
        entry.method || null,
        entry.path || null,
        entry.statusCode ?? null,
        entry.durationMs ?? null,
        entry.component || null,
        entry.errorCode || null,
        entry.errorMessage || null,
        entry.stackTrace || null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    )
    .catch(() => {
      // Failure isolation: never crash the API if logging to DB fails
    });
}
