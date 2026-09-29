import fs from "node:fs";
import path from "node:path";

const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.resolve(process.cwd(), "logs");

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // Fail-safe: don't crash if directory creation fails transiently
  }
}

function safeStringify(obj: unknown): string {
  if (obj === undefined || obj === null) return "";
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      obj,
      (_key, value) => {
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
      },
      2
    );
  } catch {
    try {
      return String(obj);
    } catch {
      return "[Unserializable]";
    }
  }
}

export interface ApiFileLogEntry {
  timestamp: string;
  level: string;
  message: string;
  component?: string | null;
  requestId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
}

class FileLogSink {
  private mainStream: fs.WriteStream | null = null;
  private errorStream: fs.WriteStream | null = null;
  private currentDate: string | null = null;

  constructor() {
    ensureLogDir();
  }

  private rotateStreamsIfNeeded(date: string): void {
    if (this.currentDate === date && this.mainStream && this.errorStream) {
      return;
    }

    // Close previous streams if any
    try {
      this.mainStream?.end();
    } catch {}
    try {
      this.errorStream?.end();
    } catch {}

    this.currentDate = date;
    ensureLogDir();

    const mainLogPath = path.join(LOG_DIR, `api-${date}.log`);
    const errorLogPath = path.join(LOG_DIR, `api-error-${date}.log`);

    try {
      this.mainStream = fs.createWriteStream(mainLogPath, { flags: "a" });
    } catch {
      this.mainStream = null;
    }

    try {
      this.errorStream = fs.createWriteStream(errorLogPath, { flags: "a" });
    } catch {
      this.errorStream = null;
    }
  }

  public write(entry: ApiFileLogEntry): void {
    try {
      const date = (entry.timestamp ? new Date(entry.timestamp) : new Date())
        .toISOString()
        .slice(0, 10);

      this.rotateStreamsIfNeeded(date);

      const componentStr = entry.component ? ` [${entry.component}]` : "";
      const reqIdStr = entry.requestId ? ` [${entry.requestId}]` : "";
      const userStr = entry.userId ? ` [user:${entry.userId}]` : "";

      // Remove redundant properties already displayed in the header badge
      const cleanMeta = entry.metadata ? { ...entry.metadata } : null;
      if (cleanMeta) {
        delete cleanMeta.component;
        delete cleanMeta.requestId;
        delete cleanMeta.userId;
      }

      const hasMeta = cleanMeta && Object.keys(cleanMeta).length > 0;
      const metaFormatted = hasMeta ? ` ${safeStringify(cleanMeta)}` : "";
      const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}]${componentStr}${reqIdStr}${userStr} ${entry.message}${metaFormatted}\n`;

      // 1. Write to main daily log file (api-YYYY-MM-DD.log)
      if (this.mainStream && !this.mainStream.destroyed) {
        this.mainStream.write(logLine);
      } else {
        fs.appendFile(
          path.join(LOG_DIR, `api-${date}.log`),
          logLine,
          () => {}
        );
      }

      // 2. If error or fatal, write additionally to error daily log file (api-error-YYYY-MM-DD.log)
      const isErrorLevel =
        entry.level === "error" ||
        entry.level === "fatal" ||
        entry.level === "warn";
      if (isErrorLevel) {
        if (this.errorStream && !this.errorStream.destroyed) {
          this.errorStream.write(logLine);
        } else {
          fs.appendFile(
            path.join(LOG_DIR, `api-error-${date}.log`),
            logLine,
            () => {}
          );
        }
      }
    } catch {
      // Failure isolation: never crash the API if logging to file fails
    }
  }

  public async close(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.mainStream && !this.mainStream.destroyed) {
      promises.push(
        new Promise<void>((resolve) => {
          this.mainStream?.end(() => resolve());
        })
      );
    }

    if (this.errorStream && !this.errorStream.destroyed) {
      promises.push(
        new Promise<void>((resolve) => {
          this.errorStream?.end(() => resolve());
        })
      );
    }

    await Promise.all(promises);
    this.mainStream = null;
    this.errorStream = null;
    this.currentDate = null;
  }
}

const fileLogSinkInstance = new FileLogSink();

export function persistApiLogToFile(entry: ApiFileLogEntry): void {
  fileLogSinkInstance.write(entry);
}

export async function closeLogFileSink(): Promise<void> {
  await fileLogSinkInstance.close();
}
