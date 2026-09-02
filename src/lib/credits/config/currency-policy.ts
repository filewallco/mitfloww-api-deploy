import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";

/**
 * These values control how project currency changes credit pricing. They are
 * business-policy settings, not legal compliance settings, so later overrides
 * can be added for commercial reasons without changing calculator call sites.
 */
export const CREDIT_REGIONAL_CURRENCY = DEFAULT_PROJECT_CURRENCY;
export const CREDIT_REGIONAL_MULTIPLIER = 1;
export const CREDIT_DEFAULT_INTERNATIONAL_MULTIPLIER = 1.5;
export const CREDIT_CURRENCY_MULTIPLIER_OVERRIDES: Readonly<
  Partial<Record<string, number>>
> = {};

/**
 * This internal planning value is intentionally not user-facing and must never
 * be exposed through public APIs or UI.
 */
export const CREDIT_INTERNAL_VALUE_INR_MINOR_UNITS = 60;
