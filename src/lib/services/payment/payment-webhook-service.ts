import { db } from "@/lib/db/client";
import {
  paymentTransactions,
  paymentWebhookEvents,
  paymentRefunds,
  type PaymentWebhookEventRecord,
} from "@/lib/db/schema";
import { gatewayResolver } from "./gateway-resolver";
import { paymentService } from "./payment-service";
import { paymentLogger } from "@/lib/logger/payment-logger";
import { and, eq, lte, sql } from "drizzle-orm";

export class PaymentWebhookService {
  async handleWebhook(params: {
    providerName: "razorpay" | "cashfree" | "stripe";
    rawBody: Buffer | string;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<{ status: string; eventId: string; processed: boolean; duplicate?: boolean }> {
    const { providerName, rawBody, headers } = params;
    const adapter = gatewayResolver.getAdapter(providerName);

    // 1. Verify webhook signature and parse raw payload
    const parsedWebhook = await adapter.parseAndVerifyWebhook({
      rawBody,
      headers,
    });

    const { eventId, eventType, orderId, paymentId, status } = parsedWebhook;

    // 2. Webhook Event Deduplication & Ingestion
    const existingEvent = await db
      .select()
      .from(paymentWebhookEvents)
      .where(
        and(
          eq(paymentWebhookEvents.provider, providerName),
          eq(paymentWebhookEvents.eventId, eventId),
        ),
      )
      .limit(1);

    if (existingEvent.length > 0) {
      const evt = existingEvent[0];
      if (evt.status === "processed") {
        await paymentLogger.info("webhook.duplicate_ignored", {
          provider: providerName,
          data: { eventId, eventType, orderId, paymentId },
        });

        return {
          status: "processed",
          eventId,
          processed: true,
          duplicate: true,
        };
      }

      if (evt.status === "processing" && evt.leaseExpiresAt && evt.leaseExpiresAt > new Date()) {
        return {
          status: "processing",
          eventId,
          processed: false,
          duplicate: true,
        };
      }
    } else {
      // Ingest event with status 'received'
      await db
        .insert(paymentWebhookEvents)
        .values({
          provider: providerName,
          eventId,
          eventType,
          status: "received",
          payload: parsedWebhook.rawPayload as any,
          attempts: 1,
        })
        .onConflictDoNothing();
    }

    // 3. Acquire 60-second lease to process
    const leaseExpiresAt = new Date(Date.now() + 60 * 1000);
    await db
      .update(paymentWebhookEvents)
      .set({
        status: "processing",
        leaseExpiresAt,
      })
      .where(
        and(
          eq(paymentWebhookEvents.provider, providerName),
          eq(paymentWebhookEvents.eventId, eventId),
        ),
      );

    try {
      // 4. Find associated internal transaction
      let transaction = null;
      if (orderId) {
        const [byOrder] = await db
          .select()
          .from(paymentTransactions)
          .where(eq(paymentTransactions.orderId, orderId))
          .limit(1);
        transaction = byOrder;
      }

      if (!transaction && paymentId) {
        const [byPayment] = await db
          .select()
          .from(paymentTransactions)
          .where(eq(paymentTransactions.paymentId, paymentId))
          .limit(1);
        transaction = byPayment;
      }

      if (transaction) {
        // Link transaction ID to webhook event
        await db
          .update(paymentWebhookEvents)
          .set({ paymentTransactionId: transaction.id })
          .where(
            and(
              eq(paymentWebhookEvents.provider, providerName),
              eq(paymentWebhookEvents.eventId, eventId),
            ),
          );

        // 5. Monotonic State Handling
        if (status === "captured") {
          // Finalize payment and grant entitlements
          await paymentService.finalizeCapturedPayment({
            paymentTransactionId: transaction.id,
            paymentId: paymentId || transaction.paymentId || "pay_webhook",
            provider: providerName,
          });
        } else if (status === "failed") {
          // Monotonic guard: never downgrade an already captured or refunded payment
          if (
            transaction.status !== "captured" &&
            transaction.status !== "refunded" &&
            transaction.status !== "partially_refunded"
          ) {
            await db
              .update(paymentTransactions)
              .set({
                status: "failed",
                failureCode: `webhook_${eventType}`,
                failureReason: "Payment failed according to gateway webhook.",
                updatedAt: new Date(),
              })
              .where(eq(paymentTransactions.id, transaction.id));

            await paymentLogger.warn("webhook.payment_failed", {
              paymentTransactionId: transaction.id,
              provider: providerName,
              providerOrderId: orderId,
              providerPaymentId: paymentId,
              previousStatus: transaction.status,
              newStatus: "failed",
            });
          } else {
            await paymentLogger.warn("webhook.monotone_violation_prevented", {
              paymentTransactionId: transaction.id,
              provider: providerName,
              providerOrderId: orderId,
              providerPaymentId: paymentId,
              data: {
                ignoredEvent: eventType,
                currentStatus: transaction.status,
              },
            });
          }
        } else if (status === "refunded") {
          if (
            transaction.status === "captured" ||
            transaction.status === "partially_refunded"
          ) {
            await db
              .update(paymentTransactions)
              .set({
                status: "refunded",
                amountRefunded: transaction.amount,
                refundedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(paymentTransactions.id, transaction.id));

            await paymentLogger.info("webhook.payment_refunded", {
              paymentTransactionId: transaction.id,
              provider: providerName,
              providerOrderId: orderId,
              providerPaymentId: paymentId,
              previousStatus: transaction.status,
              newStatus: "refunded",
            });
          }
        }
      }

      // 6. Mark webhook event as processed
      await db
        .update(paymentWebhookEvents)
        .set({
          status: "processed",
          processedAt: new Date(),
          lastError: null,
        })
        .where(
          and(
            eq(paymentWebhookEvents.provider, providerName),
            eq(paymentWebhookEvents.eventId, eventId),
          ),
        );

      await paymentLogger.info("webhook.processed", {
        provider: providerName,
        data: { eventId, eventType, orderId, paymentId },
      });

      return {
        status: "processed",
        eventId,
        processed: true,
      };
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await db
        .update(paymentWebhookEvents)
        .set({
          status: "failed",
          lastError: errorMessage,
        })
        .where(
          and(
            eq(paymentWebhookEvents.provider, providerName),
            eq(paymentWebhookEvents.eventId, eventId),
          ),
        );

      await paymentLogger.error("webhook.processing_failed", {
        provider: providerName,
        errorMessage,
        data: { eventId, eventType, orderId, paymentId },
      });

      throw err;
    }
  }
}

export const paymentWebhookService = new PaymentWebhookService();
