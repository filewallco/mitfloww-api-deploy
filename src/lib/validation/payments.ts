import { z } from "zod";

export const feePreviewQuerySchema = z.object({
  referenceType: z.enum([
    "project_final",
    "project_advance",
    "asset_purchase",
    "credit_pack",
    "storage_addon",
    "plan_upgrade",
  ]),
  referenceId: z.string().trim().min(1).max(255),
  currency: z.string().trim().length(3).optional(),
  preferredProvider: z.enum(["razorpay", "cashfree", "stripe"]).optional(),
  shareToken: z.string().trim().min(1).max(255).optional(),
});

export const createPaymentOrderSchema = z.object({
  referenceType: z.enum([
    "project_final",
    "project_advance",
    "asset_purchase",
    "credit_pack",
    "storage_addon",
    "plan_upgrade",
  ]),
  referenceId: z.string().trim().min(1).max(255),
  preferredProvider: z.enum(["razorpay", "cashfree", "stripe"]).optional(),
  idempotencyKey: z.string().trim().min(8).max(255).optional(),
  shareToken: z.string().trim().min(1).max(255).optional(),
  customer: z
    .object({
      name: z.string().trim().max(120).optional(),
      email: z.string().trim().email().max(255).optional(),
      contact: z.string().trim().max(32).optional(),
    })
    .optional(),
  description: z.string().trim().max(255).optional(),
  themeColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const verifyPaymentSchema = z.object({
  orderId: z.string().trim().min(1).max(255),
  paymentId: z.string().trim().min(1).max(255),
  signature: z.string().trim().max(255).optional(),
});

export const refundPaymentSchema = z.object({
  paymentTransactionId: z.string().trim().uuid(),
  amount: z.number().int().positive().optional(),
  reason: z.string().trim().max(255).optional(),
});

export const paymentStatusQuerySchema = z.object({
  orderId: z.string().trim().max(255).optional(),
  paymentId: z.string().trim().max(255).optional(),
  transactionId: z.string().trim().uuid().optional(),
});

