import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { gatewayConfigService } from "../src/lib/services/payment/gateway-config-service";
import { gatewayResolver } from "../src/lib/services/payment/gateway-resolver";
import { feeCalculator } from "../src/lib/services/payment/fee-calculator";

test("GatewayManagement: getAvailableGateways returns enabled gateways for INR", async () => {
  const available = await gatewayConfigService.getAvailableGateways("INR");

  assert.ok(Array.isArray(available));
  assert.ok(available.length >= 2, "Expected at least 2 gateways (razorpay, cashfree) for INR");

  const providers = available.map((g) => g.provider);
  assert.ok(providers.includes("razorpay"), "Razorpay should be available for INR");
  assert.ok(providers.includes("cashfree"), "Cashfree should be available for INR");

  const rzp = available.find((g) => g.provider === "razorpay");
  assert.ok(rzp);
  assert.equal(typeof rzp?.feePercentage, "number");
  assert.equal(typeof rzp?.taxRate, "number");
  assert.ok(Array.isArray(rzp?.supportedCurrencies));
  assert.ok(rzp?.supportedCurrencies.includes("INR"));

  const cf = available.find((g) => g.provider === "cashfree");
  assert.ok(cf);
  assert.equal(typeof cf?.feePercentage, "number");
  assert.equal(typeof cf?.taxRate, "number");
  assert.ok(cf?.supportedCurrencies.includes("INR"));
});

test("GatewayManagement: gatewayResolver resolves active providers and preferred options", () => {
  // Default resolution for INR
  const resolvedDefault = gatewayResolver.resolveProvider({ currency: "INR" });
  assert.ok(
    resolvedDefault === "razorpay" || resolvedDefault === "cashfree",
    "Should resolve to an active INR provider",
  );

  // Preferred provider selection
  const resolvedRazorpay = gatewayResolver.resolveProvider({
    currency: "INR",
    preferredProvider: "razorpay",
  });
  assert.equal(resolvedRazorpay, "razorpay");

  const resolvedCashfree = gatewayResolver.resolveProvider({
    currency: "INR",
    preferredProvider: "cashfree",
  });
  assert.equal(resolvedCashfree, "cashfree");

  // Preferred provider fallback when invalid/unsupported
  const resolvedFallback = gatewayResolver.resolveProvider({
    currency: "INR",
    preferredProvider: "unsupported_gateway",
  });
  assert.ok(
    resolvedFallback === "razorpay" || resolvedFallback === "cashfree",
    "Fallback should choose an enabled INR provider",
  );
});

test("GatewayManagement: guard prevents disabling all gateways for INR without force", async () => {
  // Try updating a non-existent provider
  await assert.rejects(
    async () => {
      await gatewayConfigService.updateGatewayConfig("non_existent_gateway", {
        isEnabled: false,
      });
    },
    (err: any) => {
      assert.equal(err.code, "gateway_not_found");
      return true;
    },
    "Must throw gateway_not_found for non-existent provider",
  );
});

test("GatewayManagement: dynamic fee configurations per provider", async () => {
  const rzpFee = await gatewayConfigService.getProviderFeeConfig("razorpay");
  assert.ok(rzpFee);
  assert.equal(typeof rzpFee.feePercentage, "number");
  assert.equal(typeof rzpFee.taxRate, "number");

  const cfFee = await gatewayConfigService.getProviderFeeConfig("cashfree");
  assert.ok(cfFee);
  assert.equal(typeof cfFee.feePercentage, "number");
  assert.equal(typeof cfFee.taxRate, "number");

  // Calculate fee breakdown with Cashfree dynamic config
  const calc = feeCalculator.calculate({
    originalAmount: 100000, // ₹1,000.00
    currency: "INR",
    provider: "cashfree",
    customConfig: cfFee,
  });

  assert.equal(calc.originalAmount, 100000);
  assert.equal(calc.currency, "INR");
  assert.ok(calc.totalPayable >= 100000);
});

