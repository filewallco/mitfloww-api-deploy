import { db } from "@/lib/db/client";
import { paymentGatewayConfigs, type PaymentGatewayConfigRecord } from "@/lib/db/schema";
import { getPaymentConfig, type ProviderFeeConfig } from "@/config/payment";
import { paymentLogger } from "@/lib/logger/payment-logger";
import { AppError } from "@/lib/errors/app-error";
import { eq, sql } from "drizzle-orm";

export interface AvailableGatewaySummary {
  provider: "razorpay" | "cashfree" | "stripe";
  displayName: string;
  description?: string | null;
  isDefault: boolean;
  supportedCurrencies: string[];
  environment: "sandbox" | "production";
  feePercentage: number;
  fixedFee: number;
  taxRate: number;
  feePassingEnabled: boolean;
  hasCredentials: boolean;
}

export interface UpdateGatewayConfigInput {
  isEnabled?: boolean;
  environment?: "sandbox" | "production";
  feePercentageBasisPoints?: number;
  fixedFeeCents?: number;
  taxRateBasisPoints?: number;
  feePassingEnabled?: boolean;
  isDefault?: boolean;
  force?: boolean;
}

export class GatewayConfigService {
  /**
   * Checks whether the given provider has valid credentials configured in environment.
   */
  hasConfiguredCredentials(provider: string): boolean {
    const config = getPaymentConfig();
    switch (provider) {
      case "razorpay":
        return Boolean(config.providers.razorpay.keyId && config.providers.razorpay.keySecret);
      case "cashfree":
        return Boolean(config.providers.cashfree.appId && config.providers.cashfree.secretKey);
      case "stripe":
        return Boolean(config.providers.stripe.secretKey);
      default:
        return false;
    }
  }

