import {
  AmountType,
  fileSettingsConfig,
  getEffectiveMaxRevisionLimit,
  getMinimumCurrencyAmount,
} from "@/config/input-limits";

type CurrencyValidationContext = {
  currency: string;
  currencySymbol?: string;
  locale?: string;
};

function formatCurrencyAmountLabel(input: {
  amount: number;
  currency: string;
  currencySymbol?: string;
  locale?: string;
}) {
  const locale = input.locale ?? "en-US";

  if (input.currencySymbol && input.currencySymbol.length > 0) {
    return `${input.currencySymbol}${input.amount.toLocaleString(locale)}`;
  }

  try {
    return new Intl.NumberFormat(locale, {
      currency: input.currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(input.amount) ? 0 : 2,
      style: "currency",
    }).format(input.amount);
  } catch {
    return `${input.currency} ${input.amount.toLocaleString(locale)}`;
  }
}

export function normalizeRevisionLimitInput(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return 0;
  }

  const normalizedValue = trimmedValue.replace(/^0+(?=\d)/, "");
  const revisionLimit = Number(normalizedValue);

  return Number.isFinite(revisionLimit) ? revisionLimit : Number.NaN;
}

export type ValidationMessageResult =
  | null
  | { key: string; vars?: Record<string, string | number> }
  | string;

function withVars(
  key: string,
  vars: Record<string, string | number>,
): ValidationMessageResult {
  return { key, vars };
}

export function getRevisionLimitValidationError(
  revisionLimit: number,
): ValidationMessageResult {
  const effectiveMaxRevisionLimit = getEffectiveMaxRevisionLimit();

  if (!Number.isFinite(revisionLimit)) {
    return { key: "revisionLimitMustBeValidNumber" };
  }

  if (!Number.isInteger(revisionLimit)) {
    return { key: "revisionLimitMustBeWholeNumber" };
  }

  if (revisionLimit < 0) {
    return { key: "revisionLimitCannotBeNegative" };
  }

  if (revisionLimit > effectiveMaxRevisionLimit) {
    return {
      key: "revisionLimitMustBeAtMost",
      vars: { max: effectiveMaxRevisionLimit },
    };
  }

  return null;
}

export function getExtraRevisionCostRequiredMessage(): ValidationMessageResult {
  return { key: "extraRevisionCostRequired" };
}

export function getExtraRevisionCostInvalidMessage(): ValidationMessageResult {
  return { key: "extraRevisionCostInvalid" };
}

export function getExtraRevisionCostValidationError(
  input: {
    extraRevisionCost: number;
    revisionLimit: number;
  } & CurrencyValidationContext,
) {
  const minimumCurrencyAmount = getMinimumCurrencyAmount(
    input.currency,
    AmountType.Revision,
  );
  const minimumCurrencyAmountLabel = formatCurrencyAmountLabel({
    amount: minimumCurrencyAmount,
    currency: input.currency,
    currencySymbol: input.currencySymbol,
    locale: input.locale,
  });
  const maximumCurrencyAmountLabel = formatCurrencyAmountLabel({
    amount: fileSettingsConfig.maxCurrencyAmount,
    currency: input.currency,
    currencySymbol: input.currencySymbol,
    locale: input.locale,
  });
  const extraRevisionCostIsRequired = input.revisionLimit > 0;

  if (!Number.isFinite(input.extraRevisionCost)) {
    return extraRevisionCostIsRequired ? getExtraRevisionCostRequiredMessage() : null;
  }

  if (input.extraRevisionCost < 0) {
    return { key: "extraRevisionCostCannotBeNegative" };
  }

  if (input.extraRevisionCost === 0) {
    return extraRevisionCostIsRequired
      ? withVars("extraRevisionCostMustBeAtLeast", {
          min: minimumCurrencyAmountLabel,
        })
      : null;
  }

  if (input.extraRevisionCost < minimumCurrencyAmount) {
    return extraRevisionCostIsRequired
      ? withVars("extraRevisionCostMustBeAtLeast", {
          min: minimumCurrencyAmountLabel,
        })
      : withVars("extraRevisionCostMustBeAtLeastOrEmpty", {
          min: minimumCurrencyAmountLabel,
        });
  }

  if (input.extraRevisionCost > fileSettingsConfig.maxCurrencyAmount) {
    return withVars("extraRevisionCostMustBeAtMost", {
      max: maximumCurrencyAmountLabel,
    });
  }

  return null;
}

function getProjectAmountValidationLabels(
  input: CurrencyValidationContext,
) {
  const minimumAmount = getMinimumCurrencyAmount(
    input.currency,
    AmountType.Project,
  );
  const minimumAmountLabel = formatCurrencyAmountLabel({
    amount: minimumAmount,
    currency: input.currency,
    currencySymbol: input.currencySymbol,
    locale: input.locale,
  });
  const maximumAmountLabel = formatCurrencyAmountLabel({
    amount: fileSettingsConfig.maxCurrencyAmount,
    currency: input.currency,
    currencySymbol: input.currencySymbol,
    locale: input.locale,
  });

  return {
    maximumAmountLabel,
    minimumAmount,
    minimumAmountLabel,
  };
}

export function getFileAmountValidationError(
  input: {
    amount: number;
    fileName?: string;
  } & CurrencyValidationContext,
) {
  const {
    maximumAmountLabel,
    minimumAmount,
    minimumAmountLabel,
  } = getProjectAmountValidationLabels(input);
  const amountLabelPrefix = input.fileName ? `\"${input.fileName}\" amount` : "File amount";

  if (!Number.isFinite(input.amount)) {

    return input.fileName
      ? withVars("fileAmountRequiredWithName", { name: input.fileName })
      : { key: "fileAmountRequired" };
  }

  if (input.amount < 0) {
    return withVars("fileAmountCannotBeNegative", {
      prefix: amountLabelPrefix,
    });
  }

  if (input.amount === 0) {
    return null;
  }

  if (input.amount < minimumAmount) {
    return withVars("fileAmountMustBeAtLeast", {
      prefix: amountLabelPrefix,
      min: minimumAmountLabel,
    });
  }

  if (input.amount > fileSettingsConfig.maxCurrencyAmount) {
    return withVars("fileAmountMustBeAtMost", {
      prefix: amountLabelPrefix,
      max: maximumAmountLabel,
    });
  }

  return null;
}

export function getProjectAmountValidationError(
  input: {
    amount: number;
  } & CurrencyValidationContext,
) {
  const {
    maximumAmountLabel,
    minimumAmount,
    minimumAmountLabel,
  } = getProjectAmountValidationLabels(input);

  if (!Number.isFinite(input.amount)) {
    return { key: "projectAmountRequired" };
  }

  if (input.amount <= 0) {
    return { key: "projectAmountMustBeGreaterThanZero" };
  }

  if (input.amount < minimumAmount) {
    return withVars("projectAmountMustBeAtLeast", {
      min: minimumAmountLabel,
    });
  }

  if (input.amount > fileSettingsConfig.maxCurrencyAmount) {
    return withVars("projectAmountMustBeAtMost", {
      max: maximumAmountLabel,
    });
  }

  return null;
}
