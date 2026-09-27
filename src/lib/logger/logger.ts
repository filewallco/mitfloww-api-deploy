import { persistApiLogToDatabase } from "./db-sink";
import { getRequestContext } from "./context";
import { sanitizeLogValue } from "./sanitizer";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function getActiveLogLevel(): number {
  const envLevel = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")).toLowerCase();
  return LOG_LEVEL_SEVERITY[envLevel as LogLevel] ?? (process.env.NODE_ENV === "production" ? 30 : 20);
}

export interface LogMetadata {
  component?: string;
  action?: string;
  requestId?: string;
  userId?: string;
  durationMs?: number;
  error?: unknown;
  [key: string]: unknown;
}

export class Logger {
  constructor(private defaultMeta: LogMetadata = {}) {}

  child(meta: LogMetadata): Logger {
    return new Logger({ ...this.defaultMeta, ...meta });
  }

  private write(level: LogLevel, message: string, meta?: LogMetadata | unknown): void {
    const levelSeverity = LOG_LEVEL_SEVERITY[level];
    if (levelSeverity < getActiveLogLevel()) {
      return;
    }

    const timestamp = new Date().toISOString();
    const reqContext = getRequestContext();

    // Consolidate metadata: request context -> default metadata -> callsite metadata
    let consolidatedMeta: Record<string, unknown> = {};

    if (reqContext) {
      if (reqContext.requestId) consolidatedMeta.requestId = reqContext.requestId;
      if (reqContext.correlationId) consolidatedMeta.correlationId = reqContext.correlationId;
      if (reqContext.userId) consolidatedMeta.userId = reqContext.userId;
      if (reqContext.path) consolidatedMeta.path = reqContext.path;
      if (reqContext.method) consolidatedMeta.method = reqContext.method;
    }

    consolidatedMeta = {
      ...consolidatedMeta,
      ...this.defaultMeta,
    };

    if (meta !== undefined && meta !== null) {
      if (typeof meta === "object" && !(meta instanceof Error) && !Array.isArray(meta)) {
        consolidatedMeta = {
          ...consolidatedMeta,
          ...meta,
        };
      } else if (meta instanceof Error) {
        consolidatedMeta.error = meta;
      } else {
        consolidatedMeta.data = meta;
      }
    }

    // Deep sanitize metadata
    const sanitizedMeta = sanitizeLogValue(consolidatedMeta) as Record<string, unknown>;

    // Asynchronously persist operational log to database
    persistApiLogToDatabase({
      timestamp,
      level,
      event: (sanitizedMeta.event as string) || (sanitizedMeta.component ? `${sanitizedMeta.component}.${level}` : 'api_event'),
      message,
      requestId: reqContext?.requestId || (sanitizedMeta.requestId as string) || null,
      correlationId: reqContext?.correlationId || (sanitizedMeta.correlationId as string) || null,
      userId: reqContext?.userId || (sanitizedMeta.userId as string) || null,
      method: reqContext?.method || (sanitizedMeta.method as string) || null,
      path: reqContext?.path || (sanitizedMeta.path as string) || null,
      statusCode: typeof sanitizedMeta.statusCode === 'number' ? sanitizedMeta.statusCode : null,
      durationMs: typeof sanitizedMeta.durationMs === 'number' ? sanitizedMeta.durationMs : null,
      component: (sanitizedMeta.component as string) || null,
      errorCode: (sanitizedMeta.errorCode as string) || (sanitizedMeta.code as string) || null,
      errorMessage: sanitizedMeta.error instanceof Error ? sanitizedMeta.error.message : (sanitizedMeta.errorMessage as string) || null,
      stackTrace: sanitizedMeta.error instanceof Error ? sanitizedMeta.error.stack : null,
      metadata: sanitizedMeta,
    });

    if (process.env.NODE_ENV === "production") {
      // Structured JSON log output for cloud / Datadog / CloudWatch / stdout parsers
      const logRecord = {
        timestamp,
        level,
        message,
        app: "mitfloww-api",
        ...sanitizedMeta,
      };
      const json = JSON.stringify(logRecord);
      if (level === "error" || level === "fatal") {
        process.stderr.write(json + "\n");
      } else {
        process.stdout.write(json + "\n");
      }
    } else {
      // Pretty developer output in local terminal
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      const componentStr = sanitizedMeta.component ? ` [${sanitizedMeta.component}]` : "";
      const reqIdStr = sanitizedMeta.requestId ? ` [${sanitizedMeta.requestId}]` : "";
      const userStr = sanitizedMeta.userId ? ` [user:${sanitizedMeta.userId}]` : "";

      const colorCode =
        level === "fatal" || level === "error"
          ? "\x1b[31m" // red
          : level === "warn"
            ? "\x1b[33m" // yellow
            : level === "info"
              ? "\x1b[36m" // cyan
              : "\x1b[90m"; // gray

      const resetCode = "\x1b[0m";

      const logHeader = `${colorCode}${prefix}${componentStr}${reqIdStr}${userStr}${resetCode} ${message}`;

      // Clean remaining metadata for console view
      const displayMeta = { ...sanitizedMeta };
      delete displayMeta.component;
      delete displayMeta.requestId;
      delete displayMeta.userId;
      delete displayMeta.path;
      delete displayMeta.method;

      const hasExtraData = Object.keys(displayMeta).length > 0;

      if (level === "error" || level === "fatal") {
        console.error(logHeader, hasExtraData ? displayMeta : "");
      } else if (level === "warn") {
        console.warn(logHeader, hasExtraData ? displayMeta : "");
      } else {
        console.log(logHeader, hasExtraData ? displayMeta : "");
      }
    }
  }

  trace(message: string, meta?: LogMetadata | unknown): void {
    this.write("trace", message, meta);
  }

  debug(message: string, meta?: LogMetadata | unknown): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: LogMetadata | unknown): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: LogMetadata | unknown): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: LogMetadata | unknown): void {
    this.write("error", message, meta);
  }

  fatal(message: string, meta?: LogMetadata | unknown): void {
    this.write("fatal", message, meta);
  }
}

export const logger = new Logger();

export function createScopedLogger(component: string, extra: LogMetadata = {}): Logger {
  return logger.child({ component, ...extra });
}