  /**
   * Returns list of currently enabled and available gateways for a given currency.
   * Safe for public/client exposure (no secret keys).
   */
  async getAvailableGateways(currency = "INR"): Promise<AvailableGatewaySummary[]> {
    const normalizedCurrency = currency.toUpperCase();

    // Query persisted gateway configs from DB
    const configs = await db
      .select()
      .from(paymentGatewayConfigs)
      .where(eq(paymentGatewayConfigs.isEnabled, true));

    const isNonProd = process.env.NODE_ENV !== "production";
    const available: AvailableGatewaySummary[] = [];

    for (const row of configs) {
      const currencies = (row.supportedCurrencies as string[]) || [];
      if (!currencies.includes(normalizedCurrency)) {
        continue;
      }

      const hasCreds = this.hasConfiguredCredentials(row.provider);

      // In non-production, fallback test sandbox credentials are available so developer flow is never blocked
      const isReady = hasCreds || isNonProd;

      if (!isReady) {
        await paymentLogger.warn("gateway.credentials_missing_production", {
          provider: row.provider,
          data: { currency: normalizedCurrency, environment: row.environment },
        });
        continue;
      }

      available.push({
        provider: row.provider as "razorpay" | "cashfree" | "stripe",
        displayName: row.displayName,
        description: row.description,
        isDefault: row.isDefault,
        supportedCurrencies: currencies,
        environment: row.environment as "sandbox" | "production",
        feePercentage: row.feePercentageBasisPoints / 100,
        fixedFee: row.fixedFeeCents,
        taxRate: row.taxRateBasisPoints / 100,
        feePassingEnabled: row.feePassingEnabled,
        hasCredentials: hasCreds,
      });
    }

    // Sort default first
    available.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));

    return available;
  }

  /**
   * Admin view of all gateway configurations.
   */
  async getAllGatewayConfigs(): Promise<(PaymentGatewayConfigRecord & { hasCredentials: boolean })[]> {
    const rows = await db
      .select()
      .from(paymentGatewayConfigs)
      .orderBy(paymentGatewayConfigs.provider);

    return rows.map((r) => ({
      ...r,
      hasCredentials: this.hasConfiguredCredentials(r.provider),
    }));
  }

  /**
   * Updates a payment gateway's enable status, fees, or environment.
   */
  async updateGatewayConfig(
    provider: string,
    updates: UpdateGatewayConfigInput,
    actorId?: string | null,
  ): Promise<PaymentGatewayConfigRecord> {
    const [existing] = await db
      .select()
      .from(paymentGatewayConfigs)
      .where(eq(paymentGatewayConfigs.provider, provider))
      .limit(1);

    if (!existing) {
      throw new AppError(`Gateway '${provider}' is not registered.`, 404, "gateway_not_found");
    }

    // Validation 1: Prevent enabling a gateway without configured credentials in production
    if (updates.isEnabled === true && process.env.NODE_ENV === "production") {
      const hasCreds = this.hasConfiguredCredentials(provider);
      if (!hasCreds) {
        throw new AppError(
          `Cannot enable gateway '${provider}' because its API credentials are not configured in environment variables.`,
          400,
          "credentials_missing",
        );
      }
    }

    // Validation 2: Guard against disabling all gateways for INR
    if (updates.isEnabled === false && existing.isEnabled) {
      const inrGateways = await db
        .select()
        .from(paymentGatewayConfigs)
        .where(eq(paymentGatewayConfigs.isEnabled, true));

      const remainingINR = inrGateways.filter(
        (g) => g.provider !== provider && (g.supportedCurrencies as string[])?.includes("INR"),
      );

      if (remainingINR.length === 0 && !updates.force) {
        throw new AppError(
          `Disabling '${provider}' would leave INR with no active payment gateways. Pass force=true to proceed with disabling all gateways.`,
          400,
          "all_gateways_disabled_warning",
        );
      }
    }

    // If making this gateway default, unset default on others
    if (updates.isDefault === true) {
      await db
        .update(paymentGatewayConfigs)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(sql`1=1`);
    }

    const [updated] = await db
      .update(paymentGatewayConfigs)
      .set({
        ...(updates.isEnabled !== undefined ? { isEnabled: updates.isEnabled } : {}),
        ...(updates.environment ? { environment: updates.environment } : {}),
        ...(updates.feePercentageBasisPoints !== undefined
          ? { feePercentageBasisPoints: updates.feePercentageBasisPoints }
          : {}),
        ...(updates.fixedFeeCents !== undefined ? { fixedFeeCents: updates.fixedFeeCents } : {}),
        ...(updates.taxRateBasisPoints !== undefined
          ? { taxRateBasisPoints: updates.taxRateBasisPoints }
          : {}),
        ...(updates.feePassingEnabled !== undefined
          ? { feePassingEnabled: updates.feePassingEnabled }
          : {}),
        ...(updates.isDefault !== undefined ? { isDefault: updates.isDefault } : {}),
        updatedAt: new Date(),
      })
      .where(eq(paymentGatewayConfigs.provider, provider))
      .returning();

    await paymentLogger.info("gateway.config_updated", {
      provider,
      actorId: actorId ?? null,
      data: {
        previousEnabled: existing.isEnabled,
        newEnabled: updated.isEnabled,
        environment: updated.environment,
        feePercentage: updated.feePercentageBasisPoints / 100,
      },
    });

    return updated;
  }

  /**
   * Retrieves fee configuration for a provider, prioritizing DB config over fallback env config.
   */
  async getProviderFeeConfig(provider: string): Promise<ProviderFeeConfig> {
    try {
      const [row] = await db
        .select()
        .from(paymentGatewayConfigs)
        .where(eq(paymentGatewayConfigs.provider, provider))
        .limit(1);

      if (row) {
        return {
          feePercentage: row.feePercentageBasisPoints / 100,
          fixedFee: row.fixedFeeCents,
          taxRate: row.taxRateBasisPoints / 100,
          feePassingEnabled: row.feePassingEnabled,
          configVersion: "v1",
        };
      }
    } catch {}

    const envConfig = getPaymentConfig();
    return (
      envConfig.providers[provider as "razorpay" | "cashfree" | "stripe"]?.fee ?? {
        feePercentage: 2.3,
        fixedFee: 0,
        taxRate: 18.0,
        feePassingEnabled: true,
        configVersion: "v1",
      }
    );
  }
}

export const gatewayConfigService = new GatewayConfigService();

