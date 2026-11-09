import crypto from "node:crypto";
import {
  type PaymentGatewayAdapter,
  type CreateOrderParams,
  type GatewayOrderResult,
  type VerifyPaymentParams,
  type GatewayVerificationResult,
  type CapturePaymentParams,
  type RefundPaymentParams,
  type GatewayRefundResult,
  type RawWebhookParams,
  type GatewayWebhookResult,
} from "./payment-gateway.interface";
import { getPaymentConfig } from "@/config/payment";
import { AppError } from "@/lib/errors/app-error";
import { paymentLogger } from "@/lib/logger/payment-logger";

interface CashfreeOrderApiResponse {
  cf_order_id: number;
  order_id: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED";
  payment_session_id: string;
  order_amount: number;
  order_currency: string;
}

interface CashfreePaymentEntity {
  cf_payment_id: number;
  order_id: string;
  payment_status: "SUCCESS" | "FAILED" | "PENDING" | "USER_DROPPED" | "CANCELLED";
  payment_amount: number;
  payment_currency: string;
  payment_message?: string;
  payment_time?: string;
  bank_reference?: string;
}

interface CashfreeRefundApiResponse {
  cf_refund_id: string;
  refund_id: string;
  order_id: string;
  refund_status: "SUCCESS" | "PENDING" | "FAILED";
  refund_amount: number;
  refund_currency: string;
}

export class CashfreeAdapter implements PaymentGatewayAdapter {
  readonly providerName = "cashfree" as const;

  constructor(
    private configOverride?: Partial<{
      appId: string;
      secretKey: string;
      webhookSecret: string;
      environment: "sandbox" | "production";
      apiVersion?: string;
      isMock?: boolean;
    }>,
  ) {}

  private getCredentials() {
    const config = getPaymentConfig();
    const cf = config.providers.cashfree;

    const appId = (this.configOverride?.appId || cf.appId || "").trim();
    const secretKey = (this.configOverride?.secretKey || cf.secretKey || "").trim();
    const webhookSecret = (this.configOverride?.webhookSecret || cf.webhookSecret || secretKey).trim();
    const environment: "sandbox" | "production" =
      this.configOverride?.environment ||
      (process.env.CASHFREE_ENVIRONMENT?.toLowerCase() === "production" ? "production" : "sandbox");

    const isExplicitMock = Boolean(
      this.configOverride?.isMock ||
      this.configOverride?.appId === "TEST123456" ||
      process.env.NODE_ENV === "test"
    );
    const isTestEnvironment = process.env.NODE_ENV === "test";

    const isPlaceholder =
      !appId ||
      !secretKey ||
      appId === "cf_test_mock_app_id" ||
      appId === "cf_test_mitfloww_sandbox" ||
      appId === "your_cashfree_app_id" ||
      secretKey === "cf_sec_mitfloww_sandbox_secret" ||
      secretKey === "your_cashfree_secret_key" ||
      secretKey.startsWith("test_secret_key");

    if (isPlaceholder && !isExplicitMock && !isTestEnvironment) {
      void paymentLogger.warn("cashfree.credentials_missing", {
        data: {
          hint: "Please set valid CASHFREE_APP_ID (starts with TEST...) and CASHFREE_SECRET_KEY in api/.env",
        },
      });
      throw new AppError(
        "Cashfree payments are temporarily unavailable. Please choose another payment method or try again later.",
        400,
        "cashfree_credentials_missing",
      );
    }

    const baseUrl =
      environment === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";

    const isMock = isExplicitMock || (isTestEnvironment && isPlaceholder);

    return {
      appId,
      secretKey,
      webhookSecret,
      environment,
      baseUrl,
      isMock,
    };
  }

  private async fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const { appId, secretKey, baseUrl, isMock } = this.getCredentials();

