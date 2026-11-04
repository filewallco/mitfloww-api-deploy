import { Router } from "express";
import { asyncHandler, parseWithSchema, sendSuccess } from "@/lib/api/route";
import {
  feePreviewQuerySchema,
  createPaymentOrderSchema,
  verifyPaymentSchema,
  refundPaymentSchema,
  paymentStatusQuerySchema,
} from "@/lib/validation/payments";
import { paymentService } from "@/lib/services/payment/payment-service";
import { paymentWebhookService } from "@/lib/services/payment/payment-webhook-service";
import { paymentOutboxWorker } from "@/lib/services/payment/payment-outbox-worker";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { AppError } from "@/lib/errors/app-error";

export const paymentRouter = Router();

// GET /api/payment/fee-preview - Transparent calculation breakdown
paymentRouter.get(
  "/fee-preview",
  asyncHandler(async (req, res) => {
    const query = parseWithSchema(feePreviewQuerySchema, req.query);
    const actorUserId = (req as any).authenticatedUserId || null;

    const result = await paymentService.getFeePreview({
      referenceType: query.referenceType,
      referenceId: query.referenceId,
      preferredProvider: query.preferredProvider,
      shareToken: query.shareToken,
      actorUserId,
    });

    return sendSuccess(res, result);
  }),
);

// POST /api/payment/orders - Authoritative price lookup and provider order creation
paymentRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const input = parseWithSchema(createPaymentOrderSchema, req.body);
    const actorUserId = (req as any).authenticatedUserId || null;

    const result = await paymentService.createOrder({
      ...input,
      actorUserId,
    });

    return sendSuccess(res, result, { status: 201 });
  }),
);

// POST /api/payment/verify - Cryptographic signature check & atomic entitlement grant
paymentRouter.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const input = parseWithSchema(verifyPaymentSchema, req.body);

    const result = await paymentService.verifyPayment({
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    });

    return sendSuccess(res, result);
  }),
);

// GET /api/payment/status - Authoritative transaction status query
paymentRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const query = parseWithSchema(paymentStatusQuerySchema, req.query);

    const transaction = await paymentService.getAuthoritativeStatus({
      orderId: query.orderId,
      paymentId: query.paymentId,
      transactionId: query.transactionId,
    });

    if (!transaction) {
      throw new AppError("Payment transaction not found.", 404, "transaction_not_found");
    }

    return sendSuccess(res, { transaction });
  }),
);

// POST /api/payment/refund - Admin/Creator payment refund
paymentRouter.post(
  "/refund",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const input = parseWithSchema(refundPaymentSchema, req.body);

    const result = await paymentService.refundPayment({
      paymentTransactionId: input.paymentTransactionId,
      amount: input.amount,
      reason: input.reason,
      actorUserId: actor.id,
    });

    return sendSuccess(res, result);
  }),
);

// POST /api/payment/outbox/retry-dead-letter - Retry a dead-letter outbox event
paymentRouter.post(
  "/outbox/retry-dead-letter",
  asyncHandler(async (req, res) => {
    await resolveActiveActor(req);
    const eventId = String(req.body?.eventId || "");
    if (!eventId) {
      throw new AppError("eventId is required.", 400, "missing_event_id");
    }

    const retried = await paymentOutboxWorker.retryDeadLetter(eventId);
    return sendSuccess(res, { retried });
  }),
);

// POST /api/payment/webhook/:provider - Ingest provider webhook with raw body verification
paymentRouter.post(
  "/webhook/:provider",
  asyncHandler(async (req, res) => {
    const providerParam = String(req.params.provider || "").toLowerCase();
    if (providerParam !== "razorpay" && providerParam !== "cashfree" && providerParam !== "stripe") {
      throw new AppError("Invalid payment provider webhook path.", 400, "invalid_provider");
    }

    const rawBody: Buffer | string =
      (req as any).rawBody ||
      (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));

    const result = await paymentWebhookService.handleWebhook({
      providerName: providerParam as any,
      rawBody,
      headers: req.headers,
    });

    return res.status(200).json({ success: true, ...result });
  }),
);
