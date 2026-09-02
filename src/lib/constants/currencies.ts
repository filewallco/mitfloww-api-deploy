export const DEFAULT_PROJECT_CURRENCY = "INR";

const FALLBACK_SUPPORTED_CURRENCY_CODES = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "UYU",
  "UZS",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XCD",
  "XOF",
  "XPF",
  "YER",
  "ZAR",
  "ZMW",
] as const;

export type SupportedCurrencyCode = string;

function getRuntimeCurrencyCodes() {
  const intlWithCurrencyValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "currency") => string[];
  };

  try {
    const values = intlWithCurrencyValues.supportedValuesOf?.("currency");

    if (values && values.length > 0) {
      return values;
    }
  } catch {
    // Fall back below.
  }

  return [...FALLBACK_SUPPORTED_CURRENCY_CODES];
}

export function getSupportedCurrencyCodes() {
  const unique = new Set(
    getRuntimeCurrencyCodes()
      .map((code) => code.trim().toUpperCase())
      .filter((code) => /^[A-Z]{3}$/.test(code)),
  );

  unique.add(DEFAULT_PROJECT_CURRENCY);

  return [...unique].sort((left, right) => {
    if (left === DEFAULT_PROJECT_CURRENCY) return -1;
    if (right === DEFAULT_PROJECT_CURRENCY) return 1;
    return left.localeCompare(right);
  });
}

export function normalizeProjectCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();

  return normalized && isSupportedCurrencyCode(normalized)
    ? normalized
    : DEFAULT_PROJECT_CURRENCY;
}

export function isSupportedCurrencyCode(value: string) {
  const normalized = value.trim().toUpperCase();

  return getSupportedCurrencyCodes().includes(normalized);
}

export function getCurrencyOptions(locale = "en") {
  const displayNames =
    typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames([locale], { type: "currency" })
      : null;

  return getSupportedCurrencyCodes().map((code) => {
    const name = displayNames?.of(code) ?? code;

    return {
      code,
      displayLabel: `${code} - ${name}`,
      name,
    };
  });
}