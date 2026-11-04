import { getPaymentConfig } from "@/config/payment";
import { AppError } from "@/lib/errors/app-error";
import type { PaymentGatewayAdapter } from "./payment-gateway.interface";
import { razorpayAdapter } from "./razorpay.adapter";

export class GatewayResolver {
  resolveProvider(params: {
    currency?: string;
    preferredProvider?: string;
  }): "razorpay" | "cashfree" | "stripe" {
    const config = getPaymentConfig();
    const currency = (params.currency || "INR").toUpperCase();

    if (params.preferredProvider) {
      const preferred = params.preferredProvider.toLowerCase() as "razorpay" | "cashfree" | "stripe";
      if (preferred === "razorpay" && config.providers.razorpay.enabled) {
        return "razorpay";
      }
      if (preferred === "cashfree" && config.providers.cashfree.enabled) {
        return "cashfree";
      }
      if (preferred === "stripe" && config.providers.stripe.enabled) {
        return "stripe";
      }
    }

    // Default regional routing
    if (currency === "INR") {
      if (config.providers.razorpay.enabled) {
        return "razorpay";
      }
      if (config.providers.cashfree.enabled) {
        return "cashfree";
      }
    } else {
      if (config.providers.stripe.enabled) {
        return "stripe";
      }
      if (config.providers.razorpay.enabled) {
        return "razorpay";
      }
    }

    if (config.providers.razorpay.enabled) {
      return "razorpay";
    }

    throw new AppError(
      "No payment gateway is configured or enabled for currency " + currency,
      503,
      "gateway_unavailable",
    );
  }

  getAdapter(provider: "razorpay" | "cashfree" | "stripe"): PaymentGatewayAdapter {
    switch (provider) {
      case "razorpay":
        return razorpayAdapter;
      case "cashfree":
        throw new AppError("Cashfree adapter is not active yet.", 501, "provider_not_implemented");
      case "stripe":
        throw new AppError("Stripe adapter is not active yet.", 501, "provider_not_implemented");
      default:
        throw new AppError(`Unknown payment provider: ${provider}`, 400, "invalid_provider");
    }
  }
}

export const gatewayResolver = new GatewayResolver();

