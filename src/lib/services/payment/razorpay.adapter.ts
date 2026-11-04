import crypto from "node:crypto";
import { getPaymentConfig } from "@/config/payment";
import { AppError } from "@/lib/errors/app-error";
import type {
  CapturePaymentParams,
  CreateOrderParams,
  GatewayOrderResult,
  GatewayRefundResult,
  GatewayVerificationResult,
  GatewayWebhookResult,
  PaymentGatewayAdapter,
  RawWebhookParams,
  RefundPaymentParams,
  VerifyPaymentParams,
} from "./payment-gateway.interface";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

interface RazorpayOrderResponse {
  id: string;
  entity: "order";
  amount: number;
  currency: string;
  status: string;
  receipt?: string | null;
  notes?: Record<string, string>;
  created_at: number;
}

interface RazorpayPaymentResponse {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: string;
  order_id?: string | null;
  method?: string;
  captured?: boolean;
  notes?: Record<string, string>;
  created_at: number;
}

interface RazorpayRefundResponse {
  id: string;
  entity: "refund";
  amount: number;
  currency: string;
  payment_id: string;
  status: string;
  notes?: Record<string, string>;
}

export class RazorpayAdapter implements PaymentGatewayAdapter {
  readonly providerName = "razorpay" as const;

  constructor(
    private configOverride?: Partial<{
      keyId: string;
      keySecret: string;
      webhookSecret: string;
      autoCapture: boolean;
    }>
  ) {}

  private getCredentials() {
    const config = getPaymentConfig();
    const rzp = config.providers.razorpay;

    const keyId = this.configOverride?.keyId || rzp.keyId;
    const keySecret = this.configOverride?.keySecret || rzp.keySecret;
    const webhookSecret = this.configOverride?.webhookSecret || rzp.webhookSecret || keySecret;
    const autoCapture = this.configOverride?.autoCapture ?? config.autoCapture;

    if (!keyId || !keySecret) {
      throw new AppError(
        "Razorpay credentials are not configured.",
        500,
        "razorpay_credentials_missing",
      );
    }

    return {
      keyId,
      keySecret,
      webhookSecret,
      autoCapture,
    };
  }

  private getAuthHeader(keyId: string, keySecret: string): string {
    return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
  }

  private async fetchApi<T>(
    endpoint: string,
    options: RequestInit = {},
    attempts = 3,
  ): Promise<T> {
    const { keyId, keySecret } = this.getCredentials();
    const url = `${RAZORPAY_API_BASE}${endpoint}`;

    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, {
          ...options,
          headers: {
            Authorization: this.getAuthHeader(keyId, keySecret),
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
        });

        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          let parsed: any = null;
          try {
            parsed = JSON.parse(bodyText);
          } catch {}

          const msg =
            parsed?.error?.description ||
            `Razorpay HTTP ${res.status}: ${bodyText || res.statusText}`;

          // Non-retryable 4xx client errors
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw new AppError(msg, res.status, "razorpay_client_error");
          }

