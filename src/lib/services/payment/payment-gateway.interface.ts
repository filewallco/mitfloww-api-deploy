export interface CreateOrderParams {
  amount: number; // in minor units
  currency: string;
  receipt: string;
  notes: Record<string, string>;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  idempotencyKey: string;
  description?: string;
  themeColor?: string | null;
}

export interface GatewayOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  provider: string;
  rawOrder: unknown;
  checkoutPayload: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    notes: Record<string, string>;
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    themeColor?: string | null;
    paymentSessionId?: string;
    environment?: "sandbox" | "production";
    isMock?: boolean;
  };
}

export interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature?: string;
  rawPayload?: unknown;
}

export interface GatewayVerificationResult {
  verified: boolean;
  provider: string;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: "captured" | "authorized" | "failed" | "pending";
  rawResponse: unknown;
}

export interface CapturePaymentParams {
  paymentId: string;
  amount: number;
  currency: string;
}

export interface RefundPaymentParams {
  paymentId: string;
  amount: number;
  currency: string;
  reason?: string;
  idempotencyKey: string;
}

export interface GatewayRefundResult {
  refundId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: "pending" | "processed" | "failed";
  rawResponse: unknown;
}

export interface RawWebhookParams {
  rawBody: Buffer | string;
  headers: Record<string, string | string[] | undefined>;
}

export interface GatewayWebhookResult {
  signatureValid: boolean;
  provider: string;
  eventId: string;
  eventType: string;
  orderId: string | null;
  paymentId: string | null;
  amount: number | null;
  currency: string | null;
  status: "captured" | "authorized" | "failed" | "refunded" | "pending" | "unknown";
  rawPayload: unknown;
}

export interface PaymentGatewayAdapter {
  readonly providerName: "razorpay" | "cashfree" | "stripe";
  createOrder(params: CreateOrderParams): Promise<GatewayOrderResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<GatewayVerificationResult>;
  capturePayment(params: CapturePaymentParams): Promise<GatewayVerificationResult>;
  getPaymentStatus(params: {
    orderId?: string;
    paymentId?: string;
  }): Promise<GatewayVerificationResult>;
  refundPayment(params: RefundPaymentParams): Promise<GatewayRefundResult>;
  parseAndVerifyWebhook(params: RawWebhookParams): Promise<GatewayWebhookResult>;
}

