export interface ProviderFeeConfig {
  feePercentage: number; // e.g. 2.3 means 2.3%
  fixedFee: number; // in minor currency units (paise/cents)
  taxRate: number; // e.g. 18.0 means 18% GST on the fee
  feePassingEnabled: boolean; // true = added to client payable total; false = merchant absorbed
  configVersion: string;
}

export interface PaymentConfig {
  defaultProvider: "razorpay" | "cashfree" | "stripe";
  domesticProvider: "razorpay" | "cashfree";
  internationalProvider: "stripe" | "razorpay";
  autoCapture: boolean;
  providers: {
    razorpay: {
      enabled: boolean;
      keyId: string;
      keySecret: string;
      webhookSecret: string;
      fee: ProviderFeeConfig;
    };
    cashfree: {
      enabled: boolean;
      appId: string;
      secretKey: string;
      webhookSecret: string;
      fee: ProviderFeeConfig;
    };
    stripe: {
      enabled: boolean;
      publishableKey: string;
      secretKey: string;
      webhookSecret: string;
      fee: ProviderFeeConfig;
    };
  };
}

export function getPaymentConfig(): PaymentConfig {
  const feePassingEnabled =
    (process.env.PAYMENT_FEE_PASSING_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const autoCapture =
    (process.env.PAYMENT_AUTO_CAPTURE ?? "true").trim().toLowerCase() !== "false";

  const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const razorpayWebhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();

  const razorpayFeePercent = parseFloat(process.env.RAZORPAY_FEE_PERCENT || "2.3") || 2.3;
  const razorpayTaxRate = parseFloat(process.env.RAZORPAY_TAX_RATE || "18.0") || 18.0;
  const razorpayFixedFee = parseInt(process.env.RAZORPAY_FIXED_FEE || "0", 10) || 0;

  return {
    defaultProvider: (process.env.PAYMENT_DEFAULT_PROVIDER as any) || "razorpay",
    domesticProvider: (process.env.PAYMENT_DOMESTIC_PROVIDER as any) || "razorpay",
    internationalProvider: (process.env.PAYMENT_INTERNATIONAL_PROVIDER as any) || "razorpay",
    autoCapture,
    providers: {
      razorpay: {
        enabled: Boolean(razorpayKeyId && razorpayKeySecret),
        keyId: razorpayKeyId,
        keySecret: razorpayKeySecret,
        webhookSecret: razorpayWebhookSecret || razorpayKeySecret,
        fee: {
          feePercentage: razorpayFeePercent,
          fixedFee: razorpayFixedFee,
          taxRate: razorpayTaxRate,
          feePassingEnabled,
          configVersion: "v1",
        },
      },
      cashfree: {
        enabled: Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY),
        appId: (process.env.CASHFREE_APP_ID || "").trim(),
        secretKey: (process.env.CASHFREE_SECRET_KEY || "").trim(),
        webhookSecret: (process.env.CASHFREE_WEBHOOK_SECRET || "").trim(),
        fee: {
          feePercentage: parseFloat(process.env.CASHFREE_FEE_PERCENT || "2.0") || 2.0,
          fixedFee: parseInt(process.env.CASHFREE_FIXED_FEE || "0", 10) || 0,
          taxRate: parseFloat(process.env.CASHFREE_TAX_RATE || "18.0") || 18.0,
          feePassingEnabled,
          configVersion: "v1",
        },
      },
      stripe: {
        enabled: Boolean(process.env.STRIPE_SECRET_KEY),
        publishableKey: (process.env.STRIPE_PUBLISHABLE_KEY || "").trim(),
        secretKey: (process.env.STRIPE_SECRET_KEY || "").trim(),
        webhookSecret: (process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
        fee: {
          feePercentage: parseFloat(process.env.STRIPE_FEE_PERCENT || "2.9") || 2.9,
          fixedFee: parseInt(process.env.STRIPE_FIXED_FEE || "30", 10) || 30,
          taxRate: parseFloat(process.env.STRIPE_TAX_RATE || "0.0") || 0.0,
          feePassingEnabled,
          configVersion: "v1",
        },
      },
    },
  };
}