    // If running in development with mock sandbox credentials, return simulated response
    if (isMock) {
      return this.simulateMockResponse<T>(path, options);
    }

    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = {
      "Content-Type": "application/json",
      "x-client-id": appId,
      "x-client-secret": secretKey,
      "x-api-version": "2023-08-01",
      ...(options.headers as Record<string, string>),
    };

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err: any) {
      throw new AppError(
        `Failed to reach Cashfree API: ${err.message}`,
        502,
        "cashfree_network_error",
      );
    }

    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AppError(
        `Unexpected non-JSON response from Cashfree: ${text.slice(0, 150)}`,
        502,
        "cashfree_invalid_response",
      );
    }

    if (!response.ok) {
      let message = body?.message || body?.error || `Cashfree API error HTTP ${response.status}`;
      if (response.status === 401 || message.toLowerCase().includes("authentication failed")) {
        message = "Cashfree authentication failed. Please verify CASHFREE_APP_ID and CASHFREE_SECRET_KEY in api/.env.";
      }
      const code = body?.code || "cashfree_api_error";
      throw new AppError(message, response.status, code, body);
    }

    return body as T;
  }

  private simulateMockResponse<T>(path: string, options: RequestInit = {}): T {
    if (path.includes("/orders") && options.method === "POST") {
      let body: any = {};
      try {
        body = JSON.parse(options.body as string);
      } catch {}
      const orderId = body.order_id || `cf_order_${Date.now()}`;
      return {
        cf_order_id: Math.floor(Math.random() * 1000000),
        order_id: orderId,
        order_status: "ACTIVE",
        payment_session_id: `session_mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        order_amount: body.order_amount || 100,
        order_currency: "INR",
      } as T;
    }

    if (path.includes("/payments")) {
      return [
        {
          cf_payment_id: Math.floor(Math.random() * 10000000),
          order_id: "order_mock",
          payment_status: "SUCCESS",
          payment_amount: 100,
          payment_currency: "INR",
          payment_message: "Simulated Sandbox Payment Success",
        },
      ] as T;
    }

    if (path.includes("/refunds") && options.method === "POST") {
      return {
        cf_refund_id: `cfr_${Date.now()}`,
        refund_id: `ref_${Date.now()}`,
        order_id: "order_mock",
        refund_status: "SUCCESS",
        refund_amount: 100,
        refund_currency: "INR",
      } as T;
    }

    return {} as T;
  }

  async createOrder(params: CreateOrderParams): Promise<GatewayOrderResult> {
    const { appId, environment, isMock } = this.getCredentials();

    if (params.amount <= 0) {
      throw new AppError("Order amount must be greater than zero.", 400, "invalid_amount");
    }

    const orderId = `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    // Cashfree expects major units (Rupees with up to 2 decimal places)
    const orderAmount = Number((params.amount / 100).toFixed(2));

    const customerEmail = params.customer?.email?.trim() || "billing@mitfloww.com";
    const customerName = params.customer?.name?.trim() || "MitFloww Customer";
    const phoneRaw = (params.customer?.contact || "").replace(/[^0-9]/g, "");
    const customerPhone = phoneRaw.length >= 10 ? phoneRaw.slice(-10) : "9999999999";
    const customerId = `cust_${crypto.createHash("md5").update(customerEmail).digest("hex").slice(0, 16)}`;

    const appUrl = process.env.APP_URL || "http://localhost:3000";

    const requestBody = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: `${appUrl}/payment/verify?order_id=${orderId}&provider=cashfree`,
        notify_url: `${appUrl}/api/payment/webhook/cashfree`,
      },
      order_note: params.description || `MitFloww Order ${params.receipt}`,
      order_tags: {
        receipt: params.receipt ? params.receipt.slice(0, 40) : "",
        idempotencyKey: params.idempotencyKey ? params.idempotencyKey.slice(0, 40) : undefined,
        ...params.notes,
      },
    };

    const cashfreeOrder = await this.fetchApi<CashfreeOrderApiResponse>("/orders", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    return {
      orderId: cashfreeOrder.order_id,
      amount: params.amount,
      currency: "INR",
      provider: this.providerName,
      rawOrder: cashfreeOrder,
      checkoutPayload: {
        keyId: appId,
        orderId: cashfreeOrder.order_id,
        amount: params.amount,
        currency: "INR",
        name: "MitFloww",
        description: params.description || "MitFloww Order",
        notes: params.notes,
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
        },
        paymentSessionId: cashfreeOrder.payment_session_id,
        environment,
        isMock,
      },
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<GatewayVerificationResult> {
    if (!params.orderId) {
      throw new AppError("Missing orderId for Cashfree payment verification.", 400, "missing_order_id");
    }

    // Cashfree verification checks the payments collection under the order
    const payments = await this.fetchApi<CashfreePaymentEntity[]>(
      `/orders/${encodeURIComponent(params.orderId)}/payments`,
    );

    const successfulPayment = Array.isArray(payments)
      ? payments.find((p) => p.payment_status === "SUCCESS")
      : null;

    if (successfulPayment) {
      return {
        verified: true,
        provider: this.providerName,
        orderId: params.orderId,
        paymentId: String(successfulPayment.cf_payment_id),
        amount: Math.round(successfulPayment.payment_amount * 100),
        currency: successfulPayment.payment_currency || "INR",
        status: "captured",
        rawResponse: successfulPayment,
      };
    }

    const pendingPayment = Array.isArray(payments)
      ? payments.find((p) => p.payment_status === "PENDING")
      : null;

    if (pendingPayment) {
      return {
        verified: false,
        provider: this.providerName,
        orderId: params.orderId,
        paymentId: String(pendingPayment.cf_payment_id),
        amount: Math.round(pendingPayment.payment_amount * 100),
        currency: pendingPayment.payment_currency || "INR",
        status: "pending",
        rawResponse: pendingPayment,
      };
    }

    const lastPayment = Array.isArray(payments) && payments.length > 0 ? payments[0] : null;

    return {
      verified: false,
      provider: this.providerName,
      orderId: params.orderId,
      paymentId: lastPayment ? String(lastPayment.cf_payment_id) : "unknown",
      amount: lastPayment ? Math.round(lastPayment.payment_amount * 100) : 0,
      currency: "INR",
      status: "failed",
      rawResponse: payments,
    };
  }

  async capturePayment(params: CapturePaymentParams): Promise<GatewayVerificationResult> {
    // Cashfree auto-captures orders upon user authorization in standard checkout
    return this.getPaymentStatus({ paymentId: params.paymentId });
  }

  async getPaymentStatus(params: {
    orderId?: string;
    paymentId?: string;
  }): Promise<GatewayVerificationResult> {
    if (!params.orderId && !params.paymentId) {
      throw new AppError("Order ID or Payment ID is required.", 400, "missing_identifier");
    }

    if (params.orderId) {
      return this.verifyPayment({ orderId: params.orderId, paymentId: params.paymentId || "" });
    }

    // If only paymentId is provided, query order payments fallback
    throw new AppError("Cashfree status check requires orderId.", 400, "order_id_required");
  }

  async refundPayment(params: RefundPaymentParams): Promise<GatewayRefundResult> {
    if (!params.paymentId) {
      throw new AppError("Cashfree refund requires paymentId or orderId.", 400, "missing_payment_id");
    }

    const refundAmount = Number((params.amount / 100).toFixed(2));
    const refundId = `cfr_${params.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30)}`;

    const response = await this.fetchApi<CashfreeRefundApiResponse>(
      `/orders/${encodeURIComponent(params.paymentId)}/refunds`,
      {
        method: "POST",
        body: JSON.stringify({
          refund_amount: refundAmount,
          refund_id: refundId,
          refund_note: params.reason || "Customer refund",
        }),
      },
    );

    let status: "pending" | "processed" | "failed" = "pending";
    if (response.refund_status === "SUCCESS") status = "processed";
    else if (response.refund_status === "FAILED") status = "failed";

    return {
      refundId: response.cf_refund_id || refundId,
      paymentId: params.paymentId,
      amount: Math.round(response.refund_amount * 100),
      currency: response.refund_currency || "INR",
      status,
      rawResponse: response,
    };
  }

  /**
   * Cashfree Webhook Signature Verification.
   * Cashfree signs webhooks with HMAC-SHA256 of (timestamp + rawBody) encoded in Base64.
   * Supports both object params and positional params.
   */
  verifyWebhookSignature(
    rawBodyOrParams:
      | string
      | Buffer
      | { rawBody: string | Buffer; timestamp?: string; signature?: string },
    timestampArg?: string,
    signatureArg?: string,
  ): boolean {
    let rawBody: string | Buffer | undefined;
    let timestamp: string | undefined;
    let signature: string | undefined;

    if (typeof rawBodyOrParams === "object" && !Buffer.isBuffer(rawBodyOrParams)) {
      rawBody = rawBodyOrParams.rawBody;
      timestamp = rawBodyOrParams.timestamp;
      signature = rawBodyOrParams.signature;
    } else {
      rawBody = rawBodyOrParams;
      timestamp = timestampArg;
      signature = signatureArg;
    }

    if (!rawBody || !timestamp || !signature) {
      return false;
    }

    const { secretKey } = this.getCredentials();
    const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;

    const expectedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(timestamp + rawBuffer)
      .digest("base64");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * Helper to parse webhook payload structure and extract status & identifiers.
   */
  parseWebhookEvent(rawBody: string | Buffer): {
    status: "captured" | "authorized" | "failed" | "refunded" | "pending" | "unknown";
    providerOrderId: string | null;
    providerPaymentId: string | null;
    eventType: string;
    amount: number | null;
  } {
    const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    const payload = JSON.parse(rawString);
    const eventType = payload.type || "UNKNOWN";
    const data = payload.data || {};
    const order = data.order || {};
    const payment = data.payment || {};

    let status: "captured" | "authorized" | "failed" | "refunded" | "pending" | "unknown" = "unknown";
    if (eventType === "PAYMENT_SUCCESS_WEBHOOK") {
      status = "captured";
    } else if (eventType === "PAYMENT_FAILED_WEBHOOK" || eventType === "PAYMENT_USER_DROPPED_WEBHOOK") {
      status = "failed";
    }

    return {
      status,
      providerOrderId: order.order_id || null,
      providerPaymentId: payment.cf_payment_id ? String(payment.cf_payment_id) : null,
      eventType,
      amount: payment.payment_amount ? Math.round(payment.payment_amount * 100) : null,
    };
  }

  async parseAndVerifyWebhook(params: RawWebhookParams): Promise<GatewayWebhookResult> {
    const signatureHeader =
      params.headers["x-webhook-signature"] || params.headers["X-Webhook-Signature"];
    const timestampHeader =
      params.headers["x-webhook-timestamp"] || params.headers["X-Webhook-Timestamp"];

    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

    if (!signature || !timestamp) {
      throw new AppError(
        "Missing Cashfree webhook signature or timestamp header.",
        400,
        "missing_signature",
      );
    }

    const rawString = Buffer.isBuffer(params.rawBody)
      ? params.rawBody.toString("utf8")
      : params.rawBody;

    const isValid = this.verifyWebhookSignature(rawString, timestamp, signature);

    if (!isValid) {
      throw new AppError(
        "Invalid Cashfree webhook signature.",
        400,
        "invalid_webhook_signature",
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawString);
    } catch {
      throw new AppError("Malformed JSON webhook payload.", 400, "malformed_webhook_payload");
    }

    const eventType = payload.type || "UNKNOWN";
    const data = payload.data || {};
    const order = data.order || {};
    const payment = data.payment || {};

    const orderId = order.order_id || null;
    const paymentId = payment.cf_payment_id ? String(payment.cf_payment_id) : null;
    const amount = payment.payment_amount ? Math.round(payment.payment_amount * 100) : null;
    const currency = payment.payment_currency || "INR";

    let status: "captured" | "authorized" | "failed" | "refunded" | "pending" | "unknown" = "unknown";
    if (eventType === "PAYMENT_SUCCESS_WEBHOOK") {
      status = "captured";
    } else if (eventType === "PAYMENT_FAILED_WEBHOOK" || eventType === "PAYMENT_USER_DROPPED_WEBHOOK") {
      status = "failed";
    }

    const eventId = paymentId
      ? `cf_${paymentId}_${eventType}`
      : `cf_${orderId || "evt"}_${payload.event_time || Date.now()}`;

    return {
      signatureValid: true,
      provider: this.providerName,
      eventId,
      eventType,
      orderId,
      paymentId,
      amount,
      currency,
      status,
      rawPayload: payload,
    };
  }
}

export const cashfreeAdapter = new CashfreeAdapter();
