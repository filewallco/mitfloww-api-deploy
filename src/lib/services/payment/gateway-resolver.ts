import { getPaymentConfig } from "@/config/payment";
import { AppError } from "@/lib/errors/app-error";
import type { PaymentGatewayAdapter } from "./payment-gateway.interface";
import { razorpayAdapter } from "./razorpay.adapter";
import { cashfreeAdapter } from "./cashfree.adapter";
import { gatewayConfigService } from "./gateway-config-service";

export class GatewayResolver {
  resolveProvider(params: {
    currency?: string;
    preferredProvider?: string;
  }): "razorpay" | "cashfree" | "stripe" {
    const config = getPaymentConfig();
    const currency = (params.currency || "INR").toUpperCase();
    const isNonProd = process.env.NODE_ENV !== "production";

    // In non-production, ensure at least one provider is considered enabled for testing
    const razorpayActive = config.providers.razorpay.enabled || isNonProd;
    const cashfreeActive = config.providers.cashfree.enabled || isNonProd;
    const stripeActive = config.providers.stripe.enabled || (isNonProd && currency !== "INR");

    if (params.preferredProvider) {
      const preferred = params.preferredProvider.toLowerCase() as "razorpay" | "cashfree" | "stripe";
      if (preferred === "razorpay" && razorpayActive) {
        return "razorpay";
      }
      if (preferred === "cashfree" && cashfreeActive) {
        return "cashfree";
      }
      if (preferred === "stripe" && stripeActive) {
        return "stripe";
      }
    }

    // Default regional routing
    if (currency === "INR") {
      if (razorpayActive) {
        return "razorpay";
      }
      if (cashfreeActive) {
        return "cashfree";
      }
    } else {
      if (stripeActive) {
        return "stripe";
      }
      if (razorpayActive) {
        return "razorpay";
      }
    }

    if (razorpayActive) {
      return "razorpay";
    }

    throw new AppError(
      `No payment gateway is configured or enabled for currency ${currency}. Please check payment gateway configuration in settings.`,
      503,
      "gateway_unavailable",
    );
  }

  getAdapter(provider: "razorpay" | "cashfree" | "stripe"): PaymentGatewayAdapter {
    switch (provider) {
      case "razorpay":
        return razorpayAdapter;
      case "cashfree":
        return cashfreeAdapter;
      case "stripe":
        throw new AppError("Stripe adapter is not active yet.", 501, "provider_not_implemented");
      default:
        throw new AppError(`Unknown payment provider: ${provider}`, 400, "invalid_provider");
    }
  }
}

export const gatewayResolver = new GatewayResolver();
