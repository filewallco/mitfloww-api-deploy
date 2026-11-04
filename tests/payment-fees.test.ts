import test from "node:test";
import assert from "node:assert/strict";
import { feeCalculator } from "../src/lib/services/payment/fee-calculator";

test("FeeCalculator: calculates 2.3% fee + 18% GST accurately on ₹5,000 in integer paise", () => {
  // ₹5,000 = 500,000 paise
  const breakdown = feeCalculator.calculate({
    originalAmount: 500000,
    currency: "INR",
    provider: "razorpay",
    customConfig: {
      feePassingEnabled: true,
      feePercentage: 2.3,
      taxRate: 18.0,
      fixedFee: 0,
    },
  });

  // Base fee: 500,000 * 0.023 = 11,500 paise (₹115.00)
  assert.equal(breakdown.feeAmount, 11500, "Base fee should be ₹115.00 (11500 paise)");

  // GST on fee: 11,500 * 0.18 = 2,070 paise (₹20.70)
  assert.equal(breakdown.taxAmount, 2070, "GST on fee should be ₹20.70 (2070 paise)");

  // Total fee: 11,500 + 2,070 = 13,570 paise (₹135.70)
  assert.equal(breakdown.totalFee, 13570, "Total fee should be ₹135.70 (13570 paise)");

  // Total payable: 500,000 + 13,570 = 513,570 paise (₹5,135.70)
  assert.equal(breakdown.totalPayable, 513570, "Total payable should be ₹5,135.70 (513570 paise)");
  assert.equal(breakdown.currency, "INR");
  assert.equal(breakdown.feeAbsorbedByMerchant, false);
});

test("FeeCalculator: final payment fee applies strictly to remaining balance after advance payment", () => {
  // Project subtotal: ₹10,000 (1,000,000 paise)
  // Advance paid: ₹4,000 (400,000 paise)
  // Remaining due: ₹6,000 (600,000 paise)
  const subtotal = 1000000;
  const advancePaid = 400000;
  const remainingAmount = subtotal - advancePaid;

  const breakdown = feeCalculator.calculate({
    originalAmount: remainingAmount,
    currency: "INR",
    provider: "razorpay",
    customConfig: {
      feePassingEnabled: true,
      feePercentage: 2.3,
      taxRate: 18.0,
    },
  });

  assert.equal(breakdown.originalAmount, 600000);

  // Base fee on remaining ₹6,000: 600,000 * 0.023 = 13,800 paise (₹138.00)
  assert.equal(breakdown.feeAmount, 13800, "Fee must be charged only on remaining balance ₹6,000");

  // GST on fee: 13,800 * 0.18 = 2,484 paise (₹24.84)
  assert.equal(breakdown.taxAmount, 2484);

  // Total fee: 13,800 + 2,484 = 16,284 paise (₹162.84)
  assert.equal(breakdown.totalFee, 16284);

  // Total payable: 600,000 + 16,284 = 616,284 paise (₹6,162.84)
  assert.equal(breakdown.totalPayable, 616284);
});

test("FeeCalculator: merchant-absorbed fee mode (feePassingEnabled = false) passes 0 fee to payer", () => {
  const breakdown = feeCalculator.calculate({
    originalAmount: 250000, // ₹2,500
    currency: "INR",
    provider: "razorpay",
    customConfig: {
      feePassingEnabled: false,
      feePercentage: 2.3,
      taxRate: 18.0,
    },
  });

  assert.equal(breakdown.feeAbsorbedByMerchant, true);
  assert.equal(breakdown.totalPayable, 250000, "Payer pays exact original amount when fee is merchant-absorbed");
});

test("FeeCalculator: handles small edge case values and rounding without floating point drift", () => {
  // ₹1.00 = 100 paise
  const breakdown = feeCalculator.calculate({
    originalAmount: 100,
    currency: "INR",
    provider: "razorpay",
    customConfig: {
      feePassingEnabled: true,
      feePercentage: 2.3,
      taxRate: 18.0,
    },
  });

  // 100 * 0.023 = 2.3 -> rounds to 2 paise
  assert.equal(breakdown.feeAmount, 2);
  // 2 * 0.18 = 0.36 -> rounds to 0 paise
  assert.equal(breakdown.taxAmount, 0);
  assert.equal(breakdown.totalFee, 2);
  assert.equal(breakdown.totalPayable, 102);
});
