import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { RazorpayAdapter } from "../src/lib/services/payment/razorpay.adapter";
import { gatewayResolver } from "../src/lib/services/payment/gateway-resolver";
import { sanitizeLogValue } from "../src/lib/logger/sanitizer";

test("Payment Security: Razorpay HMAC-SHA256 signature verification validates authentic signatures", () => {
  const dummySecret = "test_razorpay_secret_key_12345";
  const adapter = new RazorpayAdapter({
    keyId: "rzp_test_dummy",
    keySecret: dummySecret,
    webhookSecret: "test_webhook_secret",
  });

  const orderId = "order_O8jfkd9284jdf";
  const paymentId = "pay_P893ksdf823";

  // Authoritative Razorpay HMAC: crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex")
  const expectedSignature = crypto
    .createHmac("sha256", dummySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const isValid = adapter.verifySignature({
    orderId,
    paymentId,
    signature: expectedSignature,
  });

  assert.equal(isValid, true, "Signature should be valid when generated with matching secret");
});

test("Payment Security: Razorpay rejects tampered signatures, order IDs, and payment IDs", () => {
  const dummySecret = "test_razorpay_secret_key_12345";
  const adapter = new RazorpayAdapter({
    keyId: "rzp_test_dummy",
    keySecret: dummySecret,
    webhookSecret: "test_webhook_secret",
  });

  const orderId = "order_O8jfkd9284jdf";
  const paymentId = "pay_P893ksdf823";

  const genuineSignature = crypto
    .createHmac("sha256", dummySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  // Tampered payment ID
  const tamperedPaymentValid = adapter.verifySignature({
    orderId,
    paymentId: "pay_ATTACKER_INJECTED_999",
    signature: genuineSignature,
  });
  assert.equal(tamperedPaymentValid, false, "Must reject tampered payment ID");

  // Tampered order ID
  const tamperedOrderValid = adapter.verifySignature({
    orderId: "order_DIFFERENT_ORDER",
    paymentId,
    signature: genuineSignature,
  });
  assert.equal(tamperedOrderValid, false, "Must reject tampered order ID");

  // Random fake signature
  const fakeSigValid = adapter.verifySignature({
    orderId,
    paymentId,
    signature: "abcdef1234567890deadbeefcafe",
  });
  assert.equal(fakeSigValid, false, "Must reject random fake signature");
});

test("Payment Security: Webhook HMAC verification verifies authentic webhook signatures and rejects altered payloads", async () => {
  const webhookSecret = "whsec_test_secret_key_98765";
  const adapter = new RazorpayAdapter({
    keyId: "rzp_test_dummy",
    keySecret: "test_key_secret",
    webhookSecret,
  });

  const rawPayload = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test_12345",
          order_id: "order_test_67890",
          amount: 513570,
          currency: "INR",
          status: "captured",
        },
      },
    },
  });

  const authenticSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawPayload)
    .digest("hex");

  // Authentic signature succeeds
  const parsed = await adapter.parseAndVerifyWebhook({
    rawBody: rawPayload,
    headers: {
      "x-razorpay-signature": authenticSignature,
    },
  });

  assert.equal(parsed.eventType, "payment.captured");
  assert.equal(parsed.paymentId, "pay_test_12345");
  assert.equal(parsed.orderId, "order_test_67890");
  assert.equal(parsed.amount, 513570);
  assert.equal(parsed.status, "captured");

  // Tampered payload fails verification
  const alteredPayload = rawPayload.replace("513570", "100");
  await assert.rejects(
    async () => {
      await adapter.parseAndVerifyWebhook({
        rawBody: alteredPayload,
        headers: {
          "x-razorpay-signature": authenticSignature,
        },
      });
    },
    /invalid webhook signature/i,
    "Altered webhook payload must throw invalid webhook signature error",
  );
});

test("GatewayResolver: routes currencies to appropriate regional or international providers", () => {
  const oldRzpId = process.env.RAZORPAY_KEY_ID;
  const oldRzpSec = process.env.RAZORPAY_KEY_SECRET;
  const oldStripeSec = process.env.STRIPE_SECRET_KEY;
  const oldCfId = process.env.CASHFREE_APP_ID;
  const oldCfSec = process.env.CASHFREE_SECRET_KEY;

  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_123";
    process.env.RAZORPAY_KEY_SECRET = "rzp_sec_123";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.CASHFREE_APP_ID = "cf_test_123";
    process.env.CASHFREE_SECRET_KEY = "cf_sec_123";

    // INR routes to Razorpay by default
    const inrProvider = gatewayResolver.resolveProvider({ currency: "INR" });
    assert.equal(inrProvider, "razorpay");

    // USD routes to Stripe
    const usdProvider = gatewayResolver.resolveProvider({ currency: "USD" });
    assert.equal(usdProvider, "stripe");

    // EUR routes to Stripe
    const eurProvider = gatewayResolver.resolveProvider({ currency: "EUR" });
    assert.equal(eurProvider, "stripe");

    // Respects explicit preferred provider if supported
    const cashfreeProvider = gatewayResolver.resolveProvider({
      currency: "INR",
      preferredProvider: "cashfree",
    });
    assert.equal(cashfreeProvider, "cashfree");
  } finally {
    process.env.RAZORPAY_KEY_ID = oldRzpId;
    process.env.RAZORPAY_KEY_SECRET = oldRzpSec;
    process.env.STRIPE_SECRET_KEY = oldStripeSec;
    process.env.CASHFREE_APP_ID = oldCfId;
    process.env.CASHFREE_SECRET_KEY = oldCfSec;
  }
});

test("Payment Logging: sensitive payment secrets and signatures are redacted from logs", () => {
  const sensitivePaymentData = {
    provider: "razorpay",
    orderId: "order_12345",
    paymentId: "pay_67890",
    signature: "secret_client_signature_abc",
    razorpay_signature: "secret_razorpay_sig_xyz",
    key_secret: "rzp_secret_key_should_never_appear_in_logs",
    webhook_secret: "whsec_super_secret_webhook_signing_key",
    normalField: "safe_value",
  };

  const sanitized = sanitizeLogValue(sensitivePaymentData) as any;

  assert.equal(sanitized.provider, "razorpay");
  assert.equal(sanitized.orderId, "order_12345");
  assert.equal(sanitized.paymentId, "pay_67890");
  assert.equal(sanitized.normalField, "safe_value");

  assert.ok(sanitized.signature.includes("REDACTED"), "signature must be redacted");
  assert.ok(sanitized.razorpay_signature.includes("REDACTED"), "razorpay_signature must be redacted");
  assert.ok(sanitized.key_secret.includes("REDACTED"), "key_secret must be redacted");
  assert.ok(sanitized.webhook_secret.includes("REDACTED"), "webhook_secret must be redacted");
});
