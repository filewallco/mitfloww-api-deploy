import { getPaymentConfig, type ProviderFeeConfig } from "@/config/payment";

export interface FeeCalculationResult {
  originalAmount: number; // in minor units
  feePercentage: number;
  fixedFee: number;
  taxRate: number;
  feeAmount: number; // in minor units
  taxAmount: number; // in minor units
  totalFee: number; // in minor units
  totalPayable: number; // in minor units
  feeAbsorbedByMerchant: boolean;
  feeConfigVersion: string;
  currency: string;
}

export class FeeCalculatorService {
  calculate(params: {
    originalAmount: number | bigint;
    provider?: "razorpay" | "cashfree" | "stripe";
    currency?: string;
    customConfig?: Partial<ProviderFeeConfig>;
  }): FeeCalculationResult {
    const originalAmount = Math.max(0, Math.round(Number(params.originalAmount)));
    const currency = (params.currency || "INR").toUpperCase();
    const provider = params.provider || "razorpay";

    const config = getPaymentConfig();
    const providerConfig = config.providers[provider]?.fee || {
      feePercentage: 2.3,
      fixedFee: 0,
      taxRate: 18.0,
      feePassingEnabled: true,
      configVersion: "v1",
    };

    const feePercentage =
      params.customConfig?.feePercentage ?? providerConfig.feePercentage;
    const fixedFee = params.customConfig?.fixedFee ?? providerConfig.fixedFee;
    const taxRate = params.customConfig?.taxRate ?? providerConfig.taxRate;
    const feePassingEnabled =
      params.customConfig?.feePassingEnabled ?? providerConfig.feePassingEnabled;
    const feeConfigVersion =
      params.customConfig?.configVersion ?? providerConfig.configVersion;

    if (originalAmount === 0) {
      return {
        originalAmount: 0,
        feePercentage,
        fixedFee: 0,
        taxRate,
        feeAmount: 0,
        taxAmount: 0,
        totalFee: 0,
        totalPayable: 0,
        feeAbsorbedByMerchant: !feePassingEnabled,
        feeConfigVersion,
        currency,
      };
    }

    // Exact integer minor-unit arithmetic
    // 1. Base fee = (originalAmount * feePercentage / 100) + fixedFee
    const calculatedBaseFee = Math.round((originalAmount * feePercentage) / 100);
    const feeAmount = calculatedBaseFee + fixedFee;

    // 2. GST on the transaction fee = (feeAmount * taxRate / 100)
    const taxAmount = Math.round((feeAmount * taxRate) / 100);

    // 3. Total transaction fee
    const totalFee = feeAmount + taxAmount;

    // 4. Total payable
    const totalPayable = feePassingEnabled ? originalAmount + totalFee : originalAmount;

    return {
      originalAmount,
      feePercentage,
      fixedFee,
      taxRate,
      feeAmount,
      taxAmount,
      totalFee,
      totalPayable,
      feeAbsorbedByMerchant: !feePassingEnabled,
      feeConfigVersion,
      currency,
    };
  }
}

export const feeCalculator = new FeeCalculatorService();

