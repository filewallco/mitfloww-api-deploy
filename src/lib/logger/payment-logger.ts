import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db/client";
import { paymentAuditLogs, type NewPaymentAuditLogRecord } from "@/lib/db/schema";
import { sanitizeLogValue } from "./sanitizer";
import { getRequestContext } from "./context";

export type PaymentLogLevel = "debug" | "info" | "warn" | "error" | "critical";

const PAYMENT_LOG_DIR = process.env.PAYMENT_LOG_DIR
  ? path.resolve(process.env.PAYMENT_LOG_DIR)
  : path.resolve(process.cwd(), "logs");

const RETENTION_DAYS = 14;

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(PAYMENT_LOG_DIR)) {
      fs.mkdirSync(PAYMENT_LOG_DIR, { recursive: true });
    }
  } catch {}
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
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      },
      process.env.NODE_ENV === "development" ? 2 : undefined,
    );
  } catch {
    return "[Unserializable]";
  }
}

class PaymentFileSink {
  private mainStream: fs.WriteStream | null = null;
  private errorStream: fs.WriteStream | null = null;
  private currentDate: string | null = null;

  constructor() {
    ensureLogDir();
  }

  private rotateIfNeeded(dateStr: string): void {
    if (this.currentDate === dateStr && this.mainStream && this.errorStream) {
      return;
    }

    try {
      this.mainStream?.end();
    } catch {}
    try {
      this.errorStream?.end();
    } catch {}

    this.currentDate = dateStr;
    ensureLogDir();

    const mainPath = path.join(PAYMENT_LOG_DIR, `payment-${dateStr}.log`);
    const errorPath = path.join(PAYMENT_LOG_DIR, `payment-error-${dateStr}.log`);

    try {
      this.mainStream = fs.createWriteStream(mainPath, { flags: "a" });
      this.mainStream.on("error", () => {
        this.mainStream = null;
      });
    } catch {
      this.mainStream = null;
    }

    try {
      this.errorStream = fs.createWriteStream(errorPath, { flags: "a" });
      this.errorStream.on("error", () => {
        this.errorStream = null;
      });
    } catch {
      this.errorStream = null;
    }

    this.cleanOldLogs();
  }

  private cleanOldLogs(): void {
    try {
      if (!fs.existsSync(PAYMENT_LOG_DIR)) return;
      const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(PAYMENT_LOG_DIR);

      for (const file of files) {
        if (!file.startsWith("payment-")) continue;
        const filePath = path.join(PAYMENT_LOG_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {}
  }

  write(entry: Record<string, unknown>): void {
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      this.rotateIfNeeded(dateStr);

      const line = `${safeStringify(entry)}\n`;
      this.mainStream?.write(line);

      const level = String(entry.severity || entry.level || "");
      if (level === "error" || level === "critical" || level === "warn") {
        this.errorStream?.write(line);
      }
    } catch {}
  }
}

const paymentFileSink = new PaymentFileSink();

export interface PaymentAuditEntry {
  severity?: PaymentLogLevel;
  operation: string;
  paymentTransactionId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  provider?: string | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  providerRefundId?: string | null;
  idempotencyKey?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  outcome?: "success" | "failure" | "conflict" | "noop";
  errorCode?: string | null;
  errorMessage?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  actorId?: string | null;
  data?: Record<string, unknown>;
  tx?: any; // optional transactional executor to write atomically with state change
}

export class PaymentLogger {
  async audit(entry: PaymentAuditEntry): Promise<void> {
    const timestamp = new Date();
    const reqContext = getRequestContext();
    const severity = entry.severity || "info";

    const correlationId =
      entry.correlationId || reqContext?.correlationId || (reqContext?.requestId ?? null);
    const requestId = entry.requestId || reqContext?.requestId || null;
    const actorId = entry.actorId || reqContext?.userId || null;

    const sanitizedData = (sanitizeLogValue(entry.data || {}) || {}) as Record<string, unknown>;

    const filePayload = {
      timestamp: timestamp.toISOString(),
      service: "payment",
      severity,
      operation: entry.operation,
      paymentTransactionId: entry.paymentTransactionId ?? null,
      referenceType: entry.referenceType ?? null,
      referenceId: entry.referenceId ?? null,
      provider: entry.provider ?? "razorpay",
      providerOrderId: entry.providerOrderId ?? null,
      providerPaymentId: entry.providerPaymentId ?? null,
      providerRefundId: entry.providerRefundId ?? null,
      previousStatus: entry.previousStatus ?? null,
      newStatus: entry.newStatus ?? null,
      outcome: entry.outcome ?? "success",
      errorCode: entry.errorCode ?? null,
      errorMessage: entry.errorMessage ?? null,
      correlationId,
      requestId,
      actorId,
      data: sanitizedData,
    };

    // 1. Physical JSON file logging
    paymentFileSink.write(filePayload);

    // 2. Database audit logging (mitfloww.payment_audit_logs)
    const auditRecord: NewPaymentAuditLogRecord = {
      timestamp,
      severity,
      operation: entry.operation,
      paymentTransactionId: entry.paymentTransactionId ?? null,
      referenceType: entry.referenceType ?? null,
      referenceId: entry.referenceId ?? null,
      provider: entry.provider ?? "razorpay",
      providerOrderId: entry.providerOrderId ?? null,
      providerPaymentId: entry.providerPaymentId ?? null,
      providerRefundId: entry.providerRefundId ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
      previousStatus: entry.previousStatus ?? null,
      newStatus: entry.newStatus ?? null,
      outcome: entry.outcome ?? "success",
      errorCode: entry.errorCode ?? null,
      errorMessage: entry.errorMessage ?? null,
      requestId,
      correlationId,
      actorId,
      data: sanitizedData,
    };

    try {
      const executor = entry.tx || db;
      if (entry.tx) {
        await executor.insert(paymentAuditLogs).values(auditRecord);
      } else {
        // Fire-and-forget when not in an explicit transaction
        void executor.insert(paymentAuditLogs).values(auditRecord).catch(() => {});
      }
    } catch (err) {
      // Never let logging failure crash payment processing
      paymentFileSink.write({
        timestamp: new Date().toISOString(),
        severity: "error",
        operation: "payment.audit_log_failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Convenience helper wrappers
  info(operation: string, meta: Omit<PaymentAuditEntry, "operation" | "severity"> = {}) {
    return this.audit({ ...meta, operation, severity: "info" });
  }

  warn(operation: string, meta: Omit<PaymentAuditEntry, "operation" | "severity"> = {}) {
    return this.audit({ ...meta, operation, severity: "warn" });
  }

  error(operation: string, meta: Omit<PaymentAuditEntry, "operation" | "severity"> = {}) {
    return this.audit({ ...meta, operation, severity: "error" });
  }
}

export const paymentLogger = new PaymentLogger();