          throw new Error(msg);
        }

        return (await res.json()) as T;
      } catch (err: any) {
        lastError = err;
        if (err instanceof AppError) throw err;
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
        }
      }
    }

    throw new AppError(
      lastError?.message || "Razorpay API request failed after retries.",
      502,
      "razorpay_gateway_error",
    );
  }

  async createOrder(params: CreateOrderParams): Promise<GatewayOrderResult> {
    const { keyId } = this.getCredentials();
    // Razorpay receipt has a 40 character maximum limit
    const safeReceipt = params.receipt.slice(0, 40);

    const order = await this.fetchApi<RazorpayOrderResponse>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency.toUpperCase(),
        receipt: safeReceipt,
        notes: params.notes,
      }),
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      provider: "razorpay",
      rawOrder: order,
      checkoutPayload: {
        keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "MitFloww",
        description: params.description || "MitFloww Secure Payment",
        notes: params.notes,
        prefill: params.customer,
        themeColor: params.themeColor || "#2563EB",
      },
    };
  }

  verifySignature(params: { orderId: string; paymentId: string; signature: string }): boolean {
    const { keySecret } = this.getCredentials();
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${params.orderId}|${params.paymentId}`)
      .digest("hex");

    const signatureBuffer = Buffer.from(params.signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    return (
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    );
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<GatewayVerificationResult> {
    const { keySecret, autoCapture } = this.getCredentials();

    if (!params.orderId || !params.paymentId) {
      throw new AppError(
        "Missing orderId or paymentId for verification.",
        400,
        "invalid_verification_input",
      );
    }

    // 1. Cryptographic HMAC check
    if (params.signature) {
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${params.orderId}|${params.paymentId}`)
        .digest("hex");

      const signatureBuffer = Buffer.from(params.signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      const isValid =
        signatureBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

      if (!isValid) {
        throw new AppError(
          "Invalid payment signature.",
          400,
          "signature_verification_failed",
        );
      }
    }

    // 2. Direct server-to-server confirmation against Razorpay API
    const payment = await this.fetchApi<RazorpayPaymentResponse>(
      `/payments/${encodeURIComponent(params.paymentId)}`,
    );

    if (payment.order_id && payment.order_id !== params.orderId) {
      throw new AppError(
        `Payment ${params.paymentId} does not belong to order ${params.orderId}.`,
        400,
        "order_mismatch",
      );
    }

    let status: "captured" | "authorized" | "failed" | "pending" = "pending";

    if (payment.status === "captured") {
      status = "captured";
    } else if (payment.status === "authorized") {
      if (autoCapture) {
        // Capture funds automatically
        const captured = await this.capturePayment({
          paymentId: params.paymentId,
          amount: payment.amount,
          currency: payment.currency,
        });
        status = captured.status;
      } else {
        status = "authorized";
      }
    } else if (payment.status === "failed") {
      status = "failed";
    }

    return {
      verified: status === "captured" || status === "authorized",
      provider: "razorpay",
      orderId: params.orderId,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status,
      rawResponse: payment,
    };
  }

  async capturePayment(params: CapturePaymentParams): Promise<GatewayVerificationResult> {
    try {
      const payment = await this.fetchApi<RazorpayPaymentResponse>(
        `/payments/${encodeURIComponent(params.paymentId)}/capture`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: params.amount,
            currency: params.currency.toUpperCase(),
          }),
        },
      );

      return {
        verified: payment.status === "captured",
        provider: "razorpay",
        orderId: payment.order_id || "",
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status === "captured" ? "captured" : "failed",
        rawResponse: payment,
      };
    } catch (err: any) {
      // Reconcile before failing: check if capture actually succeeded
      const check = await this.fetchApi<RazorpayPaymentResponse>(
        `/payments/${encodeURIComponent(params.paymentId)}`,
      ).catch(() => null);

      if (check && check.status === "captured") {
        return {
          verified: true,
          provider: "razorpay",
          orderId: check.order_id || "",
          paymentId: check.id,
          amount: check.amount,
          currency: check.currency,
          status: "captured",
          rawResponse: check,
        };
      }

      throw err;
    }
  }

  async getPaymentStatus(params: {
    orderId?: string;
    paymentId?: string;
  }): Promise<GatewayVerificationResult> {
    if (params.paymentId) {
      const payment = await this.fetchApi<RazorpayPaymentResponse>(
        `/payments/${encodeURIComponent(params.paymentId)}`,
      );

      return {
        verified: payment.status === "captured" || payment.status === "authorized",
        provider: "razorpay",
        orderId: payment.order_id || params.orderId || "",
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status:
          payment.status === "captured"
            ? "captured"
            : payment.status === "authorized"
              ? "authorized"
              : payment.status === "failed"
                ? "failed"
                : "pending",
        rawResponse: payment,
      };
    }

    if (params.orderId) {
      const orderPayments = await this.fetchApi<{
        entity: "collection";
        items: RazorpayPaymentResponse[];
      }>(`/orders/${encodeURIComponent(params.orderId)}/payments`);

      const latest = orderPayments.items?.[0];
      if (!latest) {
        return {
          verified: false,
          provider: "razorpay",
          orderId: params.orderId,
          paymentId: "",
          amount: 0,
          currency: "INR",
          status: "pending",
          rawResponse: orderPayments,
        };
      }

      return {
        verified: latest.status === "captured" || latest.status === "authorized",
        provider: "razorpay",
        orderId: params.orderId,
        paymentId: latest.id,
        amount: latest.amount,
        currency: latest.currency,
        status:
          latest.status === "captured"
            ? "captured"
            : latest.status === "authorized"
              ? "authorized"
              : latest.status === "failed"
                ? "failed"
                : "pending",
        rawResponse: latest,
      };
    }

    throw new AppError(
      "Either orderId or paymentId is required to query payment status.",
      400,
      "missing_query_id",
    );
  }

  async refundPayment(params: RefundPaymentParams): Promise<GatewayRefundResult> {
    const refund = await this.fetchApi<RazorpayRefundResponse>(
      `/payments/${encodeURIComponent(params.paymentId)}/refund`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: params.amount,
          notes: {
            reason: params.reason || "Customer refund",
            idempotencyKey: params.idempotencyKey,
          },
        }),
      },
    );

    return {
      refundId: refund.id,
      paymentId: params.paymentId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status === "processed" ? "processed" : "pending",
      rawResponse: refund,
    };
  }

  async parseAndVerifyWebhook(params: RawWebhookParams): Promise<GatewayWebhookResult> {
    const { webhookSecret } = this.getCredentials();

    const signatureHeader =
      params.headers["x-razorpay-signature"] ||
      params.headers["X-Razorpay-Signature"];
    const signature =
      Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!signature) {
      throw new AppError("Missing webhook signature header.", 400, "missing_signature");
    }

    const rawBuffer = Buffer.isBuffer(params.rawBody)
      ? params.rawBody
      : Buffer.from(params.rawBody, "utf8");

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBuffer)
      .digest("hex");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    const isMatch =
      sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!isMatch) {
      throw new AppError("Invalid webhook signature.", 400, "invalid_signature");
    }

    let payload: any = null;
    try {
      payload = JSON.parse(rawBuffer.toString("utf8"));
    } catch {
      throw new AppError("Invalid webhook JSON payload.", 400, "malformed_json");
    }

    const event = String(payload?.event || "unknown");
    const eventId = String(
      payload?.event_id ||
        params.headers["x-razorpay-event-id"] ||
        `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    );

    const paymentEntity: RazorpayPaymentResponse | undefined =
      payload?.payload?.payment?.entity;
    const orderEntity: RazorpayOrderResponse | undefined =
      payload?.payload?.order?.entity;
    const refundEntity: RazorpayRefundResponse | undefined =
      payload?.payload?.refund?.entity;

    const orderId = paymentEntity?.order_id || orderEntity?.id || null;
    const paymentId = paymentEntity?.id || refundEntity?.payment_id || null;
    const amount = paymentEntity?.amount ?? orderEntity?.amount ?? refundEntity?.amount ?? null;
    const currency = paymentEntity?.currency ?? orderEntity?.currency ?? refundEntity?.currency ?? null;

    let status: GatewayWebhookResult["status"] = "unknown";
    if (event === "payment.captured" || event === "order.paid") {
      status = "captured";
    } else if (event === "payment.authorized") {
      status = "authorized";
    } else if (event === "payment.failed") {
      status = "failed";
    } else if (event === "refund.processed") {
      status = "refunded";
    } else {
      status = "pending";
    }

    return {
      signatureValid: true,
      provider: "razorpay",
      eventId,
      eventType: event,
      orderId,
      paymentId,
      amount,
      currency,
      status,
      rawPayload: payload,
    };
  }
}

export const razorpayAdapter = new RazorpayAdapter();
