import { db } from "@/lib/db/client";
import {
  paymentOutboxEvents,
  type PaymentOutboxEventRecord,
} from "@/lib/db/schema";
import { emailService } from "@/lib/email/email-service";
import { storage } from "@/lib/storage";
import { paymentLogger } from "@/lib/logger/payment-logger";
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";

export class PaymentOutboxWorker {
  private isProcessing = false;

  triggerImmediate(): void {
    setImmediate(() => {
      this.processPending().catch((err) => {
        paymentLogger.error("payment.outbox_immediate_error", {
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }

  async processPending(limit = 20): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.isProcessing) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const now = new Date();

      // Acquire leases using Postgres FOR UPDATE SKIP LOCKED
      const claimedEvents: PaymentOutboxEventRecord[] = await db.transaction(async (tx) => {
        const candidates = await tx
          .select()
          .from(paymentOutboxEvents)
          .where(
            and(
              or(
                eq(paymentOutboxEvents.status, "pending"),
                and(
                  eq(paymentOutboxEvents.status, "processing"),
                  lte(paymentOutboxEvents.leaseExpiresAt, now),
                ),
              ),
              sql`${paymentOutboxEvents.attempts} < ${paymentOutboxEvents.maxAttempts}`,
              or(
                isNull(paymentOutboxEvents.nextRetryAt),
                lte(paymentOutboxEvents.nextRetryAt, now),
              ),
            ),
          )
          .orderBy(paymentOutboxEvents.createdAt)
          .limit(limit)
          .for("update", { skipLocked: true });

        if (candidates.length === 0) return [];

        const leaseExpiresAt = new Date(Date.now() + 60 * 1000); // 60s lease
        const candidateIds = candidates.map((c) => c.id);

        for (const candidate of candidates) {
          await tx
            .update(paymentOutboxEvents)
            .set({
              status: "processing",
              attempts: sql`${paymentOutboxEvents.attempts} + 1`,
              leaseExpiresAt,
            })
            .where(eq(paymentOutboxEvents.id, candidate.id));
        }

        return candidates;
      });

      processed = claimedEvents.length;

      for (const event of claimedEvents) {
        try {
          await this.executeEvent(event);

          await db
            .update(paymentOutboxEvents)
            .set({
              status: "delivered",
              processedAt: new Date(),
              lastError: null,
            })
            .where(eq(paymentOutboxEvents.id, event.id));

          succeeded++;

          await paymentLogger.info("outbox.event_delivered", {
            paymentTransactionId: event.paymentTransactionId,
            data: { eventId: event.id, eventType: event.eventType },
          });
        } catch (err: any) {
          failed++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          const currentAttempt = event.attempts + 1;
          const isDeadLetter = currentAttempt >= event.maxAttempts;

          // Exponential backoff: 5s, 10s, 20s, 40s, 80s
          const backoffDelaySeconds = Math.min(300, 5 * Math.pow(2, event.attempts));
          const nextRetryAt = new Date(Date.now() + backoffDelaySeconds * 1000);

          await db
            .update(paymentOutboxEvents)
            .set({
              status: isDeadLetter ? "dead_letter" : "pending",
              nextRetryAt: isDeadLetter ? null : nextRetryAt,
              lastError: errorMessage,
            })
            .where(eq(paymentOutboxEvents.id, event.id));

          await paymentLogger.error(isDeadLetter ? "outbox.dead_letter" : "outbox.retry_scheduled", {
            paymentTransactionId: event.paymentTransactionId,
            errorMessage,
            data: {
              eventId: event.id,
              eventType: event.eventType,
              attempt: currentAttempt,
              maxAttempts: event.maxAttempts,
              nextRetryAt: isDeadLetter ? null : nextRetryAt.toISOString(),
            },
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, succeeded, failed };
  }

  private async executeEvent(event: PaymentOutboxEventRecord): Promise<void> {
    const payload = (event.payload || {}) as Record<string, any>;

    switch (event.eventType) {
      case "payment.project_final.r2_cleanup": {
        const filesToClean = Array.isArray(payload.files) ? payload.files : [];
        for (const file of filesToClean) {
          if (file.bucket && file.key) {
            await storage.deleteFile({ bucket: file.bucket, key: file.key }).catch(() => {});
          }
        }
        break;
      }

      case "payment.email.creator_payment": {
        if (payload.creatorEmail) {
          await emailService.sendCreatorPaymentReceivedEmail({
            creatorEmail: payload.creatorEmail,
            creatorName: payload.creatorName,
            projectTitle: payload.projectTitle || "Project",
            payerName: payload.payerName || payload.clientName || "Client",
            amountFormatted: payload.amountFormatted || "",
            invoiceNumber: payload.invoiceNumber || "",
            projectId: payload.projectId,
          });
        }
        break;
      }

      case "payment.email.client_invoice": {
        if (payload.clientEmail) {
          await emailService.sendInvoicePaymentSuccessEmail({
            clientEmail: payload.clientEmail,
            clientName: payload.clientName,
            projectTitle: payload.projectTitle || "Project",
            invoiceNumber: payload.invoiceNumber || "",
            amountFormatted: payload.amountFormatted || "",
            galleryUrl: payload.galleryUrl,
          });
        }
        break;
      }

      case "payment.email.advance_received": {
        if (payload.creatorEmail) {
          await emailService.sendAdvancePaymentReceivedEmail({
            creatorEmail: payload.creatorEmail,
            creatorName: payload.creatorName,
            projectTitle: payload.projectTitle || "Project",
            clientName: payload.payerName || payload.clientName || "Client",
            amountFormatted: payload.amountFormatted || "",
            projectId: payload.projectId,
          });
        }
        break;
      }

      case "payment.email.asset_delivery": {
        if (payload.buyerEmail && payload.assetTitle && payload.downloadUrl) {
          await emailService.sendAssetPurchaseDeliveryEmail({
            buyerEmail: payload.buyerEmail,
            assetTitle: payload.assetTitle,
            creatorName: payload.sellerName || payload.creatorName || "Creator",
            amountFormatted: payload.amountFormatted || "",
            downloadUrl: payload.downloadUrl,
          });
        }
        break;
      }

      default:
        // Generic or custom outbox event
        break;
    }
  }

  async retryDeadLetter(eventId: string): Promise<boolean> {
    const [event] = await db
      .select()
      .from(paymentOutboxEvents)
      .where(eq(paymentOutboxEvents.id, eventId))
      .limit(1);

    if (!event) return false;

    await db
      .update(paymentOutboxEvents)
      .set({
        status: "pending",
        attempts: 0,
        nextRetryAt: new Date(),
        lastError: null,
      })
      .where(eq(paymentOutboxEvents.id, eventId));

    this.triggerImmediate();
    return true;
  }
}

export const paymentOutboxWorker = new PaymentOutboxWorker();
