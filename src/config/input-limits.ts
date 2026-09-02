const DESCRIPTION_MAX_LENGTH = 200;
export const FILE_TITLE_MAX_LENGTH = 120;

export const AmountType = {
  Project: "project",
  Revision: "revision",
} as const;

export type AmountType = (typeof AmountType)[keyof typeof AmountType];

export function trimFileTitle(value: string) {
  const trimmed = value.trim();

  return trimmed.length > FILE_TITLE_MAX_LENGTH
    ? trimmed.slice(0, FILE_TITLE_MAX_LENGTH)
    : trimmed;
}

export const INPUT_LIMITS = {
  projectTitle: 80,
  clientName: 60,
  clientEmail: 255,
  deliverableTitle: FILE_TITLE_MAX_LENGTH,
  fileTitle: FILE_TITLE_MAX_LENGTH,
  description: DESCRIPTION_MAX_LENGTH,
  shortDescription: DESCRIPTION_MAX_LENGTH,
} as const;

export const fileSettingsConfig = {
  absoluteMaxRevisionLimit: 99,
  currentUserRevisionLimitPlanMax: 20,

  maxCurrencyAmountCents: 100_000_000, // $1,000,000.00
  maxCurrencyAmount: 1_000_000,

  minimumCurrencyAmountByCurrency: {
    INR: 500,
    USD: 10,
  },

  minimumRevisionAmountByCurrency: {
    INR: 10,
    USD: 2,
  },

  defaultMinimumCurrencyAmount: 10,
  defaultMinimumRevisionAmount: 2,
} as const;

export function getEffectiveMaxRevisionLimit() {
  return Math.min(
    fileSettingsConfig.absoluteMaxRevisionLimit,
    fileSettingsConfig.currentUserRevisionLimitPlanMax,
  );
}

export function getMinimumCurrencyAmount(currency: string, amountType: AmountType) {
  const minimumAmountByCurrency =
    amountType === AmountType.Revision
      ? fileSettingsConfig.minimumRevisionAmountByCurrency
      : fileSettingsConfig.minimumCurrencyAmountByCurrency;
  const defaultMinimumAmount =
    amountType === AmountType.Revision
      ? fileSettingsConfig.defaultMinimumRevisionAmount
      : fileSettingsConfig.defaultMinimumCurrencyAmount;

  return (
    minimumAmountByCurrency[
      currency as keyof typeof minimumAmountByCurrency
    ] ?? defaultMinimumAmount
  );
}

export default INPUT_LIMITS;
