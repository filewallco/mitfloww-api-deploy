import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { CashfreeAdapter } from "../src/lib/services/payment/cashfree.adapter";

test("CashfreeAdapter: maps minor units (paise) to major units (Rupees with decimals) for order creation", async () => {
  const adapter = new CashfreeAdapter({
    appId: "TEST123456",
    secretKey: "test_secret_key_abcdef123456",
    apiVersion: "2023-08-01",
    environment: "sandbox",
  });

  const orderResult = await adapter.createOrder({
    amount: 157500, // ₹1,575.00 (157500 paise)
    currency: "INR",
    receipt: "rcpt_test_123",
    description: "Pro Plan Subscription",
    customer: {
      id: "usr_abc123",
      email: "buyer@example.com",
      name: "John Doe",
      phone: "9876543210",
    },
  });

  assert.equal(orderResult.provider, "cashfree");
  assert.ok(orderResult.orderId.startsWith("cf_"));
  assert.ok(orderResult.checkoutPayload.paymentSessionId);
  assert.equal(orderResult.checkoutPayload.environment, "sandbox");
  assert.equal(orderResult.amount, 157500); // 157500 paise
  assert.equal((orderResult.rawOrder as any).order_amount, 1575.00); // ₹1,575.00 in major units
  assert.equal(orderResult.currency, "INR");
});

test("CashfreeAdapter: HMAC-SHA256 Base64 webhook verification validates genuine payloads", () => {
  const secretKey = "cf_secret_key_very_secret_998877";
  const adapter = new CashfreeAdapter({
    appId: "TEST123456",
    secretKey,
    apiVersion: "2023-08-01",
    environment: "sandbox",
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({
    data: {
      order: { order_id: "cf_order_998877", order_amount: 500.0 },
      payment: {
        cf_payment_id: 12345678,
        payment_status: "SUCCESS",
        payment_amount: 500.0,
      },
    },
    event_time: new Date().toISOString(),
    type: "PAYMENT_SUCCESS_WEBHOOK",
  });

  // Authoritative Cashfree Webhook Signature: HMAC-SHA256 of (timestamp + rawBody) as Base64
  const expectedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + rawBody)
    .digest("base64");

  const isValid = adapter.verifyWebhookSignature({
    rawBody,
    signature: expectedSignature,
    timestamp,
  });

  assert.equal(isValid, true, "Valid Cashfree signature must be verified successfully");
});

test("CashfreeAdapter: HMAC-SHA256 Base64 webhook verification rejects tampered payloads and timestamps", () => {
  const secretKey = "cf_secret_key_very_secret_998877";
  const adapter = new CashfreeAdapter({
    appId: "TEST123456",
    secretKey,
    apiVersion: "2023-08-01",
    environment: "sandbox",
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const genuineBody = JSON.stringify({ order_id: "order_123", payment_status: "SUCCESS" });
  const genuineSignature = crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + genuineBody)
    .digest("base64");

  // 1. Tampered body
  const tamperedBody = JSON.stringify({ order_id: "order_123", payment_status: "SUCCESS", amount: 999999 });
  assert.equal(
    adapter.verifyWebhookSignature({
      rawBody: tamperedBody,
      signature: genuineSignature,
      timestamp,
    }),
    false,
    "Must reject tampered body",
  );

  // 2. Tampered timestamp (replay/drift attack)
  assert.equal(
    adapter.verifyWebhookSignature({
      rawBody: genuineBody,
      signature: genuineSignature,
      timestamp: String(Number(timestamp) + 100),
    }),
    false,
    "Must reject tampered timestamp",
  );

  // 3. Empty or missing fields
  assert.equal(
    adapter.verifyWebhookSignature({
      rawBody: genuineBody,
      signature: "",
      timestamp,
    }),
    false,
    "Must reject empty signature",
  );
});

test("CashfreeAdapter: maps Cashfree payment statuses correctly to internal states", async () => {
  const adapter = new CashfreeAdapter({
    appId: "TEST123456",
    secretKey: "test_secret_key",
    apiVersion: "2023-08-01",
    environment: "sandbox",
  });

  // Verify internal mapping logic via verifyPayment / parseWebhookEvent
  const simulatedSuccessWebhook = JSON.stringify({
    data: {
      order: { order_id: "cf_ord_1", order_amount: 100 },
      payment: {
        cf_payment_id: 11111,
        payment_status: "SUCCESS",
        payment_amount: 100,
        payment_currency: "INR",
        payment_method: { upi: { channel: "gpay" } },
      },
    },
    type: "PAYMENT_SUCCESS_WEBHOOK",
  });

  const parsedSuccess = adapter.parseWebhookEvent(simulatedSuccessWebhook);
  assert.equal(parsedSuccess.status, "captured");
  assert.equal(parsedSuccess.providerOrderId, "cf_ord_1");
  assert.equal(parsedSuccess.providerPaymentId, "11111");

  const simulatedFailedWebhook = JSON.stringify({
    data: {
      order: { order_id: "cf_ord_2", order_amount: 100 },
      payment: {
        cf_payment_id: 22222,
        payment_status: "FAILED",
        payment_amount: 100,
      },
    },
    type: "PAYMENT_FAILED_WEBHOOK",
  });

  const parsedFailed = adapter.parseWebhookEvent(simulatedFailedWebhook);
  assert.equal(parsedFailed.status, "failed");
  assert.equal(parsedFailed.providerOrderId, "cf_ord_2");
});

test("CashfreeAdapter: simulation mode safely provides deterministic sandbox payments", async () => {
  const adapter = new CashfreeAdapter({
    appId: "TEST123456",
    secretKey: "test_secret_key",
    apiVersion: "2023-08-01",
    environment: "sandbox",
  });

  const verification = await adapter.verifyPayment({
    orderId: "sim_order_test_123",
    paymentId: "sim_pay_test_456",
  });

  assert.equal(verification.provider, "cashfree");
  assert.equal(verification.status, "captured");
  assert.equal(verification.orderId, "sim_order_test_123");
  assert.ok(verification.paymentId);
});

