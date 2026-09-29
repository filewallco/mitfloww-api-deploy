import type { Pool } from "pg";

let dbPool: Pool | null = null;
let isClosing = false;
let activeInsertions = 0;

export function initLogDbSink(pool: Pool): void {
  dbPool = pool;
  isClosing = false;
}

export function isLogDbSinkInitialized(): boolean {
  return dbPool !== null && !isClosing;
}

export async function closeLogDbSink(): Promise<void> {
  isClosing = true;
  // Brief grace period for in-flight queries to finish
  let attempts = 0;
  while (activeInsertions > 0 && attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts++;
  }
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

function safeJsonStringify(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  try {
    const seen = new WeakSet();
    return JSON.stringify(val, (_key, value) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...(value as any),
        };
      }
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    });
  } catch {
    try {
      return JSON.stringify({ raw: String(val) });
    } catch {
      return null;
    }
  }
}

export function persistApiLogToDatabase(entry: ApiDbLogEntry): void {
  if (!dbPool || isClosing) return;

  activeInsertions++;

  // Safely bound string lengths to prevent column overflow errors
  const safeLevel = (entry.level || "info").slice(0, 16);
  const safeEvent = (entry.event || "api_event").slice(0, 64);
  const safeRequestId = entry.requestId ? entry.requestId.slice(0, 64) : null;
  const safeCorrelationId = entry.correlationId ? entry.correlationId.slice(0, 64) : null;
  const safeUserId = entry.userId ? entry.userId.slice(0, 64) : null;
  const safeMethod = entry.method ? entry.method.slice(0, 16) : null;
  const safePath = entry.path ? entry.path.slice(0, 255) : null;
  const safeComponent = entry.component ? entry.component.slice(0, 64) : null;
  const safeErrorCode = entry.errorCode ? entry.errorCode.slice(0, 64) : null;
  const safeMetadata = safeJsonStringify(entry.metadata);

  // Non-blocking fire-and-forget
  dbPool
    .query(
      `INSERT INTO mitfloww.api_logs (
        timestamp, level, event, message, request_id, correlation_id, user_id, method, path, status_code, duration_ms, component, error_code, error_message, stack_trace, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16);`,
      [
        entry.timestamp,
        safeLevel,
        safeEvent,
        entry.message,
        safeRequestId,
        safeCorrelationId,
        safeUserId,
        safeMethod,
        safePath,
        entry.statusCode ?? null,
        entry.durationMs ?? null,
        safeComponent,
        safeErrorCode,
        entry.errorMessage || null,
        entry.stackTrace || null,
        safeMetadata,
      ]
    )
    .catch(() => {
      // Failure isolation: never crash the API if logging to DB fails
    })
    .finally(() => {
      activeInsertions = Math.max(0, activeInsertions - 1);
    });
}
